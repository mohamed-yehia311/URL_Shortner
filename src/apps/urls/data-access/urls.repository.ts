import pool from '../../../db'

export interface UrlRecord {
  id: string | number
  user_id: string | number
  original_url: string
  short_key: string
  created_at: Date | string
}

export async function createUrl(
  userId: string | number,
  originalUrl: string,
  shortKey: string,
): Promise<UrlRecord> {
  const result = await pool.query(
    `INSERT INTO urls (user_id, original_url, short_key)
     VALUES ($1, $2, $3)
     RETURNING id, user_id, original_url, short_key, created_at`,
    [userId, originalUrl, shortKey],
  )
  return result.rows[0]
}

export async function listUrlsByUser(userId: string | number): Promise<UrlRecord[]> {
  const result = await pool.query(
    `SELECT id, user_id, original_url, short_key, created_at
     FROM urls
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [userId],
  )
  return result.rows
}

export async function findUrlByShortKey(shortKey: string): Promise<Pick<UrlRecord, 'original_url'> | undefined> {
  const result = await pool.query(
    'SELECT original_url FROM urls WHERE short_key = $1',
    [shortKey],
  )
  return result.rows[0]
}

export async function deleteUrl(shortKey: string, userId: string | number): Promise<boolean> {
  const result = await pool.query(
    'DELETE FROM urls WHERE short_key = $1 AND user_id = $2 RETURNING id',
    [shortKey, userId],
  )
  return (result.rowCount ?? 0) > 0
}

export default {
  createUrl,
  listUrlsByUser,
  findUrlByShortKey,
  deleteUrl,
}
