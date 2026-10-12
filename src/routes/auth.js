const argon2 = require('argon2')
const crypto = require('crypto')
const express = require('express')
const jwt = require('jsonwebtoken')
const { randomUUID } = require('crypto')
const pool = require('../db')

const router = express.Router()
const ACCESS_TOKEN_LIFETIME = '15m'
const REFRESH_TOKEN_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000
const REFRESH_TOKEN_LIFETIME_SECONDS = REFRESH_TOKEN_LIFETIME_MS / 1000

function createAccessToken(user) {
  return jwt.sign({}, getAccessTokenSecret(), {
    algorithm: 'HS256',
    subject: String(user.id),
    issuer: 'url-shortener-api',
    audience: 'url-shortener-client',
    expiresIn: ACCESS_TOKEN_LIFETIME,
  })
}

function generateRefreshToken() {
  return crypto.randomBytes(48).toString('base64url')
}

function hashRefreshToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

function validateCredentialsConfiguration() {
  if (!getAccessTokenSecret()) {
    throw new Error('ACCESS_TOKEN_SECRET must be configured.')
  }
}

function getAccessTokenSecret() {
  return process.env.ACCESS_TOKEN_SECRET || process.env.ACCESS_TOEK_SECRET
}

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Register a user
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, email, password]
 *             properties:
 *               username:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 50
 *                 example: sam
 *               email:
 *                 type: string
 *                 format: email
 *                 example: sam@example.com
 *               password:
 *                 type: string
 *                 format: password
 *                 minLength: 8
 *     responses:
 *       '201':
 *         description: User registered; credentials returned for the new session
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthenticatedSession'
 *       '400':
 *         description: Invalid input
 *       '409':
 *         description: Email or username is already registered
 */
router.post('/register', async (req, res) => {
  const username = typeof req.body?.username === 'string' ? req.body.username.trim() : ''
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : ''
  const password = req.body?.password

  if (!/^[a-zA-Z0-9_.-]{3,50}$/.test(username)) {
    return res.status(400).json({ error: 'Username must be 3–50 characters and contain only letters, numbers, dots, underscores, or hyphens.' })
  }
  if (email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'A valid email address is required.' })
  }
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    return res.status(400).json({ error: 'Password must be between 8 and 128 characters.' })
  }

  let client
  try {
    validateCredentialsConfiguration()
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id })
    client = await pool.connect()
    await client.query('BEGIN')
    const userResult = await client.query(
      `INSERT INTO users (username, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, username, email, created_at`,
      [username, email, passwordHash],
    )
    const user = userResult.rows[0]
    const refreshToken = await storeRefreshToken(client, user.id, randomUUID())
    await client.query('COMMIT')

    return res.status(201).json({
      user,
      access_token: createAccessToken(user),
      token_type: 'Bearer',
      expires_in: 900,
      refresh_token: refreshToken,
      refresh_expires_in: REFRESH_TOKEN_LIFETIME_SECONDS,
    })
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {})
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Email or username is already registered.' })
    }
    console.error('Failed to register user:', error)
    return res.status(500).json({ error: 'Failed to register user.' })
  } finally {
    client?.release()
  }
})

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Log in and create a token session
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: sam@example.com
 *               password:
 *                 type: string
 *                 format: password
 *     responses:
 *       '200':
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthenticatedSession'
 *       '401':
 *         description: Email or password is incorrect
 */
router.post('/login', async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : ''
  const password = req.body?.password
  if (!email || typeof password !== 'string') {
    return res.status(400).json({ error: 'Email and password are required.' })
  }

  let client
  try {
    validateCredentialsConfiguration()
    const result = await pool.query(
      'SELECT id, username, email, password_hash, created_at FROM users WHERE lower(email) = $1',
      [email],
    )
    const userWithHash = result.rows[0]
    if (!userWithHash || !(await argon2.verify(userWithHash.password_hash, password))) {
      return res.status(401).json({ error: 'Email or password is incorrect.' })
    }

    const user = {
      id: userWithHash.id,
      username: userWithHash.username,
      email: userWithHash.email,
      created_at: userWithHash.created_at,
    }
    client = await pool.connect()
    await client.query('BEGIN')
    const refreshToken = await storeRefreshToken(client, user.id, randomUUID())
    await client.query('COMMIT')
    return res.status(200).json({
      user,
      access_token: createAccessToken(user),
      token_type: 'Bearer',
      expires_in: 900,
      refresh_token: refreshToken,
      refresh_expires_in: REFRESH_TOKEN_LIFETIME_SECONDS,
    })
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {})
    console.error('Failed to log in:', error)
    return res.status(500).json({ error: 'Failed to log in.' })
  } finally {
    client?.release()
  }
})

/**
 * @swagger
 * /auth/refresh:
 *   post:
 *     summary: Rotate a refresh token and issue a new access token
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refresh_token]
 *             properties:
 *               refresh_token:
 *                 type: string
 *     responses:
 *       '200':
 *         description: Tokens rotated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/RefreshedTokens'
 *       '401':
 *         description: Refresh token is invalid, expired, revoked, or reused
 */
router.post('/refresh', async (req, res) => {
  const presentedToken = req.body?.refresh_token
  if (typeof presentedToken !== 'string' || presentedToken.length < 32) {
    return res.status(401).json({ error: 'A valid refresh token is required.' })
  }

  let client
  try {
    validateCredentialsConfiguration()
    client = await pool.connect()
    await client.query('BEGIN')
    const tokenResult = await client.query(
      `SELECT id, user_id, family_id, expires_at, revoked_at
       FROM refresh_tokens
       WHERE token_hash = $1
       FOR UPDATE`,
      [hashRefreshToken(presentedToken)],
    )
    const session = tokenResult.rows[0]
    if (!session) {
      await client.query('ROLLBACK')
      return res.status(401).json({ error: 'Refresh token is invalid or expired.' })
    }

    if (session.revoked_at) {
      await client.query(
        'UPDATE refresh_tokens SET revoked_at = COALESCE(revoked_at, NOW()) WHERE family_id = $1',
        [session.family_id],
      )
      await client.query('COMMIT')
      return res.status(401).json({ error: 'Refresh token reuse detected; this session has been revoked.' })
    }

    if (new Date(session.expires_at) <= new Date()) {
      await client.query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1', [session.id])
      await client.query('COMMIT')
      return res.status(401).json({ error: 'Refresh token is invalid or expired.' })
    }

    await client.query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1', [session.id])
    const refreshToken = await storeRefreshToken(client, session.user_id, session.family_id)
    const userResult = await client.query(
      'SELECT id, username, email FROM users WHERE id = $1',
      [session.user_id],
    )
    if (userResult.rowCount === 0) {
      await client.query('ROLLBACK')
      return res.status(401).json({ error: 'User account no longer exists.' })
    }
    await client.query('COMMIT')
    return res.status(200).json({
      access_token: createAccessToken(userResult.rows[0]),
      token_type: 'Bearer',
      expires_in: 900,
      refresh_token: refreshToken,
      refresh_expires_in: REFRESH_TOKEN_LIFETIME_SECONDS,
    })
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {})
    console.error('Failed to rotate refresh token:', error)
    return res.status(500).json({ error: 'Failed to refresh session.' })
  } finally {
    client?.release()
  }
})

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     summary: Revoke a refresh token and log out its session
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refresh_token]
 *             properties:
 *               refresh_token:
 *                 type: string
 *     responses:
 *       '204':
 *         description: Session revoked
 */
router.post('/logout', async (req, res) => {
  const refreshToken = req.body?.refresh_token
  if (typeof refreshToken !== 'string') {
    return res.status(204).end()
  }
  try {
    await pool.query(
      'UPDATE refresh_tokens SET revoked_at = COALESCE(revoked_at, NOW()) WHERE token_hash = $1',
      [hashRefreshToken(refreshToken)],
    )
    return res.status(204).end()
  } catch (error) {
    console.error('Failed to log out:', error)
    return res.status(500).json({ error: 'Failed to log out.' })
  }
})

async function storeRefreshToken(client, userId, familyId) {
  const refreshToken = generateRefreshToken()
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_LIFETIME_MS)
  await client.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, family_id, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [userId, hashRefreshToken(refreshToken), familyId, expiresAt],
  )
  return refreshToken
}

module.exports = router
