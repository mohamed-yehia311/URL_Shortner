import crypto from 'crypto'
import { PoolClient } from 'pg'
import pool from '../../../db'

const REFRESH_TOKEN_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000

export interface UserRecord {
  id: string | number
  username: string
  email: string
  created_at: Date | string
}

export interface UserWithPasswordHash extends UserRecord {
  password_hash: string
}

export interface RefreshTokenRecord {
  id: string | number
  user_id: string | number
  family_id: string
  expires_at: Date | string
  revoked_at: Date | string | null
}

export function generateRefreshToken(): string {
  return crypto.randomBytes(48).toString('base64url')
}

export function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

export async function createUser(
  client: PoolClient,
  username: string,
  email: string,
  passwordHash: string,
): Promise<UserRecord> {
  const result = await client.query(
    `INSERT INTO users (username, email, password_hash)
     VALUES ($1, $2, $3)
     RETURNING id, username, email, created_at`,
    [username, email, passwordHash],
  )
  return result.rows[0]
}

export async function findUserByEmail(email: string): Promise<UserWithPasswordHash | undefined> {
  const result = await pool.query(
    'SELECT id, username, email, password_hash, created_at FROM users WHERE lower(email) = $1',
    [email],
  )
  return result.rows[0]
}

export async function findUserById(client: PoolClient, userId: string | number): Promise<UserRecord | undefined> {
  const result = await client.query(
    'SELECT id, username, email FROM users WHERE id = $1',
    [userId],
  )
  return result.rows[0]
}

export async function storeRefreshToken(
  client: PoolClient,
  userId: string | number,
  familyId: string,
): Promise<string> {
  const token = generateRefreshToken()
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_LIFETIME_MS)
  await client.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, family_id, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [userId, hashRefreshToken(token), familyId, expiresAt],
  )
  return token
}

export async function findRefreshToken(
  client: PoolClient,
  tokenHash: string,
): Promise<RefreshTokenRecord | undefined> {
  const result = await client.query(
    `SELECT id, user_id, family_id, expires_at, revoked_at
     FROM refresh_tokens
     WHERE token_hash = $1
     FOR UPDATE`,
    [tokenHash],
  )
  return result.rows[0]
}

export async function revokeTokensByFamily(client: PoolClient, familyId: string): Promise<void> {
  await client.query(
    'UPDATE refresh_tokens SET revoked_at = COALESCE(revoked_at, NOW()) WHERE family_id = $1',
    [familyId],
  )
}

export async function revokeRefreshToken(client: PoolClient, id: string | number): Promise<void> {
  await client.query(
    'UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1',
    [id],
  )
}

export async function revokeRefreshTokenByHash(tokenHash: string): Promise<void> {
  await pool.query(
    'UPDATE refresh_tokens SET revoked_at = COALESCE(revoked_at, NOW()) WHERE token_hash = $1',
    [hashRefreshToken(tokenHash)],
  )
}

export default {
  createUser,
  findUserByEmail,
  findUserById,
  storeRefreshToken,
  findRefreshToken,
  revokeTokensByFamily,
  revokeRefreshToken,
  revokeRefreshTokenByHash,
  hashRefreshToken,
  generateRefreshToken,
}
