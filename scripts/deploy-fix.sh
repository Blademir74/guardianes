#!/bin/bash
echo "🚀 Aplicando correcciones de emergencia..."

# 1. Actualizar vercel.json
echo "📝 Actualizando vercel.json..."
cp vercel-fixed.json vercel.json

# 2. Actualizar index.js con estáticos
echo "🔧 Actualizando api/index.js..."
cat > api/index.js << 'EOF'
const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir archivos estáticos
app.use(express.static(path.join(__dirname, '../public')));

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

// Rutas HTML
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.get('/landing', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/landing.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/admin.html'));
});

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
EOF

echo "✅ Correcciones aplicadas!"
echo "📦 Ejecuta: vercel --prod"