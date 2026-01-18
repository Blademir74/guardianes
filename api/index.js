// api/index.js - VERSIÓN CON RUTAS INTEGRADAS
const express = require('express');
const cors = require('cors');
const { getDbPool } = require('../src/db');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Rutas
app.use('/api/surveys', require('../src/routes/surveys')); // <-- RUTA DE ENCUESTAS CONECTADA

// Endpoint de Salud
app.get('/api/health', async (req, res) => {
  // ... (mantén el mismo código de health check de antes)
  let dbStatus = 'disconnected';
  let dbError = null;
  try {
    const pool = getDbPool();
    if (!pool) throw new Error('Database pool not initialized.');
    await pool.query('SELECT NOW()');
    dbStatus = 'connected';
  } catch (e) {
    dbStatus = 'error'; dbError = e.message;
  }
  res.status(dbStatus === 'connected' ? 200 : 503).json({
    status: 'ok', timestamp: new Date().toISOString(), database: { status: dbStatus, error: dbError }, version: '2.3.0-CTO-Surveys'
  });
});

module.exports = app;