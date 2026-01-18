// api/index.js - VERSIÓN DE DIAGNÓSTICO Y CONTROL
const express = require('express');
const cors = require('cors');
const { getDbPool } = require('../src/db'); // Asegúrate de que esta ruta es correcta

const app = express();

// Middleware esencial
app.use(cors());
app.use(express.json());

// Endpoint de Salud CRÍTICO
app.get('/api/health', async (req, res) => {
  console.log('🔍 Health check requested...');
  let dbStatus = 'disconnected';
  let dbError = null;

  try {
    const pool = getDbPool();
    if (!pool) {
      throw new Error('Database pool not initialized. Check DATABASE_URL.');
    }
    const result = await pool.query('SELECT NOW()');
    dbStatus = 'connected';
    console.log('✅ DB Connection successful:', result.rows[0].now);
  } catch (e) {
    dbStatus = 'error';
    dbError = e.message;
    console.error('❌ DB Connection failed:', e.message);
  }

  res.status(dbStatus === 'connected' ? 200 : 503).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    database: {
      status: dbStatus,
      error: dbError
    },
    version: '2.2.0-CTO-Triage'
  });
});

// Un endpoint simple para probar que la API responde
app.get('/api/test', (req, res) => {
  res.json({ message: 'API responde correctamente. El problema está en las rutas o la DB.' });
});

// Exportamos para Vercel
module.exports = app;