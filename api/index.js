// api/index.js - VERSIÓN FINAL CON LISTENER
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
      version: '2.3.0-FIXED'
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
const surveyRoutes = require('../src/routes/surveys');
const adminRoutes = require('../src/routes/admin');
const candidateRoutes = require('../src/routes/candidates');
const predictionsRoutes = require('../src/routes/predictions');
const leaderboardRoutes = require('../src/routes/leaderboard');
const incidentsRoutes = require('../src/routes/incidents');
const whatsappRoutes = require('../src/routes/whatsapp');

// ===================================
// REGISTRAR RUTAS
// ===================================
app.use('/api/auth', authRoutes);
app.use('/api/data', dataRoutes);
app.use('/api/surveys', surveyRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/candidates', candidateRoutes);
app.use('/api/predictions', predictionsRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/incidents', incidentsRoutes);
app.use('/api/whatsapp', whatsappRoutes);

// ===================================
// RUTAS HTML
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

// ===================================
// LISTENER PARA DESARROLLO LOCAL
// ===================================
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
    console.log(`${'='.repeat(60)}`);
    console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
    console.log(`🏛️  Municipios: http://localhost:${PORT}/api/data/municipalities`);
    console.log(`📝 Encuestas: http://localhost:${PORT}/api/surveys/active`);
    console.log(`👤 Candidatos: http://localhost:${PORT}/api/candidates`);
    console.log(`🏠 Index: http://localhost:${PORT}/`);
    console.log(`📄 Landing: http://localhost:${PORT}/landing`);
    console.log(`⚙️  Admin: http://localhost:${PORT}/admin`);
    console.log(`${'='.repeat(60)}\n`);
  });
}

// Para Vercel
module.exports = app;