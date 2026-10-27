import { Pool } from 'pg'

const pool = new Pool({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
})

pool.on('error', (error: Error) => {
  console.error('Unexpected PostgreSQL pool error:', error)
})

export default pool
