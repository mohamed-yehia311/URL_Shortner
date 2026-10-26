const crypto = require('crypto')
const urlsRepo = require('../data-access/urls.repository')

function isHttpUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function domainError(status, message) {
  const err = new Error(message)
  err.statusCode = status
  return err
}

async function shortenUrl(userId, originalUrl) {
  if (typeof originalUrl !== 'string' || !isHttpUrl(originalUrl)) {
    throw domainError(400, 'Provide an HTTP or HTTPS original_url.')
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const shortKey = crypto.randomBytes(6).toString('base64url')
    try {
      const url = await urlsRepo.createUrl(userId, originalUrl, shortKey)
      return url
    } catch (error) {
      if (error.code === '23503') {
        throw domainError(404, 'User not found.')
      }
      if (error.code !== '23505' || attempt === 2) throw error
      // collision — retry with a new key
    }
  }
}

async function listUrls(userId) {
  return urlsRepo.listUrlsByUser(userId)
}

async function resolveUrl(shortKey) {
  const row = await urlsRepo.findUrlByShortKey(shortKey)
  if (!row) {
    throw domainError(404, 'Short URL not found.')
  }
  return row.original_url
}

async function deleteUrl(shortKey, userId) {
  const deleted = await urlsRepo.deleteUrl(shortKey, userId)
  if (!deleted) {
    throw domainError(404, 'URL not found for this user.')
  }
}

module.exports = { shortenUrl, listUrls, resolveUrl, deleteUrl }
