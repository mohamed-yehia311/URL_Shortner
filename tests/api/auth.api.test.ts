import request from 'supertest'
import app from '../../src/app'
import authService from '../../src/apps/auth/domain/auth.service'

jest.mock('../../src/apps/auth/domain/auth.service')

describe('Auth API Integration Tests #api', () => {
  let consoleErrorSpy: jest.SpyInstance

  beforeEach(() => {
    process.env.ACCESS_TOKEN_SECRET = 'super-secret-key-for-testing-at-least-32-chars-long'
    jest.clearAllMocks()
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
  })

  describe('POST /auth/register #AUTH-01 #AUTH-02 #AUTH-03 #AUTH-04 #AUTH-05 #api #sanity', () => {
    it('When registering with valid body, under standard circumstances, then it should return 201 with session and record no errors in logs', async () => {
      // Arrange
      const payload = {
        username: 'sam_smith',
        email: 'sam@example.com',
        password: 'ValidSecurePassword123!',
      }
      const mockSession = {
        user: { id: '1', username: 'sam_smith', email: 'sam@example.com', created_at: new Date() },
        access_token: 'fake-access-token',
        token_type: 'Bearer',
        expires_in: 900,
        refresh_token: 'fake-refresh-token',
        refresh_expires_in: 2592000,
      }
      ;(authService.register as jest.Mock).mockResolvedValue(mockSession)

      // Act
      const response = await request(app)
        .post('/auth/register')
        .send(payload)

      // Assert
      // 1. Response status and data
      expect(response.status).toBe(201)
      expect(response.body).toEqual({
        ...mockSession,
        user: {
          ...mockSession.user,
          created_at: mockSession.user.created_at.toISOString(),
        },
      })
      // 2. Database service layer interaction
      expect(authService.register).toHaveBeenCalledWith('sam_smith', 'sam@example.com', 'ValidSecurePassword123!')
      // 3. Observability
      expect(consoleErrorSpy).not.toHaveBeenCalled()
    })

    it('When registering with invalid username format (<3 chars), under input validation error scenario, then it should return 400', async () => {
      // Arrange
      const payload = {
        username: 'ab',
        email: 'valid@example.com',
        password: 'ValidSecurePassword123!',
      }

      // Act
      const response = await request(app)
        .post('/auth/register')
        .send(payload)

      // Assert
      expect(response.status).toBe(400)
      expect(response.body).toEqual({
        error: 'Username must be 3–50 characters and contain only letters, numbers, dots, underscores, or hyphens.',
      })
      expect(authService.register).not.toHaveBeenCalled()
    })

    it('When registering with invalid email, under input validation error scenario, then it should return 400', async () => {
      // Arrange
      const payload = {
        username: 'sam_smith',
        email: 'invalid-email-format',
        password: 'ValidSecurePassword123!',
      }

      // Act
      const response = await request(app)
        .post('/auth/register')
        .send(payload)

      // Assert
      expect(response.status).toBe(400)
      expect(response.body).toEqual({ error: 'A valid email address is required.' })
      expect(authService.register).not.toHaveBeenCalled()
    })

    it('When registering with short password (< 8 chars), under password policy scenario, then it should return 400', async () => {
      // Arrange
      const payload = {
        username: 'sam_smith',
        email: 'sam@example.com',
        password: 'short',
      }

      // Act
      const response = await request(app)
        .post('/auth/register')
        .send(payload)

      // Assert
      expect(response.status).toBe(400)
      expect(response.body).toEqual({ error: 'Password must be between 8 and 128 characters.' })
      expect(authService.register).not.toHaveBeenCalled()
    })

    it('When registering with duplicate email/username (23505), under uniqueness constraint conflict scenario, then it should return 409', async () => {
      // Arrange
      const payload = {
        username: 'existing_user',
        email: 'existing@example.com',
        password: 'ValidSecurePassword123!',
      }
      const duplicateError: any = new Error('duplicate key value violates unique constraint')
      duplicateError.code = '23505'
      ;(authService.register as jest.Mock).mockRejectedValue(duplicateError)

      // Act
      const response = await request(app)
        .post('/auth/register')
        .send(payload)

      // Assert
      expect(response.status).toBe(409)
      expect(response.body).toEqual({ error: 'Email or username is already registered.' })
    })

    it('When unexpected server error occurs during registration, under error conditions, then it should log the error and return 500', async () => {
      // Arrange
      const payload = {
        username: 'sam_smith',
        email: 'sam@example.com',
        password: 'ValidSecurePassword123!',
      }
      const unexpectedError = new Error('Disk full')
      ;(authService.register as jest.Mock).mockRejectedValue(unexpectedError)

      // Act
      const response = await request(app)
        .post('/auth/register')
        .send(payload)

      // Assert
      expect(response.status).toBe(500)
      expect(response.body).toEqual({ error: 'Failed to register user.' })
      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to register user:', unexpectedError)
    })
  })

  describe('POST /auth/login #AUTH-03 #AUTH-05 #AUTH-07 #api #sanity', () => {
    it('When logging in with valid credentials, under standard circumstances, then it should return 200 with authenticated session', async () => {
      // Arrange
      const payload = {
        email: 'user@example.com',
        password: 'Password123!',
      }
      const mockSession = {
        user: { id: '3', username: 'user', email: 'user@example.com', created_at: new Date() },
        access_token: 'fake-jwt',
        token_type: 'Bearer',
        expires_in: 900,
        refresh_token: 'fake-refresh',
        refresh_expires_in: 2592000,
      }
      ;(authService.login as jest.Mock).mockResolvedValue(mockSession)

      // Act
      const response = await request(app)
        .post('/auth/login')
        .send(payload)

      // Assert
      expect(response.status).toBe(200)
      expect(response.body.access_token).toBe('fake-jwt')
      expect(authService.login).toHaveBeenCalledWith('user@example.com', 'Password123!')
      expect(consoleErrorSpy).not.toHaveBeenCalled()
    })

    it('When logging in with missing credentials, under validation scenario, then it should return 400', async () => {
      // Arrange & Act
      const response = await request(app)
        .post('/auth/login')
        .send({})

      // Assert
      expect(response.status).toBe(400)
      expect(response.body).toEqual({ error: 'Email and password are required.' })
      expect(authService.login).not.toHaveBeenCalled()
    })

    it('When login fails due to incorrect credentials (401), under failed authentication scenario, then it should return 401 with generic error message', async () => {
      // Arrange
      const domainErr: any = new Error('Email or password is incorrect.')
      domainErr.statusCode = 401
      ;(authService.login as jest.Mock).mockRejectedValue(domainErr)

      // Act
      const response = await request(app)
        .post('/auth/login')
        .send({ email: 'user@example.com', password: 'wrong' })

      // Assert
      expect(response.status).toBe(401)
      expect(response.body).toEqual({ error: 'Email or password is incorrect.' })
      expect(consoleErrorSpy).not.toHaveBeenCalled()
    })
  })

  describe('POST /auth/refresh #AUTH-REFRESH #security #api', () => {
    it('When refreshing with valid refresh token, under valid session scenario, then it should return 200 and rotated tokens', async () => {
      // Arrange
      const validToken = 'valid-refresh-token-present-32-chars-long'
      const mockRotated = {
        access_token: 'new-access-jwt',
        token_type: 'Bearer',
        expires_in: 900,
        refresh_token: 'new-refresh-token',
        refresh_expires_in: 2592000,
      }
      ;(authService.refresh as jest.Mock).mockResolvedValue(mockRotated)

      // Act
      const response = await request(app)
        .post('/auth/refresh')
        .send({ refresh_token: validToken })

      // Assert
      expect(response.status).toBe(200)
      expect(response.body).toEqual(mockRotated)
      expect(authService.refresh).toHaveBeenCalledWith(validToken)
    })

    it('When refreshing with invalid/short token, under validation scenario, then it should return 401', async () => {
      // Arrange & Act
      const response = await request(app)
        .post('/auth/refresh')
        .send({ refresh_token: 'too-short' })

      // Assert
      expect(response.status).toBe(401)
      expect(response.body).toEqual({ error: 'A valid refresh token is required.' })
      expect(authService.refresh).not.toHaveBeenCalled()
    })
  })

  describe('POST /auth/logout #AUTH-LOGOUT #api', () => {
    it('When logging out, with a refresh token, then it should return 204 No Content and call authService.logout', async () => {
      // Arrange
      const token = 'token-to-revoke-12345678901234567890'
      ;(authService.logout as jest.Mock).mockResolvedValue(undefined)

      // Act
      const response = await request(app)
        .post('/auth/logout')
        .send({ refresh_token: token })

      // Assert
      expect(response.status).toBe(204)
      expect(authService.logout).toHaveBeenCalledWith(token)
    })

    it('When logging out without a string refresh_token, under invalid input scenario, then it should return 204', async () => {
      // Arrange & Act
      const response = await request(app)
        .post('/auth/logout')
        .send({})

      // Assert
      expect(response.status).toBe(204)
      expect(authService.logout).not.toHaveBeenCalled()
    })

    it('When unexpected error occurs during logout, under error condition, then it should return 500 and log the error', async () => {
      // Arrange
      const token = 'token-to-revoke-12345678901234567890'
      const error = new Error('Database disconnect during logout')
      ;(authService.logout as jest.Mock).mockRejectedValue(error)

      // Act
      const response = await request(app)
        .post('/auth/logout')
        .send({ refresh_token: token })

      // Assert
      expect(response.status).toBe(500)
      expect(response.body).toEqual({ error: 'Failed to log out.' })
      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to log out:', error)
    })
  })
})
