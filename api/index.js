// api/index.js
const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { getDbPool } = require('../src/db'); // <-- RUTA CORREGIDA

// ===================================
// CONFIGURACIÓN DEL SERVIDOR
// ===================================

const app = express();

// 1. Seguridad Avanzada (sin xss-clean por ahora)
app.use(helmet()); 

// Configuración CORS Permisiva para desarrollo/prod controlado
const corsOptions = {
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};
app.use(cors(corsOptions));

// 2. Parsers
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));

// 3. Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: 'Demasiadas peticiones desde esta IP, por favor intente de nuevo más tarde.'
});
app.use('/api/', limiter);

// 4. Logging
app.use((req, res, next) => {
  if (req.path !== '/api/health') {
    console.log(`📨 ${req.method} ${req.path}`);
  }
  next();
});

// ===================================
// RUTAS (TODAS CORREGIDAS)
// ===================================

app.use('/api/auth', require('../src/routes/auth')); // <-- RUTA CORREGIDA
app.use('/api/public', require('../src/routes/public-data')); // <-- RUTA CORREGIDA
app.use('/api/surveys', require('../src/routes/surveys')); // <-- RUTA CORREGIDA
app.use('/api/incidents', require('../src/routes/incidents')); // <-- RUTA CORREGIDA
app.use('/api/admin', require('../src/routes/admin')); // <-- RUTA CORREGIDA

// Health Check
app.get('/api/health', async (req, res) => {
  const pool = getDbPool();
  let dbStatus = 'disconnected';
  try {
    if (pool) {
      await pool.query('SELECT 1');
      dbStatus = 'connected';
    }
  } catch (e) {
    dbStatus = 'error';
  }

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    db: dbStatus,
    version: '2.1.0-RC'
  });
});

// Manejo de Errores Global
app.use((err, req, res, next) => {
  console.error('❌ Server Error:', err.stack);
  res.status(500).json({
    error: 'Error interno del servidor',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Algo salió mal'
  });
});

// Exportamos la app para Vercel
module.exports = app;