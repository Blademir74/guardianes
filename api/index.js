// api/index.js — Entry point para Vercel
const express = require('express');
const cors = require('cors');
const path = require('path');

// Importar rutas
const authRouter = require('../src/routes/auth');
const surveysRouter = require('../src/routes/surveys');
const predictionsRouter = require('../src/routes/predictions');
const dataRouter = require('../src/routes/data');
const adminRouter = require('../src/routes/admin');
const incidentsRouter = require('../src/routes/incidents');
const webhookRouter = require('../src/routes/webhook');

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// ============================================
// RUTAS API
// ============================================

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'Guardianes API',
    env: process.env.NODE_ENV
  });
});

// Webhook de WhatsApp (DEBE ir PRIMERO para evitar conflictos)
app.use('/api/webhook', webhookRouter);

// Rutas principales
app.use('/api/auth', authRouter);
app.use('/api/surveys', surveysRouter);
app.use('/api/predictions', predictionsRouter);
app.use('/api/data', dataRouter);
app.use('/api/admin', adminRouter);
app.use('/api/incidents', incidentsRouter);

// Ruta raíz del API
app.get('/api', (req, res) => {
  res.json({
    message: 'Guardianes API',
    version: '1.0.0',
    endpoints: {
      health: '/api/health',
      webhook: '/api/webhook',
      auth: '/api/auth',
      surveys: '/api/surveys',
      predictions: '/api/predictions',
      data: '/api/data',
      admin: '/api/admin',
      incidents: '/api/incidents'
    }
  });
});

// Manejo de errores
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Error interno del servidor',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// 404 handler
app.use((req, res) => {
  console.log('404 Not Found:', req.method, req.path);
  res.status(404).json({
    error: 'Ruta no encontrada',
    path: req.path,
    method: req.method
  });
});

// Exportar para Vercel
module.exports = app;