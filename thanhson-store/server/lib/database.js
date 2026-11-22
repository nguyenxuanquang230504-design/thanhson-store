let pool = null;

function getPool() {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return null;
  const { Pool } = require('pg');
  pool = new Pool({
    connectionString,
    ssl: process.env.PGSSL === 'require' ? { rejectUnauthorized: false } : undefined
  });
  return pool;
}

function isPostgresConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

module.exports = { getPool, isPostgresConfigured };
