// src/db.js — VERSIÓN CORREGIDA (Auditoría 2026-02-02)
// Cambios:
//   • pool se setea a null si falla → siguiente invocación recrée fresh (serverless-safe)
//   • query() retorna res limpio sin log en producción
//   • connect() exportado para uso de transacciones manuales en surveys / admin

const { Pool } = require('pg');

let pool = null;

// ──────────────────────────────────────────────
// Crear pool. Se invoca lazy: la primera query que llegue
// lo instancia. Si el pool muere por error, se resetea a null
// y la siguiente query lo recrea.  Esto es el patrón correcto
// para serverless (Vercel / Neon).
// ──────────────────────────────────────────────
function getPool() {
  if (pool) return pool;

  let connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('FATAL: DATABASE_URL no está definida en las variables de entorno.');
  }

  // Neon connection multiplexing hook
  if (connectionString.includes('neon.tech') && !connectionString.includes('pgbouncer=true')) {
    connectionString += (connectionString.includes('?') ? '&' : '?') + 'pgbouncer=true';
  }

  pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },   // obligatorio para Neon
    // Para Serverless Vercel se recomienda Max=2 por proceso y dejar al pgbouncer atajar
    max: parseInt(process.env.DB_POOL_MAX || '2', 10), // máximo conexiones simultáneas
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });

  // Si el pool detecta un error en un cliente inactivo,
  // lo invalidamos (forzando pool.end()) para que se recree en el siguiente intento sin Memory Leaks.
  pool.on('error', (err) => {
    console.error('❌ Pool error (idle client):', err.message);
    try { pool.end(); } catch (e) {} // Drenaje forzoso
    pool = null;   // ← KEY: permite re-creación en next call libre de fugas de memoria
  });

  console.log('🔒 DB Pool creado.');
  return pool;
}


// ──────────────────────────────────────────────
// query() — wrapper principal. Usado por la mayoría de rutas.
// ──────────────────────────────────────────────
async function query(text, params) {
  const p = getPool();
  const start = Date.now();

  try {
    const res = await p.query(text, params);
    const duration = Date.now() - start;

    if (duration > 1000) {
      console.warn(`⚠️  Query lenta (${duration}ms): ${text.slice(0, 120)}`);
    }

    return res;
  } catch (error) {
    console.error(`❌ Query falló: ${error.message}`);
    console.error(`   SQL: ${text.slice(0, 200)}`);
    throw error;
  }
}


// ──────────────────────────────────────────────
// transaction() — envuelve un callback en BEGIN/COMMIT/ROLLBACK.
// Uso: const result = await transaction(async (client) => { ... });
// ──────────────────────────────────────────────
async function transaction(callback) {
  const p   = getPool();
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
}


// ──────────────────────────────────────────────
// connect() — retorna un client del pool para transacciones
// manuales (surveys.js, admin.js).  IMPORTANTE: el caller
// debe hacer client.release() en finally.
// ──────────────────────────────────────────────
async function connect() {
  return await getPool().connect();
}


module.exports = {
  query,
  transaction,
  connect,
  getPool      // exportamos para tests si hace falta
};