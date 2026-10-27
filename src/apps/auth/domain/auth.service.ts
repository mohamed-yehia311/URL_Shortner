import argon2 from 'argon2'
import jwt from 'jsonwebtoken'
import { randomUUID } from 'crypto'
import pool from '../../../db'
import authRepo, { UserRecord } from '../data-access/auth.repository'

const ACCESS_TOKEN_LIFETIME = '15m'
const REFRESH_TOKEN_LIFETIME_SECONDS = (30 * 24 * 60 * 60 * 1000) / 1000

export interface AuthenticatedSession {
  user: UserRecord
  access_token: string
  token_type: 'Bearer'
  expires_in: number
  refresh_token: string
  refresh_expires_in: number
}

export interface RefreshedTokens {
  access_token: string
  token_type: 'Bearer'
  expires_in: number
  refresh_token: string
  refresh_expires_in: number
}

export interface DomainError extends Error {
  statusCode: number
}

function getAccessTokenSecret(): string {
  return (process.env.ACCESS_TOKEN_SECRET || process.env.ACCESS_TOEK_SECRET) as string
}

function validateConfiguration(): void {
  if (!getAccessTokenSecret()) {
    throw new Error('ACCESS_TOKEN_SECRET must be configured.')
  }
}

function createAccessToken(user: { id: string | number }): string {
  return jwt.sign({}, getAccessTokenSecret(), {
    algorithm: 'HS256',
    subject: String(user.id),
    issuer: 'url-shortener-api',
    audience: 'url-shortener-client',
    expiresIn: ACCESS_TOKEN_LIFETIME,
  })
}

function domainError(status: number, message: string): DomainError {
  const err = new Error(message) as DomainError
  err.statusCode = status
  return err
}

export async function register(
  username: string,
  email: string,
  password: string,
): Promise<AuthenticatedSession> {
  validateConfiguration()
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id })
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const user = await authRepo.createUser(client, username, email, passwordHash)
    const refreshToken = await authRepo.storeRefreshToken(client, user.id, randomUUID())
    await client.query('COMMIT')
    return {
      user,
      access_token: createAccessToken(user),
      token_type: 'Bearer',
      expires_in: 900,
      refresh_token: refreshToken,
      refresh_expires_in: REFRESH_TOKEN_LIFETIME_SECONDS,
    }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

export async function login(email: string, password: string): Promise<AuthenticatedSession> {
  validateConfiguration()
  const userWithHash = await authRepo.findUserByEmail(email)
  if (!userWithHash || !(await argon2.verify(userWithHash.password_hash, password))) {
    throw domainError(401, 'Email or password is incorrect.')
  }

  const user: UserRecord = {
    id: userWithHash.id,
    username: userWithHash.username,
    email: userWithHash.email,
    created_at: userWithHash.created_at,
  }
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const refreshToken = await authRepo.storeRefreshToken(client, user.id, randomUUID())
    await client.query('COMMIT')
    return {
      user,
      access_token: createAccessToken(user),
      token_type: 'Bearer',
      expires_in: 900,
      refresh_token: refreshToken,
      refresh_expires_in: REFRESH_TOKEN_LIFETIME_SECONDS,
    }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

export async function refresh(presentedToken: string): Promise<RefreshedTokens> {
  validateConfiguration()
  const client = await pool.connect()
  let txDone = false

  try {
    await client.query('BEGIN')

    const session = await authRepo.findRefreshToken(
      client,
      authRepo.hashRefreshToken(presentedToken),
    )

    if (!session) {
      txDone = true
      await client.query('ROLLBACK')
      throw domainError(401, 'Refresh token is invalid or expired.')
    }
    if (session.revoked_at) {
      await authRepo.revokeTokensByFamily(client, session.family_id)
      await client.query('COMMIT')
      txDone = true
      throw domainError(401, 'Refresh token reuse detected; this session has been revoked.')
    }

    if (new Date(session.expires_at) <= new Date()) {
      await authRepo.revokeRefreshToken(client, session.id)
      await client.query('COMMIT')
      txDone = true
      throw domainError(401, 'Refresh token is invalid or expired.')
    }

    await authRepo.revokeRefreshToken(client, session.id)
    const newRefreshToken = await authRepo.storeRefreshToken(client, session.user_id, session.family_id)
    const user = await authRepo.findUserById(client, session.user_id)

    if (!user) {
      txDone = true
      await client.query('ROLLBACK')
      throw domainError(401, 'User account no longer exists.')
    }

    await client.query('COMMIT')
    txDone = true

    return {
      access_token: createAccessToken(user),
      token_type: 'Bearer',
      expires_in: 900,
      refresh_token: newRefreshToken,
      refresh_expires_in: REFRESH_TOKEN_LIFETIME_SECONDS,
    }
  } catch (error) {
    if (!txDone) {
      await client.query('ROLLBACK').catch(() => {})
    }
    throw error
  } finally {
    client.release()
  }
}

export async function logout(refreshToken: string): Promise<void> {
  if (typeof refreshToken !== 'string') return
  await authRepo.revokeRefreshTokenByHash(refreshToken)
}

export default { register, login, refresh, logout }
