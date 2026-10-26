const crypto = require('crypto')
const pool = require('../../../db')

const REFRESH_TOKEN_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000

function generateRefreshToken() {
  return crypto.randomBytes(48).toString('base64url')
}

function hashRefreshToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

async function createUser(client, username, email, passwordHash) {
  const result = await client.query(
    `INSERT INTO users (username, email, password_hash)
     VALUES ($1, $2, $3)
     RETURNING id, username, email, created_at`,
    [username, email, passwordHash],
  )
  return result.rows[0]
}

async function findUserByEmail(email) {
  const result = await pool.query(
    'SELECT id, username, email, password_hash, created_at FROM users WHERE lower(email) = $1',
    [email],
  )
  return result.rows[0]
}

async function findUserById(client, userId) {
  const result = await client.query(
    'SELECT id, username, email FROM users WHERE id = $1',
    [userId],
  )
  return result.rows[0]
}

async function storeRefreshToken(client, userId, familyId) {
  const token = generateRefreshToken()
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_LIFETIME_MS)
  await client.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, family_id, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [userId, hashRefreshToken(token), familyId, expiresAt],
  )
  return token
}

async function findRefreshToken(client, tokenHash) {
  const result = await client.query(
    `SELECT id, user_id, family_id, expires_at, revoked_at
     FROM refresh_tokens
     WHERE token_hash = $1
     FOR UPDATE`,
    [tokenHash],
  )
  return result.rows[0]
}

async function revokeTokensByFamily(client, familyId) {
  await client.query(
    'UPDATE refresh_tokens SET revoked_at = COALESCE(revoked_at, NOW()) WHERE family_id = $1',
    [familyId],
  )
}

async function revokeRefreshToken(client, id) {
  await client.query(
    'UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1',
    [id],
  )
}

async function revokeRefreshTokenByHash(tokenHash) {
  await pool.query(
    'UPDATE refresh_tokens SET revoked_at = COALESCE(revoked_at, NOW()) WHERE token_hash = $1',
    [hashRefreshToken(tokenHash)],
  )
}

module.exports = {
  createUser,
  findUserByEmail,
  findUserById,
  storeRefreshToken,
  findRefreshToken,
  revokeTokensByFamily,
  revokeRefreshToken,
  revokeRefreshTokenByHash,
  hashRefreshToken,
}
