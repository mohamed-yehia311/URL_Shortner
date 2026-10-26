const pool = require('../../../db')

async function createUrl(userId, originalUrl, shortKey) {
  const result = await pool.query(
    `INSERT INTO urls (user_id, original_url, short_key)
     VALUES ($1, $2, $3)
     RETURNING id, user_id, original_url, short_key, created_at`,
    [userId, originalUrl, shortKey],
  )
  return result.rows[0]
}

async function listUrlsByUser(userId) {
  const result = await pool.query(
    `SELECT id, user_id, original_url, short_key, created_at
     FROM urls
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [userId],
  )
  return result.rows
}

async function findUrlByShortKey(shortKey) {
  const result = await pool.query(
    'SELECT original_url FROM urls WHERE short_key = $1',
    [shortKey],
  )
  return result.rows[0]
}

async function deleteUrl(shortKey, userId) {
  const result = await pool.query(
    'DELETE FROM urls WHERE short_key = $1 AND user_id = $2 RETURNING id',
    [shortKey, userId],
  )
  return result.rowCount > 0
}

module.exports = {
  createUrl,
  listUrlsByUser,
  findUrlByShortKey,
  deleteUrl,
}
