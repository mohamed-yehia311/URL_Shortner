import urlsService from '../../../../src/apps/urls/domain/urls.service'
import urlsRepo from '../../../../src/apps/urls/data-access/urls.repository'

jest.mock('../../../../src/apps/urls/data-access/urls.repository')

describe('URLs Service Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('URL Shortening #URL-SHORTEN #unit #sanity', () => {
    it('When shortening a valid HTTPS URL, under standard conditions, then it should generate a short key and return created record', async () => {
      // Arrange
      const userId = '1'
      const originalUrl = 'https://example.com/very/long/path?param=value'
      const createdRecord = {
        id: '10',
        user_id: userId,
        original_url: originalUrl,
        short_key: 'abc1234',
        created_at: new Date(),
      }
      ;(urlsRepo.createUrl as jest.Mock).mockResolvedValue(createdRecord)

      // Act
      const result = await urlsService.shortenUrl(userId, originalUrl)

      // Assert
      // 1. Response verification
      expect(result).toEqual(createdRecord)
      // 2. Database interaction verification
      expect(urlsRepo.createUrl).toHaveBeenCalledTimes(1)
      expect(urlsRepo.createUrl).toHaveBeenCalledWith(userId, originalUrl, expect.any(String))
    })

    it('When shortening an invalid URL (non-HTTP protocol or malformed), under input validation scenario, then it should throw 400 error', async () => {
      // Arrange
      const userId = '1'
      const invalidUrl = 'ftp://invalid-scheme.com'

      // Act & Assert
      await expect(urlsService.shortenUrl(userId, invalidUrl)).rejects.toMatchObject({
        statusCode: 400,
        message: 'Provide an HTTP or HTTPS original_url.',
      })

      // Assert
      expect(urlsRepo.createUrl).not.toHaveBeenCalled()
    })

    it('When shortening fails due to user not found (foreign key violation 23503), under missing user scenario, then it should throw 404 error', async () => {
      // Arrange
      const userId = '99999'
      const originalUrl = 'https://valid-target.com'
      const fkError: any = new Error('Foreign key violation')
      fkError.code = '23503'
      ;(urlsRepo.createUrl as jest.Mock).mockRejectedValue(fkError)

      // Act & Assert
      await expect(urlsService.shortenUrl(userId, originalUrl)).rejects.toMatchObject({
        statusCode: 404,
        message: 'User not found.',
      })

      // Assert
      expect(urlsRepo.createUrl).toHaveBeenCalledTimes(1)
    })

    it('When short key collision occurs (23505), under collision scenario, then it should retry with a new key and succeed on subsequent attempt', async () => {
      // Arrange
      const userId = '1'
      const originalUrl = 'https://valid-target.com'
      const collisionError: any = new Error('Unique constraint violation')
      collisionError.code = '23505'

      const createdRecord = {
        id: '11',
        user_id: userId,
        original_url: originalUrl,
        short_key: 'retryKey',
        created_at: new Date(),
      }

      ;(urlsRepo.createUrl as jest.Mock)
        .mockRejectedValueOnce(collisionError)
        .mockResolvedValueOnce(createdRecord)

      // Act
      const result = await urlsService.shortenUrl(userId, originalUrl)

      // Assert
      expect(result).toEqual(createdRecord)
      expect(urlsRepo.createUrl).toHaveBeenCalledTimes(2)
    })

    it('When short key collision occurs 3 times consecutively, under high collision scenario, then it should throw the collision error', async () => {
      // Arrange
      const userId = '1'
      const originalUrl = 'https://valid-target.com'
      const collisionError: any = new Error('Unique constraint violation')
      collisionError.code = '23505'

      ;(urlsRepo.createUrl as jest.Mock).mockRejectedValue(collisionError)

      // Act & Assert
      await expect(urlsService.shortenUrl(userId, originalUrl)).rejects.toMatchObject({
        code: '23505',
      })
      expect(urlsRepo.createUrl).toHaveBeenCalledTimes(3)
    })
  })

  describe('List URLs #api #unit', () => {
    it('When listing URLs for a user, under authenticated conditions, then it should query and return all user URLs', async () => {
      // Arrange
      const userId = '1'
      const mockList = [
        {
          id: '1',
          user_id: userId,
          original_url: 'https://site1.com',
          short_key: 'key1',
          created_at: new Date(),
        },
        {
          id: '2',
          user_id: userId,
          original_url: 'https://site2.com',
          short_key: 'key2',
          created_at: new Date(),
        },
      ]
      ;(urlsRepo.listUrlsByUser as jest.Mock).mockResolvedValue(mockList)

      // Act
      const result = await urlsService.listUrls(userId)

      // Assert
      expect(result).toEqual(mockList)
      expect(urlsRepo.listUrlsByUser).toHaveBeenCalledWith(userId)
    })
  })

  describe('Resolve Short URL #URL-REDIRECT #unit #sanity', () => {
    it('When resolving an existing short key, under public redirect circumstances, then it should return the original target URL', async () => {
      // Arrange
      const shortKey = 'knownKey'
      const originalUrl = 'https://destination-url.com'
      ;(urlsRepo.findUrlByShortKey as jest.Mock).mockResolvedValue({ original_url: originalUrl })

      // Act
      const result = await urlsService.resolveUrl(shortKey)

      // Assert
      expect(result).toBe(originalUrl)
      expect(urlsRepo.findUrlByShortKey).toHaveBeenCalledWith(shortKey)
    })

    it('When resolving a non-existent short key, under missing key scenario, then it should throw 404 error', async () => {
      // Arrange
      const shortKey = 'missingKey'
      ;(urlsRepo.findUrlByShortKey as jest.Mock).mockResolvedValue(undefined)

      // Act & Assert
      await expect(urlsService.resolveUrl(shortKey)).rejects.toMatchObject({
        statusCode: 404,
        message: 'Short URL not found.',
      })
    })
  })

  describe('Delete Short URL #URL-DELETE #AUTHZ-02 #unit #security', () => {
    it('When deleting a short URL owned by user, under authorized conditions, then it should successfully delete', async () => {
      // Arrange
      const shortKey = 'userKey'
      const userId = '1'
      ;(urlsRepo.deleteUrl as jest.Mock).mockResolvedValue(true)

      // Act
      await urlsService.deleteUrl(shortKey, userId)

      // Assert
      expect(urlsRepo.deleteUrl).toHaveBeenCalledWith(shortKey, userId)
    })

    it('When deleting a short URL that does not belong to the user (IDOR prevention), under unauthorized ownership scenario, then it should throw 404 error', async () => {
      // Arrange
      const shortKey = 'otherUserKey'
      const userId = '2'
      ;(urlsRepo.deleteUrl as jest.Mock).mockResolvedValue(false)

      // Act & Assert
      await expect(urlsService.deleteUrl(shortKey, userId)).rejects.toMatchObject({
        statusCode: 404,
        message: 'URL not found for this user.',
      })

      // Assert
      expect(urlsRepo.deleteUrl).toHaveBeenCalledWith(shortKey, userId)
    })
  })
})
