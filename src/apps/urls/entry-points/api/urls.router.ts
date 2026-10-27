import express, { Request, Response } from 'express'
import authenticate from '../../../auth/entry-points/api/authenticate.middleware'
import urlsService from '../../domain/urls.service'

const router = express.Router()

/**
 * @swagger
 * /urls:
 *   post:
 *     summary: Create a shortened URL
 *     tags: [URLs]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [original_url]
 *             properties:
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
 *         description: Invalid original_url
 *       '401':
 *         description: Missing or invalid access token
 */
router.post('/', authenticate, async (req: Request, res: Response) => {
  const userId = req.user?.id
  const originalUrl = req.body?.original_url

  if (!userId) {
    return res.status(401).json({ error: 'Missing or invalid access token.' })
  }

  try {
    const url = await urlsService.shortenUrl(userId, originalUrl)
    return res.status(201).json(url)
  } catch (error: any) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message })
    }
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
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: User's URLs, newest first
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Url'
 *       '401':
 *         description: Missing or invalid access token
 */
router.get('/', authenticate, async (req: Request, res: Response) => {
  const userId = req.user?.id
  if (!userId) {
    return res.status(401).json({ error: 'Missing or invalid access token.' })
  }

  try {
    const urls = await urlsService.listUrls(userId)
    return res.status(200).json(urls)
  } catch (error: any) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message })
    }
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
router.get('/:code', async (req: Request, res: Response) => {
  try {
    const code = Array.isArray(req.params.code) ? req.params.code[0] : req.params.code
    const originalUrl = await urlsService.resolveUrl(code)
    return res.redirect(302, originalUrl)
  } catch (error: any) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message })
    }
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
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: code
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       '204':
 *         description: URL deleted
 *       '401':
 *         description: Missing or invalid access token
 *       '404':
 *         description: URL not found for this user
 */
router.delete('/:code', authenticate, async (req: Request, res: Response) => {
  const userId = req.user?.id
  if (!userId) {
    return res.status(401).json({ error: 'Missing or invalid access token.' })
  }

  try {
    const code = Array.isArray(req.params.code) ? req.params.code[0] : req.params.code
    await urlsService.deleteUrl(code, userId)
    return res.status(204).end()
  } catch (error: any) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({ error: error.message })
    }
    console.error('Failed to delete URL:', error)
    return res.status(500).json({ error: 'Failed to delete URL.' })
  }
})

export default router
