// api/index.js
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Log de requests
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV 
  });
});

// Importar rutas
const authRoutes = require('../src/routes/auth');
const dataRoutes = require('../src/routes/data');
const surveyRoutes = require('../src/routes/survey');
const adminRoutes = require('../src/routes/admin');
const candidateRoutes = require('../src/routes/candidate');
const predictionsRoutes = require('../src/routes/predictions');
const leaderboardRoutes = require('../src/routes/leaderboard');
const incidentsRoutes = require('../src/routes/incidents');
const whatsappRoutes = require('../src/routes/whatsapp');

// Registrar rutas
app.use('/api/auth', authRoutes);
app.use('/api/data', dataRoutes);
app.use('/api/surveys', surveyRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/candidates', candidateRoutes);
app.use('/api/predictions', predictionsRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/incidents', incidentsRoutes);
app.use('/api/whatsapp', whatsappRoutes);

// Error 404
app.use((req, res) => {
  console.log(`❌ 404 - Ruta no encontrada: ${req.method} ${req.path}`);
  res.status(404).json({ 
    error: 'Route not found',
    path: req.path,
    method: req.method 
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('❌ Error:', err);
  res.status(err.status || 500).json({ 
    error: err.message || 'Internal server error',
    details: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// Para Vercel
module.exports = app;