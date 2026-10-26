const express = require('express')
const authService = require('../../domain/auth.service')

const router = express.Router()

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

  //  validate username, email, and password
  if (!/^[a-zA-Z0-9_.-]{3,50}$/.test(username)) {
    return res.status(400).json({ error: 'Username must be 3–50 characters and contain only letters, numbers, dots, underscores, or hyphens.' })
  }
  if (email.length > 255 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'A valid email address is required.' })
  }
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    return res.status(400).json({ error: 'Password must be between 8 and 128 characters.' })
  }

  try {
    const session = await authService.register(username, email, password)
    return res.status(201).json(session)
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Email or username is already registered.' })
    }
    console.error('Failed to register user:', error)
    return res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : 'Failed to register user.' })
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
  // validate email and password
  if (!email || typeof password !== 'string') {
    return res.status(400).json({ error: 'Email and password are required.' })
  }

  try {
    const session = await authService.login(email, password)
    return res.status(200).json(session)
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message })
    }
    console.error('Failed to log in:', error)
    return res.status(500).json({ error: 'Failed to log in.' })
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

  try {
    const tokens = await authService.refresh(presentedToken)
    return res.status(200).json(tokens)
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message })
    }
    console.error('Failed to rotate refresh token:', error)
    return res.status(500).json({ error: 'Failed to refresh session.' })
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
    await authService.logout(refreshToken)
    return res.status(204).end()
  } catch (error) {
    console.error('Failed to log out:', error)
    return res.status(500).json({ error: 'Failed to log out.' })
  }
})

module.exports = router
