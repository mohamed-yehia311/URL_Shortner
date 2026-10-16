const http = require('http')
require('dotenv').config()

if (!process.env.ACCESS_TOKEN_SECRET && !process.env.ACCESS_TOEK_SECRET) {
	throw new Error('ACCESS_TOKEN_SECRET must be set in .env')
}

const app = require('./app')
const clickhouse = require('./clickhouse')
const port = process.env.PORT || 8080
const server = http.createServer(app)

async function start() {
	const health = await clickhouse.ping()
	if (!health.success) {
		throw new Error(health.error || 'ClickHouse health check failed.')
	}

	server.listen(port, () => {
		console.log(`URL shortener API listening on port ${port}`)
	})
}

start().catch(async (error) => {
	console.error('Failed to connect to ClickHouse:', error)
	await clickhouse.close()
	process.exitCode = 1
})