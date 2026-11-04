import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import authenticate from '../../../../src/apps/auth/entry-points/api/authenticate.middleware'

describe('Authenticate Middleware Unit Tests', () => {
  const secret = 'super-secret-key-for-testing-at-least-32-chars-long'
  let mockReq: Partial<Request>
  let mockRes: Partial<Response>
  let mockNext: NextFunction

  beforeEach(() => {
    process.env.ACCESS_TOKEN_SECRET = secret
    mockReq = {
      get: jest.fn(),
    }
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    }
    mockNext = jest.fn()
  })

  describe('Authorization Header Validation #AUTHZ-01 #AUTHZ-03 #unit #security', () => {
    it('When request has missing authorization header, under unauthenticated circumstances, then it should return 401 status and error message', () => {
      // Arrange
      ;(mockReq.get as jest.Mock).mockReturnValue(undefined)

      // Act
      authenticate(mockReq as Request, mockRes as Response, mockNext)

      // Assert
      // 1. Response status and data
      expect(mockRes.status).toHaveBeenCalledWith(401)
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'A Bearer access token is required.' })
      // 2. Control flow
      expect(mockNext).not.toHaveBeenCalled()
    })

    it('When request has invalid authorization scheme (not Bearer), under malformed header scenario, then it should return 401 status', () => {
      // Arrange
      ;(mockReq.get as jest.Mock).mockReturnValue('Basic somecredentials')

      // Act
      authenticate(mockReq as Request, mockRes as Response, mockNext)

      // Assert
      expect(mockRes.status).toHaveBeenCalledWith(401)
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'A Bearer access token is required.' })
      expect(mockNext).not.toHaveBeenCalled()
    })
  })

  describe('JWT Signature and Expiry Verification #AUTHZ-01 #security #unit', () => {
    it('When request has a valid Bearer token, under authenticated circumstances, then it should attach user to request and call next()', () => {
      // Arrange
      const validToken = jwt.sign({}, secret, {
        algorithm: 'HS256',
        subject: '42',
        issuer: 'url-shortener-api',
        audience: 'url-shortener-client',
        expiresIn: '15m',
      })
      ;(mockReq.get as jest.Mock).mockReturnValue(`Bearer ${validToken}`)

      // Act
      authenticate(mockReq as Request, mockRes as Response, mockNext)

      // Assert
      // 1. Database/Context state change
      expect(mockReq.user).toEqual({ id: '42' })
      // 2. Control flow
      expect(mockNext).toHaveBeenCalledTimes(1)
      expect(mockRes.status).not.toHaveBeenCalled()
    })

    it('When token signature is invalid, under forged token attack scenario, then it should return 401 status', () => {
      // Arrange
      const forgedToken = jwt.sign({}, 'wrong-secret', {
        algorithm: 'HS256',
        subject: '42',
        issuer: 'url-shortener-api',
        audience: 'url-shortener-client',
      })
      ;(mockReq.get as jest.Mock).mockReturnValue(`Bearer ${forgedToken}`)

      // Act
      authenticate(mockReq as Request, mockRes as Response, mockNext)

      // Assert
      expect(mockRes.status).toHaveBeenCalledWith(401)
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid or expired access token.' })
      expect(mockNext).not.toHaveBeenCalled()
    })

    it('When token is expired, under expired session scenario, then it should return 401 status', () => {
      // Arrange
      const expiredToken = jwt.sign({}, secret, {
        algorithm: 'HS256',
        subject: '42',
        issuer: 'url-shortener-api',
        audience: 'url-shortener-client',
        expiresIn: -10, // already expired
      })
      ;(mockReq.get as jest.Mock).mockReturnValue(`Bearer ${expiredToken}`)

      // Act
      authenticate(mockReq as Request, mockRes as Response, mockNext)

      // Assert
      expect(mockRes.status).toHaveBeenCalledWith(401)
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid or expired access token.' })
      expect(mockNext).not.toHaveBeenCalled()
    })

    it('When token subject is non-numeric, under malformed subject scenario, then it should return 401 status', () => {
      // Arrange
      const invalidSubToken = jwt.sign({}, secret, {
        algorithm: 'HS256',
        subject: 'abc-not-id',
        issuer: 'url-shortener-api',
        audience: 'url-shortener-client',
      })
      ;(mockReq.get as jest.Mock).mockReturnValue(`Bearer ${invalidSubToken}`)

      // Act
      authenticate(mockReq as Request, mockRes as Response, mockNext)

      // Assert
      expect(mockRes.status).toHaveBeenCalledWith(401)
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Invalid access token.' })
      expect(mockNext).not.toHaveBeenCalled()
    })

    it('When ACCESS_TOKEN_SECRET is not configured on the server, under misconfiguration scenario, then it should return 500 status', () => {
      // Arrange
      delete process.env.ACCESS_TOKEN_SECRET
      delete process.env.ACCESS_TOEK_SECRET
      ;(mockReq.get as jest.Mock).mockReturnValue('Bearer anytoken')

      // Act
      authenticate(mockReq as Request, mockRes as Response, mockNext)

      // Assert
      expect(mockRes.status).toHaveBeenCalledWith(500)
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Authentication is not configured.' })
      expect(mockNext).not.toHaveBeenCalled()
    })
  })
})
