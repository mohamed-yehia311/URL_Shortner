import http from 'http'
import dotenv from 'dotenv'

dotenv.config()

if (!process.env.ACCESS_TOKEN_SECRET && !process.env.ACCESS_TOEK_SECRET) {
  throw new Error('ACCESS_TOKEN_SECRET must be set in .env')
}

import app from './app'

const port = process.env.PORT || 8080
const server = http.createServer(app)

if (process.env.NODE_ENV !== 'test') {
  server.listen(port, () => {
    console.log(`URL shortener API listening on port ${port}`)
  })
}

export default server
