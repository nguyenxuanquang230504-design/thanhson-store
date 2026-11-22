const fs = require('fs');
const path = require('path');
const { getPool } = require('../server/lib/database');

async function migrate() {
  const pool = getPool();
  if (!pool) throw new Error('DATABASE_URL is required');
  const file = path.join(__dirname, '..', 'migrations', '001_initial.sql');
  const sql = fs.readFileSync(file, 'utf8');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log('Database migration completed.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

migrate().catch(error => {
  console.error(error.message);
  process.exit(1);
});
