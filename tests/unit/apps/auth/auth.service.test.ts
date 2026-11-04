import authService from '../../../../src/apps/auth/domain/auth.service'
import authRepo from '../../../../src/apps/auth/data-access/auth.repository'
import pool from '../../../../src/db'
import argon2 from 'argon2'
import jwt from 'jsonwebtoken'

jest.mock('../../../../src/apps/auth/data-access/auth.repository')
jest.mock('../../../../src/db')
jest.mock('argon2')

describe('Auth Service Unit Tests', () => {
  const mockClient = {
    query: jest.fn(),
    release: jest.fn(),
  }

  beforeEach(() => {
    process.env.ACCESS_TOKEN_SECRET = 'super-secret-key-for-testing-at-least-32-chars-long'
    jest.clearAllMocks()
    ;(pool.connect as jest.Mock).mockResolvedValue(mockClient)
    mockClient.query.mockResolvedValue({ rows: [] })
  })

  describe('Registration #AUTH-01 #AUTH-03 #AUTH-04 #AUTH-05 #unit #sanity', () => {
    it('When registering a new user, with valid credentials, then it should hash password with Argon2id, create user, store refresh token, and return authenticated session with tokens', async () => {
      // Arrange
      const username = 'testuser'
      const email = 'test@example.com'
      const password = 'StrongPassword123!'
      const hashedPassword = '$argon2id$v=19$m=65536,t=3,p=4$fakehash'
      const createdUser = {
        id: '1',
        username,
        email,
        created_at: new Date(),
      }
      const fakeRefreshToken = 'refresh-token-xyz-12345678901234567890'

      ;(argon2.hash as jest.Mock).mockResolvedValue(hashedPassword)
      ;(authRepo.createUser as jest.Mock).mockResolvedValue(createdUser)
      ;(authRepo.storeRefreshToken as jest.Mock).mockResolvedValue(fakeRefreshToken)

      // Act
      const result = await authService.register(username, email, password)

      // Assert
      // 1. Response data verification
      expect(result).toBeDefined()
      expect(result.user).toEqual(createdUser)
      expect(result.token_type).toBe('Bearer')
      expect(result.expires_in).toBe(900)
      expect(result.refresh_token).toBe(fakeRefreshToken)
      expect(typeof result.access_token).toBe('string')
      const decoded = jwt.decode(result.access_token) as { sub: string }
      expect(decoded.sub).toBe('1')

      // 2. Database state changes / queries verification
      expect(argon2.hash).toHaveBeenCalledWith(password, { type: argon2.argon2id })
      expect(pool.connect).toHaveBeenCalledTimes(1)
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN')
      expect(authRepo.createUser).toHaveBeenCalledWith(mockClient, username, email, hashedPassword)
      expect(authRepo.storeRefreshToken).toHaveBeenCalledWith(mockClient, '1', expect.any(String))
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT')
      expect(mockClient.release).toHaveBeenCalledTimes(1)

      // 3. Observability / side effects
      expect(mockClient.query).not.toHaveBeenCalledWith('ROLLBACK')
    })

    it('When database error occurs during registration, under error conditions, then it should rollback the transaction and release database client', async () => {
      // Arrange
      const username = 'testuser'
      const email = 'test@example.com'
      const password = 'StrongPassword123!'
      const dbError = new Error('Database connection failed')

      ;(argon2.hash as jest.Mock).mockResolvedValue('hashed')
      ;(authRepo.createUser as jest.Mock).mockRejectedValue(dbError)

      // Act & Assert
      await expect(authService.register(username, email, password)).rejects.toThrow('Database connection failed')

      // Assert
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN')
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK')
      expect(mockClient.release).toHaveBeenCalledTimes(1)
    })
  })

  describe('Login #AUTH-03 #AUTH-05 #AUTH-07 #unit #sanity', () => {
    it('When logging in, with valid email and password, then it should verify hash, create refresh token, and return session tokens', async () => {
      // Arrange
      const email = 'user@example.com'
      const password = 'ValidPassword123!'
      const userRecord = {
        id: '2',
        username: 'validuser',
        email,
        password_hash: '$argon2id$v=19$fakehash',
        created_at: new Date(),
      }
      const fakeRefreshToken = 'refresh-token-session-1234567890'

      ;(authRepo.findUserByEmail as jest.Mock).mockResolvedValue(userRecord)
      ;(argon2.verify as jest.Mock).mockResolvedValue(true)
      ;(authRepo.storeRefreshToken as jest.Mock).mockResolvedValue(fakeRefreshToken)

      // Act
      const result = await authService.login(email, password)

      // Assert
      // 1. Response verification
      expect(result.user.id).toBe('2')
      expect(result.user.email).toBe(email)
      expect(result.access_token).toBeDefined()
      expect(result.refresh_token).toBe(fakeRefreshToken)

      // 2. Database state changes
      expect(authRepo.findUserByEmail).toHaveBeenCalledWith(email)
      expect(argon2.verify).toHaveBeenCalledWith(userRecord.password_hash, password)
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN')
      expect(authRepo.storeRefreshToken).toHaveBeenCalledWith(mockClient, '2', expect.any(String))
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT')
      expect(mockClient.release).toHaveBeenCalledTimes(1)
    })

    it('When logging in with non-existent email, under failure conditions, then it should throw 401 with generic error message to prevent enumeration', async () => {
      // Arrange
      const email = 'unknown@example.com'
      const password = 'AnyPassword123!'
      ;(authRepo.findUserByEmail as jest.Mock).mockResolvedValue(undefined)

      // Act & Assert
      await expect(authService.login(email, password)).rejects.toMatchObject({
        statusCode: 401,
        message: 'Email or password is incorrect.',
      })

      // Assert
      expect(argon2.verify).not.toHaveBeenCalled()
      expect(mockClient.query).not.toHaveBeenCalledWith('BEGIN')
    })

    it('When logging in with incorrect password, under failure conditions, then it should throw 401 with generic error message', async () => {
      // Arrange
      const email = 'user@example.com'
      const password = 'WrongPassword!'
      const userRecord = {
        id: '2',
        username: 'validuser',
        email,
        password_hash: '$argon2id$v=19$fakehash',
        created_at: new Date(),
      }
      ;(authRepo.findUserByEmail as jest.Mock).mockResolvedValue(userRecord)
      ;(argon2.verify as jest.Mock).mockResolvedValue(false)

      // Act & Assert
      await expect(authService.login(email, password)).rejects.toMatchObject({
        statusCode: 401,
        message: 'Email or password is incorrect.',
      })

      // Assert
      expect(mockClient.query).not.toHaveBeenCalledWith('BEGIN')
    })
  })

  describe('Token Refresh & Rotation #AUTH-REFRESH #security #unit', () => {
    it('When refreshing token, with a valid active refresh token, then it should rotate token and return new access and refresh tokens', async () => {
      // Arrange
      const presentedToken = 'valid-refresh-token-present-32-chars-long'
      const hashedToken = 'hashed-token-123'
      const sessionRecord = {
        id: '10',
        user_id: '5',
        family_id: 'fam-uuid-1',
        expires_at: new Date(Date.now() + 100000),
        revoked_at: null,
      }
      const userRecord = {
        id: '5',
        username: 'alice',
        email: 'alice@example.com',
        created_at: new Date(),
      }
      const newRefreshToken = 'new-rotated-token-12345678901234567890'

      ;(authRepo.hashRefreshToken as jest.Mock).mockReturnValue(hashedToken)
      ;(authRepo.findRefreshToken as jest.Mock).mockResolvedValue(sessionRecord)
      ;(authRepo.revokeRefreshToken as jest.Mock).mockResolvedValue(undefined)
      ;(authRepo.storeRefreshToken as jest.Mock).mockResolvedValue(newRefreshToken)
      ;(authRepo.findUserById as jest.Mock).mockResolvedValue(userRecord)

      // Act
      const result = await authService.refresh(presentedToken)

      // Assert
      // 1. Response verification
      expect(result.access_token).toBeDefined()
      expect(result.refresh_token).toBe(newRefreshToken)
      expect(result.expires_in).toBe(900)

      // 2. Database state changes
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN')
      expect(authRepo.revokeRefreshToken).toHaveBeenCalledWith(mockClient, '10')
      expect(authRepo.storeRefreshToken).toHaveBeenCalledWith(mockClient, '5', 'fam-uuid-1')
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT')
      expect(mockClient.release).toHaveBeenCalledTimes(1)
    })

    it('When refresh token reuse is detected, under security threat scenario, then it should revoke the entire token family and throw 401', async () => {
      // Arrange
      const presentedToken = 'reused-refresh-token-present-32-chars-long'
      const sessionRecord = {
        id: '11',
        user_id: '5',
        family_id: 'compromised-fam-uuid',
        expires_at: new Date(Date.now() + 100000),
        revoked_at: new Date(Date.now() - 5000), // already revoked!
      }

      ;(authRepo.hashRefreshToken as jest.Mock).mockReturnValue('hashed-reuse')
      ;(authRepo.findRefreshToken as jest.Mock).mockResolvedValue(sessionRecord)
      ;(authRepo.revokeTokensByFamily as jest.Mock).mockResolvedValue(undefined)

      // Act & Assert
      await expect(authService.refresh(presentedToken)).rejects.toMatchObject({
        statusCode: 401,
        message: 'Refresh token reuse detected; this session has been revoked.',
      })

      // Assert
      expect(authRepo.revokeTokensByFamily).toHaveBeenCalledWith(mockClient, 'compromised-fam-uuid')
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT')
      expect(mockClient.release).toHaveBeenCalledTimes(1)
    })

    it('When refresh token is expired, under expired session scenario, then it should revoke token and throw 401', async () => {
      // Arrange
      const presentedToken = 'expired-refresh-token-present-32-chars-long'
      const sessionRecord = {
        id: '12',
        user_id: '5',
        family_id: 'expired-fam-uuid',
        expires_at: new Date(Date.now() - 10000), // expired!
        revoked_at: null,
      }

      ;(authRepo.hashRefreshToken as jest.Mock).mockReturnValue('hashed-expired')
      ;(authRepo.findRefreshToken as jest.Mock).mockResolvedValue(sessionRecord)
      ;(authRepo.revokeRefreshToken as jest.Mock).mockResolvedValue(undefined)

      // Act & Assert
      await expect(authService.refresh(presentedToken)).rejects.toMatchObject({
        statusCode: 401,
        message: 'Refresh token is invalid or expired.',
      })

      // Assert
      expect(authRepo.revokeRefreshToken).toHaveBeenCalledWith(mockClient, '12')
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT')
      expect(mockClient.release).toHaveBeenCalledTimes(1)
    })

    it('When refresh token does not exist, under invalid token scenario, then it should rollback transaction and throw 401', async () => {
      // Arrange
      const presentedToken = 'non-existent-refresh-token-32-chars-long'
      ;(authRepo.hashRefreshToken as jest.Mock).mockReturnValue('hashed-none')
      ;(authRepo.findRefreshToken as jest.Mock).mockResolvedValue(undefined)

      // Act & Assert
      await expect(authService.refresh(presentedToken)).rejects.toMatchObject({
        statusCode: 401,
        message: 'Refresh token is invalid or expired.',
      })

      // Assert
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK')
      expect(mockClient.release).toHaveBeenCalledTimes(1)
    })

    it('When user account is deleted during token refresh, under deleted user scenario, then it should rollback transaction and throw 401', async () => {
      // Arrange
      const presentedToken = 'valid-refresh-token-32-chars-long-user-deleted'
      const sessionRecord = {
        id: '15',
        user_id: '99',
        family_id: 'fam-99',
        expires_at: new Date(Date.now() + 100000),
        revoked_at: null,
      }
      ;(authRepo.hashRefreshToken as jest.Mock).mockReturnValue('hash-99')
      ;(authRepo.findRefreshToken as jest.Mock).mockResolvedValue(sessionRecord)
      ;(authRepo.revokeRefreshToken as jest.Mock).mockResolvedValue(undefined)
      ;(authRepo.storeRefreshToken as jest.Mock).mockResolvedValue('new-tok')
      ;(authRepo.findUserById as jest.Mock).mockResolvedValue(undefined) // user deleted!

      // Act & Assert
      await expect(authService.refresh(presentedToken)).rejects.toMatchObject({
        statusCode: 401,
        message: 'User account no longer exists.',
      })

      // Assert
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK')
      expect(mockClient.release).toHaveBeenCalledTimes(1)
    })

    it('When ACCESS_TOKEN_SECRET is missing, under configuration error scenario, then it should throw an error', async () => {
      // Arrange
      delete process.env.ACCESS_TOKEN_SECRET
      delete process.env.ACCESS_TOEK_SECRET

      // Act & Assert
      await expect(authService.register('user', 'email@test.com', 'Password123!')).rejects.toThrow(
        'ACCESS_TOKEN_SECRET must be configured.',
      )
    })
  })

  describe('Logout #AUTH-LOGOUT #unit', () => {
    it('When logging out, with a valid refresh token string, then it should revoke the token by its hash in PostgreSQL', async () => {
      // Arrange
      const token = 'token-to-revoke-12345678901234567890'
      ;(authRepo.revokeRefreshTokenByHash as jest.Mock).mockResolvedValue(undefined)

      // Act
      await authService.logout(token)

      // Assert
      expect(authRepo.revokeRefreshTokenByHash).toHaveBeenCalledWith(token)
    })

    it('When logging out, with an empty or non-string input, then it should gracefully ignore and not query database', async () => {
      // Arrange
      const invalidToken = undefined as unknown as string

      // Act
      await authService.logout(invalidToken)

      // Assert
      expect(authRepo.revokeRefreshTokenByHash).not.toHaveBeenCalled()
    })
  })
})
