const crypto = require('crypto')
const express = require('express')
const pool = require('../db')

const router = express.Router()

function parseUserId(value) {
  if (!/^\d+$/.test(String(value || ''))) return null
  const userId = Number(value)
  return Number.isSafeInteger(userId) && userId > 0 ? userId : null
}

function isHttpUrl(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * @swagger
 * /urls:
 *   post:
 *     summary: Create a shortened URL
 *     tags: [URLs]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [user_id, original_url]
 *             properties:
 *               user_id:
 *                 type: integer
 *                 example: 1
 *               original_url:
 *                 type: string
 *                 format: uri
 *                 example: https://example.com/some/long/path
 *     responses:
 *       '201':
 *         description: URL created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Url'
 *       '400':
 *         description: Invalid user_id or original_url
 *       '404':
 *         description: User does not exist
 */
router.post('/', async (req, res) => {
  const userId = parseUserId(req.body?.user_id)
  const originalUrl = req.body?.original_url

  if (!userId || typeof originalUrl !== 'string' || !isHttpUrl(originalUrl)) {
    return res.status(400).json({
      error: 'Provide a positive integer user_id and an HTTP or HTTPS original_url.',
    })
  }

  try {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const shortCode = crypto.randomBytes(6).toString('base64url')
      try {
        const result = await pool.query(
          `INSERT INTO urls (user_id, original_url, short_key)
           VALUES ($1, $2, $3)
           RETURNING id, user_id, original_url, short_key, created_at`,
          [userId, originalUrl, shortCode],
        )
        return res.status(201).json(result.rows[0])
      } catch (error) {
        if (error.code === '23503') {
          return res.status(404).json({ error: 'User not found.' })
        }
        if (error.code !== '23505' || attempt === 2) throw error
      }
    }
  } catch (error) {
    console.error('Failed to create URL:', error)
    return res.status(500).json({ error: 'Failed to create URL.' })
  }
})

/**
 * @swagger
 * /urls:
 *   get:
 *     summary: List URLs belonging to a user
 *     tags: [URLs]
 *     parameters:
 *       - in: query
 *         name: user_id
 *         required: true
 *         schema:
 *           type: integer
 *         example: 1
 *     responses:
 *       '200':
 *         description: User's URLs, newest first
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Url'
 *       '400':
 *         description: Invalid or missing user_id
 */
router.get('/', async (req, res) => {
  const userId = parseUserId(req.query.user_id)
  if (!userId) {
    return res.status(400).json({ error: 'A positive integer user_id query parameter is required.' })
  }

  try {
    const result = await pool.query(
      `SELECT id, user_id, original_url, short_key, created_at
       FROM urls
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId],
    )
    return res.status(200).json(result.rows)
  } catch (error) {
    console.error('Failed to list URLs:', error)
    return res.status(500).json({ error: 'Failed to list URLs.' })
  }
})

/**
 * @swagger
 * /urls/{code}:
 *   get:
 *     summary: Redirect to the original URL for a short code
 *     tags: [URLs]
 *     parameters:
 *       - in: path
 *         name: code
 *         required: true
 *         schema:
 *           type: string
 *         example: abc123
 *     responses:
 *       '302':
 *         description: Redirect to the original URL
 *       '404':
 *         description: Short code not found
 */
router.get('/:code', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT original_url FROM urls WHERE short_key = $1',
      [req.params.code],
    )
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Short URL not found.' })
    }
    return res.redirect(302, result.rows[0].original_url)
  } catch (error) {
    console.error('Failed to resolve short URL:', error)
    return res.status(500).json({ error: 'Failed to resolve short URL.' })
  }
})

/**
 * @swagger
 * /urls/{code}:
 *   delete:
 *     summary: Delete one of a user's shortened URLs
 *     tags: [URLs]
 *     parameters:
 *       - in: path
 *         name: code
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: user_id
 *         required: true
 *         schema:
 *           type: integer
 *         example: 1
 *     responses:
 *       '204':
 *         description: URL deleted
 *       '400':
 *         description: Invalid or missing user_id
 *       '404':
 *         description: URL not found for this user
 */
router.delete('/:code', async (req, res) => {
  const userId = parseUserId(req.query.user_id)
  if (!userId) {
    return res.status(400).json({ error: 'A positive integer user_id query parameter is required.' })
  }

  try {
    const result = await pool.query(
      'DELETE FROM urls WHERE short_key = $1 AND user_id = $2 RETURNING id',
      [req.params.code, userId],
    )
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'URL not found for this user.' })
    }
    return res.status(204).end()
  } catch (error) {
    console.error('Failed to delete URL:', error)
    return res.status(500).json({ error: 'Failed to delete URL.' })
  }
})

module.exports = router