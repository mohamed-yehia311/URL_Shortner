import request from 'supertest'
import jwt from 'jsonwebtoken'
import app from '../../src/app'
import urlsService from '../../src/apps/urls/domain/urls.service'

jest.mock('../../src/apps/urls/domain/urls.service')

describe('URLs API Integration Tests #api', () => {
  const secret = 'super-secret-key-for-testing-at-least-32-chars-long'
  let consoleErrorSpy: jest.SpyInstance

  const createAuthHeader = (userId: string = '1') => {
    const token = jwt.sign({}, secret, {
      algorithm: 'HS256',
      subject: userId,
      issuer: 'url-shortener-api',
      audience: 'url-shortener-client',
      expiresIn: '15m',
    })
    return `Bearer ${token}`
  }

  beforeEach(() => {
    process.env.ACCESS_TOKEN_SECRET = secret
    jest.clearAllMocks()
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
  })

  describe('POST /urls #URL-SHORTEN #AUTHZ-01 #api #sanity', () => {
    it('When creating a short URL with valid token and URL, under standard conditions, then it should return 201 and created URL record', async () => {
      // Arrange
      const originalUrl = 'https://example.com/very/long/path'
      const createdRecord = {
        id: '1',
        user_id: '1',
        original_url: originalUrl,
        short_key: 'shortKey1',
        created_at: new Date(),
      }
      ;(urlsService.shortenUrl as jest.Mock).mockResolvedValue(createdRecord)

      // Act
      const response = await request(app)
        .post('/urls')
        .set('Authorization', createAuthHeader('1'))
        .send({ original_url: originalUrl })

      // Assert
      // 1. Response verification
      expect(response.status).toBe(201)
      expect(response.body).toEqual({
        ...createdRecord,
        created_at: createdRecord.created_at.toISOString(),
      })
      // 2. Database service call
      expect(urlsService.shortenUrl).toHaveBeenCalledWith('1', originalUrl)
      // 3. Observability
      expect(consoleErrorSpy).not.toHaveBeenCalled()
    })

    it('When creating a short URL without authentication, under unauthenticated scenario, then it should return 401', async () => {
      // Arrange
      const originalUrl = 'https://example.com'

      // Act
      const response = await request(app)
        .post('/urls')
        .send({ original_url: originalUrl })

      // Assert
      expect(response.status).toBe(401)
      expect(urlsService.shortenUrl).not.toHaveBeenCalled()
    })

    it('When shortening service rejects with 400 bad request, under validation scenario, then it should return 400', async () => {
      // Arrange
      const err: any = new Error('Provide an HTTP or HTTPS original_url.')
      err.statusCode = 400
      ;(urlsService.shortenUrl as jest.Mock).mockRejectedValue(err)

      // Act
      const response = await request(app)
        .post('/urls')
        .set('Authorization', createAuthHeader('1'))
        .send({ original_url: 'not-a-url' })

      // Assert
      expect(response.status).toBe(400)
      expect(response.body).toEqual({ error: 'Provide an HTTP or HTTPS original_url.' })
    })

    it('When unexpected server failure occurs, under failure scenario, then it should log and return 500', async () => {
      // Arrange
      const unexpected = new Error('Unexpected crash')
      ;(urlsService.shortenUrl as jest.Mock).mockRejectedValue(unexpected)

      // Act
      const response = await request(app)
        .post('/urls')
        .set('Authorization', createAuthHeader('1'))
        .send({ original_url: 'https://example.com' })

      // Assert
      expect(response.status).toBe(500)
      expect(response.body).toEqual({ error: 'Failed to create URL.' })
      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to create URL:', unexpected)
    })
  })

  describe('GET /urls #AUTHZ-01 #api', () => {
    it('When listing URLs for authenticated user, under authorized conditions, then it should return 200 with URL array', async () => {
      // Arrange
      const userUrls = [
        { id: '1', user_id: '1', original_url: 'https://google.com', short_key: 'k1', created_at: new Date() },
      ]
      ;(urlsService.listUrls as jest.Mock).mockResolvedValue(userUrls)

      // Act
      const response = await request(app)
        .get('/urls')
        .set('Authorization', createAuthHeader('1'))

      // Assert
      expect(response.status).toBe(200)
      expect(response.body).toEqual([
        {
          ...userUrls[0],
          created_at: userUrls[0].created_at.toISOString(),
        },
      ])
      expect(urlsService.listUrls).toHaveBeenCalledWith('1')
    })

    it('When listUrls throws unexpected error, under failure conditions, then it should return 500 and log the error', async () => {
      // Arrange
      const error = new Error('Database query failure')
      ;(urlsService.listUrls as jest.Mock).mockRejectedValue(error)

      // Act
      const response = await request(app)
        .get('/urls')
        .set('Authorization', createAuthHeader('1'))

      // Assert
      expect(response.status).toBe(500)
      expect(response.body).toEqual({ error: 'Failed to list URLs.' })
      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to list URLs:', error)
    })
  })

  describe('GET /urls/:code #URL-REDIRECT #api #sanity', () => {
    it('When accessing short URL redirect, under public resolution conditions, then it should return 302 Redirect with Location header', async () => {
      // Arrange
      const shortCode = 'xyz999'
      const targetUrl = 'https://destination.com/landing'
      ;(urlsService.resolveUrl as jest.Mock).mockResolvedValue(targetUrl)

      // Act
      const response = await request(app).get(`/urls/${shortCode}`)

      // Assert
      // 1. HTTP 302 and redirect header
      expect(response.status).toBe(302)
      expect(response.headers.location).toBe(targetUrl)
      // 2. Service resolution
      expect(urlsService.resolveUrl).toHaveBeenCalledWith(shortCode)
      expect(consoleErrorSpy).not.toHaveBeenCalled()
    })

    it('When short code does not exist, under not found scenario, then it should return 404', async () => {
      // Arrange
      const notFoundErr: any = new Error('Short URL not found.')
      notFoundErr.statusCode = 404
      ;(urlsService.resolveUrl as jest.Mock).mockRejectedValue(notFoundErr)

      // Act
      const response = await request(app).get('/urls/nonexistent')

      // Assert
      expect(response.status).toBe(404)
      expect(response.body).toEqual({ error: 'Short URL not found.' })
    })

    it('When resolveUrl throws unexpected error, under failure scenario, then it should return 500 and log the error', async () => {
      // Arrange
      const unexpected = new Error('Connection pool timeout')
      ;(urlsService.resolveUrl as jest.Mock).mockRejectedValue(unexpected)

      // Act
      const response = await request(app).get('/urls/crashCode')

      // Assert
      expect(response.status).toBe(500)
      expect(response.body).toEqual({ error: 'Failed to resolve short URL.' })
      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to resolve short URL:', unexpected)
    })
  })

  describe('DELETE /urls/:code #URL-DELETE #AUTHZ-01 #AUTHZ-02 #api #security', () => {
    it('When deleting owned URL, under authorized conditions, then it should return 204 No Content', async () => {
      // Arrange
      const shortCode = 'ownKey'
      ;(urlsService.deleteUrl as jest.Mock).mockResolvedValue(undefined)

      // Act
      const response = await request(app)
        .delete(`/urls/${shortCode}`)
        .set('Authorization', createAuthHeader('1'))

      // Assert
      expect(response.status).toBe(204)
      expect(urlsService.deleteUrl).toHaveBeenCalledWith(shortCode, '1')
      expect(consoleErrorSpy).not.toHaveBeenCalled()
    })

    it('When deleting a URL owned by another user (IDOR prevention), under unauthorized scenario, then it should return 404', async () => {
      // Arrange
      const forbiddenErr: any = new Error('URL not found for this user.')
      forbiddenErr.statusCode = 404
      ;(urlsService.deleteUrl as jest.Mock).mockRejectedValue(forbiddenErr)

      // Act
      const response = await request(app)
        .delete('/urls/otherUserKey')
        .set('Authorization', createAuthHeader('2'))

      // Assert
      expect(response.status).toBe(404)
      expect(response.body).toEqual({ error: 'URL not found for this user.' })
    })

    it('When deleteUrl throws unexpected error, under failure scenario, then it should return 500 and log the error', async () => {
      // Arrange
      const unexpected = new Error('DB write conflict')
      ;(urlsService.deleteUrl as jest.Mock).mockRejectedValue(unexpected)

      // Act
      const response = await request(app)
        .delete('/urls/crashKey')
        .set('Authorization', createAuthHeader('1'))

      // Assert
      expect(response.status).toBe(500)
      expect(response.body).toEqual({ error: 'Failed to delete URL.' })
      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to delete URL:', unexpected)
    })
  })
})
