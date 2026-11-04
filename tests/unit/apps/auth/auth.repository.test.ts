import authRepo from '../../../../src/apps/auth/data-access/auth.repository'
import pool from '../../../../src/db'
import { PoolClient } from 'pg'

jest.mock('../../../../src/db')

describe('Auth Repository Unit Tests #unit #database', () => {
  let mockClient: Partial<PoolClient>

  beforeEach(() => {
    jest.clearAllMocks()
    mockClient = {
      query: jest.fn(),
    }
  })

  describe('User Operations #AUTH-01 #AUTH-04', () => {
    it('When creating a user in database, under valid parameters, then it should execute INSERT and return created record', async () => {
      // Arrange
      const username = 'testuser'
      const email = 'test@example.com'
      const passwordHash = 'argon2_hashed_val'
      const expectedUser = {
        id: '1',
        username,
        email,
        created_at: new Date(),
      }
      ;(mockClient.query as jest.Mock).mockResolvedValue({ rows: [expectedUser] })

      // Act
      const user = await authRepo.createUser(mockClient as PoolClient, username, email, passwordHash)

      // Assert
      expect(user).toEqual(expectedUser)
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO users'),
        [username, email, passwordHash],
      )
    })

    it('When finding user by email, under existing email scenario, then it should query pool with lowercased email', async () => {
      // Arrange
      const email = 'user@example.com'
      const expectedUser = {
        id: '2',
        username: 'user2',
        email,
        password_hash: 'hash',
        created_at: new Date(),
      }
      ;(pool.query as jest.Mock).mockResolvedValue({ rows: [expectedUser] })

      // Act
      const user = await authRepo.findUserByEmail(email)

      // Assert
      expect(user).toEqual(expectedUser)
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT id, username, email, password_hash, created_at FROM users WHERE lower(email) = $1'),
        [email],
      )
    })

    it('When finding user by ID, under existing user ID scenario, then it should query client and return record', async () => {
      // Arrange
      const userId = '5'
      const expectedUser = { id: '5', username: 'user5', email: 'user5@example.com' }
      ;(mockClient.query as jest.Mock).mockResolvedValue({ rows: [expectedUser] })

      // Act
      const user = await authRepo.findUserById(mockClient as PoolClient, userId)

      // Assert
      expect(user).toEqual(expectedUser)
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT id, username, email FROM users WHERE id = $1'),
        [userId],
      )
    })
  })

  describe('Refresh Token Operations #AUTH-05 #AUTH-REFRESH #AUTH-LOGOUT', () => {
    it('When storing a refresh token, under valid user and family ID, then it should insert token hash and return token string', async () => {
      // Arrange
      const userId = '1'
      const familyId = 'family-uuid'
      ;(mockClient.query as jest.Mock).mockResolvedValue({ rows: [] })

      // Act
      const token = await authRepo.storeRefreshToken(mockClient as PoolClient, userId, familyId)

      // Assert
      expect(typeof token).toBe('string')
      expect(token.length).toBeGreaterThan(32)
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO refresh_tokens'),
        [userId, expect.any(String), familyId, expect.any(Date)],
      )
    })

    it('When finding refresh token by hash, under locked row scenario (FOR UPDATE), then it should query token details', async () => {
      // Arrange
      const tokenHash = 'fake-token-hash'
      const tokenRecord = {
        id: '10',
        user_id: '1',
        family_id: 'fam-1',
        expires_at: new Date(),
        revoked_at: null,
      }
      ;(mockClient.query as jest.Mock).mockResolvedValue({ rows: [tokenRecord] })

      // Act
      const result = await authRepo.findRefreshToken(mockClient as PoolClient, tokenHash)

      // Assert
      expect(result).toEqual(tokenRecord)
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('FOR UPDATE'),
        [tokenHash],
      )
    })

    it('When revoking tokens by family, under reuse threat scenario, then it should update all tokens in family with revoked_at', async () => {
      // Arrange
      const familyId = 'fam-to-revoke'
      ;(mockClient.query as jest.Mock).mockResolvedValue({ rowCount: 2 })

      // Act
      await authRepo.revokeTokensByFamily(mockClient as PoolClient, familyId)

      // Assert
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE refresh_tokens SET revoked_at = COALESCE(revoked_at, NOW()) WHERE family_id = $1'),
        [familyId],
      )
    })

    it('When revoking single refresh token by ID, under rotation scenario, then it should update token row', async () => {
      // Arrange
      const tokenId = '10'
      ;(mockClient.query as jest.Mock).mockResolvedValue({ rowCount: 1 })

      // Act
      await authRepo.revokeRefreshToken(mockClient as PoolClient, tokenId)

      // Assert
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1'),
        [tokenId],
      )
    })

    it('When revoking refresh token by hash, under logout scenario, then it should execute pool query', async () => {
      // Arrange
      const token = 'sample-plain-token-string'
      ;(pool.query as jest.Mock).mockResolvedValue({ rowCount: 1 })

      // Act
      await authRepo.revokeRefreshTokenByHash(token)

      // Assert
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE refresh_tokens SET revoked_at = COALESCE(revoked_at, NOW()) WHERE token_hash = $1'),
        [authRepo.hashRefreshToken(token)],
      )
    })
  })
})
