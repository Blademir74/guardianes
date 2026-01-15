// src/db.js
const { Pool } = require('pg');

let pool = null;

function getPool() {
  if (!pool) {
    console.log('🔄 Creando pool de BD...');
    
    const databaseUrl = process.env.DATABASE_URL;
    
    if (!databaseUrl) {
      console.error('❌ DATABASE_URL no configurada');
      throw new Error('DATABASE_URL no configurada en variables de entorno');
    }
    
    pool = new Pool({
      connectionString: databaseUrl,
      ssl: { 
        rejectUnauthorized: false 
      },
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });

    pool.on('error', (err) => {
      console.error('❌ Error en pool de BD:', err.message);
      pool = null;
    });

    console.log('✅ Pool de BD creado');
  }
  return pool;
}

// Función para queries directas
async function query(text, params) {
  const pool = getPool();
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log(`✅ Query ejecutada en ${duration}ms`);
    return result;
  } catch (error) {
    console.error('❌ Error en query:', error.message);
    throw error;
  }
}

// Función para obtener cliente (para transacciones)
async function connect() {
  const pool = getPool();
  return await pool.connect();
}

module.exports = {
  query,
  connect,
  getPool
};