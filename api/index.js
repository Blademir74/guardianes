// api/index.js - VERSIÓN CORREGIDA FINAL
const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();

// Middlewares
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Log de requests
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Health check
app.get('/api/health', async (req, res) => {
  try {
    const { query } = require('../src/db');
    const result = await query('SELECT NOW()');
    res.json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      database: {
        status: 'connected',
        error: null
      },
      version: '2.2.0-CTO-Ready'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      database: {
        status: 'error',
        error: error.message
      }
    });
  }
});

// ===================================
// IMPORTAR RUTAS
// ===================================
const authRoutes = require('../src/routes/auth');
const dataRoutes = require('../src/routes/data');
const surveyRoutes = require('../src/routes/surveys');  // ✅ CORREGIDO: surveys.js
const adminRoutes = require('../src/routes/admin');
const candidateRoutes = require('../src/routes/candidate');
const predictionsRoutes = require('../src/routes/predictions');
const leaderboardRoutes = require('../src/routes/leaderboard');
const incidentsRoutes = require('../src/routes/incidents');
const whatsappRoutes = require('../src/routes/whatsapp');

// ===================================
// REGISTRAR RUTAS
// ===================================
app.use('/api/auth', authRoutes);
app.use('/api/data', dataRoutes);
app.use('/api/surveys', surveyRoutes);  // ✅ CORREGIDO
app.use('/api/admin', adminRoutes);
app.use('/api/candidates', candidateRoutes);
app.use('/api/predictions', predictionsRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/incidents', incidentsRoutes);
app.use('/api/whatsapp', whatsappRoutes);

// ===================================
// RUTAS HTML (SOLO SI NO SE SIRVEN DESDE VERCEL.JSON)
// ===================================
app.use(express.static(path.join(__dirname, '../public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.get('/landing', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/landing.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/admin.html'));
});

// ===================================
// ERROR 404
// ===================================
app.use((req, res) => {
  console.log(`❌ 404 - Ruta no encontrada: ${req.method} ${req.path}`);
  res.status(404).json({ 
    error: 'Route not found',
    path: req.path,
    method: req.method,
    availableRoutes: [
      '/api/health',
      '/api/data/municipalities',
      '/api/surveys/active',
      '/api/candidates'
    ]
  });
});

// ===================================
// ERROR HANDLER
// ===================================
app.use((err, req, res, next) => {
  console.error('❌ Error:', err);
  res.status(err.status || 500).json({ 
    error: err.message || 'Internal server error',
    details: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// Para Vercel
module.exports = app;