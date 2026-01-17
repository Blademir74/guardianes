const { Pool } = require('pg');

// ===================================
// CONFIGURACIÓN DE BASE DE DATOS OPTIMIZADA
// ===================================

let pool;

const getDbPool = () => {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
      console.error('❌ DATABASE_URL missing. DB features will fail.');
      return null;
    }

    const isProduction = process.env.NODE_ENV === 'production';

    pool = new Pool({
      connectionString,
      ssl: isProduction || connectionString.includes('neon.tech') ? { rejectUnauthorized: false } : false,
      // Optimización para Serverless (Vercel)
      // Mantener bajo el número de conexiones para evitar "too many connections" en lambdas concurrentes
      max: isProduction ? 5 : 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    pool.on('error', (err) => {
      console.error('❌ Unexpected error on idle client', err);
      // No salir del proceso, dejar que el pool intente reconectar o manejar el error en el request
    });

    console.log(`🔌 DB Pool initialized (Max connections: ${isProduction ? 5 : 10})`);
  }
  return pool;
};

const query = async (text, params) => {
  const p = getDbPool();
  if (!p) throw new Error('DB not configured');

  const start = Date.now();
  try {
    const res = await p.query(text, params);
    const duration = Date.now() - start;
    if (duration > 1000) {
      console.warn(`⚠️ Slow query detected (${duration}ms): ${text.slice(0, 50)}...`);
    }
    return res;
  } catch (error) {
    console.error(`❌ Query Error: ${error.message} | Query: ${text.slice(0, 50)}...`);
    throw error;
  }
};

// Helper transacción atómica
const transaction = async (callback) => {
  const p = getDbPool();
  if (!p) throw new Error('DB not configured');

  const client = await p.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
};

module.exports = {
  query,
  transaction,
  getDbPool
};