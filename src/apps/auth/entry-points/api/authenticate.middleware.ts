import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

export interface AuthenticatedUser {
  id: string
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser
    }
  }
}

export default function authenticate(req: Request, res: Response, next: NextFunction): void | Response {
  const authorization = req.get('authorization') || ''
  const [scheme, token] = authorization.split(' ')

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'A Bearer access token is required.' })
  }

  try {
    const secret = process.env.ACCESS_TOKEN_SECRET || process.env.ACCESS_TOEK_SECRET
    if (!secret) {
      return res.status(500).json({ error: 'Authentication is not configured.' })
    }
    const payload = jwt.verify(token, secret, {
      algorithms: ['HS256'],
      issuer: 'url-shortener-api',
      audience: 'url-shortener-client',
    }) as { sub?: string }

    if (typeof payload.sub !== 'string' || !/^\d+$/.test(payload.sub)) {
      return res.status(401).json({ error: 'Invalid access token.' })
    }
    req.user = { id: payload.sub }
    return next()
  } catch {
    return res.status(401).json({ error: 'Invalid or expired access token.' })
  }
}
