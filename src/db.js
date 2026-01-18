// src/db.js
const { Pool } = require('pg');

let pool;

// Inicialización del pool de forma síncrona para asegurar que esté listo
const initializePool = () => {
  if (pool) {
    return pool;
  }

  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    // Este error aparecerá en los logs de Vercel si la variable falta
    throw new Error('FATAL: DATABASE_URL is not defined in environment variables.');
  }

  pool = new Pool({
    connectionString,
    // Aseguramos SSL para Neon y otros proveedores cloud
    ssl: { rejectUnauthorized: false },
    // Configuración optimizada para serverless
    max: 5, // Muy importante para no exceder límites de conexión
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000, // Aumentamos un poco el timeout
  });

  pool.on('error', (err, client) => {
    console.error('❌ Unexpected error on idle client', err);
    // En serverless, no intentamos recuperar el pool aquí.
    // La siguiente invocación creará uno nuevo si es necesario.
  });

  console.log('🔌 DB Pool created successfully.');
  return pool;
};

// Llamamos a la inicialización al cargar el módulo
try {
  initializePool();
} catch (e) {
  console.error('🚨 Failed to initialize DB Pool on startup:', e.message);
  // No detenemos el proceso, pero el primer intento de query fallará.
}


const getDbPool = () => {
  if (!pool) {
    // Esto no debería pasar si initializePool funcionó, pero es un respaldo.
    throw new Error('DB Pool was not initialized. Check startup logs.');
  }
  return pool;
};

const query = async (text, params) => {
  const p = getDbPool();
  const start = Date.now();
  try {
    const res = await p.query(text, params);
    const duration = Date.now() - start;
    if (duration > 1000) {
      console.warn(`⚠️ Slow query (${duration}ms): ${text}`);
    }
    return res;
  } catch (error) {
    console.error(`❌ Query Failed: ${error.message}`);
    throw error;
  }
};

// La transacción se mantiene igual
const transaction = async (callback) => {
  const p = getDbPool();
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