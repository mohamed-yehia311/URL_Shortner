const http = require('http')
require('dotenv').config()

if (!process.env.ACCESS_TOKEN_SECRET && !process.env.ACCESS_TOEK_SECRET) {
	throw new Error('ACCESS_TOKEN_SECRET must be set in .env')
}

const app = require('./app')
const port = process.env.PORT || 8080
const server = http.createServer(app)

server.listen(port)