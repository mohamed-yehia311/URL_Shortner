const { createClient } = require('@clickhouse/client')

const clickhouse = createClient({
	url: process.env.CLICKHOUSE_URL,
	database: process.env.CLICKHOUSE_DB,
	username: process.env.CLICKHOUSE_USER,
	password: process.env.CLICKHOUSE_PASSWORD,
})

module.exports = clickhouse