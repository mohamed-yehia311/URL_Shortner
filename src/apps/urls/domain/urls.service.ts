import crypto from 'crypto'
import urlsRepo, { UrlRecord } from '../data-access/urls.repository'

export interface DomainError extends Error {
  statusCode: number
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function domainError(status: number, message: string): DomainError {
  const err = new Error(message) as DomainError
  err.statusCode = status
  return err
}

export async function shortenUrl(userId: string | number, originalUrl: string): Promise<UrlRecord> {
  if (typeof originalUrl !== 'string' || !isHttpUrl(originalUrl)) {
    throw domainError(400, 'Provide an HTTP or HTTPS original_url.')
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const shortKey = crypto.randomBytes(6).toString('base64url')
    try {
      const url = await urlsRepo.createUrl(userId, originalUrl, shortKey)
      return url
    } catch (error: any) {
      if (error.code === '23503') {
        throw domainError(404, 'User not found.')
      }
      if (error.code !== '23505' || attempt === 2) throw error
      // collision — retry with a new key
    }
  }

  throw domainError(500, 'Failed to generate unique short key.')
}

export async function listUrls(userId: string | number): Promise<UrlRecord[]> {
  return urlsRepo.listUrlsByUser(userId)
}

export async function resolveUrl(shortKey: string): Promise<string> {
  const row = await urlsRepo.findUrlByShortKey(shortKey)
  if (!row) {
    throw domainError(404, 'Short URL not found.')
  }
  return row.original_url
}

export async function deleteUrl(shortKey: string, userId: string | number): Promise<void> {
  const deleted = await urlsRepo.deleteUrl(shortKey, userId)
  if (!deleted) {
    throw domainError(404, 'URL not found for this user.')
  }
}

export default { shortenUrl, listUrls, resolveUrl, deleteUrl }
