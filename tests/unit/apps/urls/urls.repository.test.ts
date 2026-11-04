import urlsRepo from '../../../../src/apps/urls/data-access/urls.repository'
import pool from '../../../../src/db'

jest.mock('../../../../src/db')

describe('URLs Repository Unit Tests #unit #database', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('createUrl #URL-SHORTEN', () => {
    it('When creating a URL, with valid userId, originalUrl and shortKey, then it should execute INSERT and return created record', async () => {
      // Arrange
      const userId = '1'
      const originalUrl = 'https://example.com'
      const shortKey = 'xyz123'
      const expectedRecord = {
        id: '1',
        user_id: userId,
        original_url: originalUrl,
        short_key: shortKey,
        created_at: new Date(),
      }
      ;(pool.query as jest.Mock).mockResolvedValue({ rows: [expectedRecord] })

      // Act
      const result = await urlsRepo.createUrl(userId, originalUrl, shortKey)

      // Assert
      expect(result).toEqual(expectedRecord)
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO urls (user_id, original_url, short_key)'),
        [userId, originalUrl, shortKey],
      )
    })
  })

  describe('listUrlsByUser #api', () => {
    it('When listing URLs by user, with valid userId, then it should return list ordered by created_at DESC', async () => {
      // Arrange
      const userId = '2'
      const expectedList = [
        { id: '2', user_id: userId, original_url: 'https://site2.com', short_key: 'k2', created_at: new Date() },
      ]
      ;(pool.query as jest.Mock).mockResolvedValue({ rows: expectedList })

      // Act
      const result = await urlsRepo.listUrlsByUser(userId)

      // Assert
      expect(result).toEqual(expectedList)
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT id, user_id, original_url, short_key, created_at'),
        [userId],
      )
    })
  })

  describe('findUrlByShortKey #URL-REDIRECT', () => {
    it('When finding URL by shortKey, with existing key, then it should return matching original_url', async () => {
      // Arrange
      const shortKey = 'k1'
      const expectedRecord = { original_url: 'https://target.com' }
      ;(pool.query as jest.Mock).mockResolvedValue({ rows: [expectedRecord] })

      // Act
      const result = await urlsRepo.findUrlByShortKey(shortKey)

      // Assert
      expect(result).toEqual(expectedRecord)
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT original_url FROM urls WHERE short_key = $1'),
        [shortKey],
      )
    })
  })

  describe('deleteUrl #URL-DELETE #AUTHZ-02', () => {
    it('When deleting URL, matching shortKey and userId, then it should return true if row was deleted', async () => {
      // Arrange
      const shortKey = 'k1'
      const userId = '1'
      ;(pool.query as jest.Mock).mockResolvedValue({ rowCount: 1 })

      // Act
      const result = await urlsRepo.deleteUrl(shortKey, userId)

      // Assert
      expect(result).toBe(true)
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM urls WHERE short_key = $1 AND user_id = $2'),
        [shortKey, userId],
      )
    })

    it('When deleting URL, with non-matching userId or missing key, then it should return false', async () => {
      // Arrange
      const shortKey = 'k1'
      const userId = '999'
      ;(pool.query as jest.Mock).mockResolvedValue({ rowCount: 0 })

      // Act
      const result = await urlsRepo.deleteUrl(shortKey, userId)

      // Assert
      expect(result).toBe(false)
    })
  })
})
