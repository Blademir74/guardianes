// api/index.js
// API Principal - Guerrero Guardianes 2027
require('dotenv').config({ path: '.env.local' });

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// Importar DB
const { getDbPool } = require('../src/db');

// Crear app
const app = express();

// =====================================================
// MIDDLEWARES GLOBALES
// =====================================================

// Seguridad
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

// CORS
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 1000, // 1000 requests por IP
  message: { error: 'Demasiadas peticiones, intenta de nuevo más tarde' }
});
app.use('/api/', limiter);

// Logging
app.use((req, res, next) => {
  if (req.path !== '/api/health') {
    console.log(`📨 ${req.method} ${req.path}`);
  }
  next();
});

// =====================================================
// HEALTH CHECK
// =====================================================
app.get('/api/health', async (req, res) => {
  let dbStatus = 'disconnected';
  let dbError = null;

  try {
    const pool = getDbPool();
    if (pool) {
      await pool.query('SELECT NOW()');
      dbStatus = 'connected';
    }
  } catch (error) {
    dbStatus = 'error';
    dbError = error.message;
  }

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    database: {
      status: dbStatus,
      error: dbError
    },
    version: '2.2.0-CTO-Ready'
  });
});

// =====================================================
// IMPORTAR RUTAS (con manejo de errores)
// =====================================================

function safeRoute(routePath, routeName) {
  try {
    const route = require(`../src/routes/${routePath}`);
    console.log(`✅ Ruta cargada: ${routeName}`);
    return route;
  } catch (error) {
    console.error(`❌ Error cargando ruta ${routeName}:`, error.message);
    
    // Retornar router vacío que responde con error
    const router = express.Router();
    router.all('*', (req, res) => {
      res.status(503).json({
        error: `Ruta ${routeName} temporalmente no disponible`,
        message: 'El servicio está en mantenimiento'
      });
    });
    return router;
  }
}

// Montar rutas
app.use('/api/auth', safeRoute('auth', 'auth'));
app.use('/api/data', safeRoute('data', 'data'));
app.use('/api/surveys', safeRoute('surveys', 'surveys'));
app.use('/api/predictions', safeRoute('predictions', 'predictions'));
app.use('/api/incidents', safeRoute('incidents', 'incidents'));
app.use('/api/candidates', safeRoute('candidates', 'candidates'));
app.use('/api/leaderboard', safeRoute('leaderboard', 'leaderboard'));
app.use('/api/admin', safeRoute('admin', 'admin'));

// =====================================================
// ENDPOINT RAÍZ DE API
// =====================================================
app.get('/api', (req, res) => {
  res.json({
    name: 'Guerrero Guardianes API',
    version: '2.2.0',
    status: 'operational',
    endpoints: {
      health: '/api/health',
      auth: '/api/auth/*',
      data: '/api/data/*',
      surveys: '/api/surveys/*',
      predictions: '/api/predictions/*',
      incidents: '/api/incidents/*',
      candidates: '/api/candidates/*',
      leaderboard: '/api/leaderboard',
      admin: '/api/admin/*'
    },
    documentation: 'https://docs.pulsoguerrero.com'
  });
});

// =====================================================
// MANEJO DE ERRORES 404
// =====================================================
app.use((req, res, next) => {
  res.status(404).json({
    error: 'Ruta no encontrada',
    path: req.path,
    method: req.method,
    suggestion: 'Visita /api para ver endpoints disponibles'
  });
});

// =====================================================
// MANEJO DE ERRORES GLOBAL
// =====================================================
app.use((err, req, res, next) => {
  console.error('❌ Error en servidor:', err);
  
  res.status(err.status || 500).json({
    error: 'Error interno del servidor',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Ocurrió un error inesperado',
    path: req.path
  });
});

// =====================================================
// INICIAR SERVIDOR (solo si se ejecuta directamente)
// =====================================================
const PORT = process.env.PORT || 3000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log('\n' + '═'.repeat(60));
    console.log('🚀 SERVIDOR INICIADO');
    console.log('═'.repeat(60));
    console.log(`📡 URL: http://localhost:${PORT}`);
    console.log(`🏥 Health: http://localhost:${PORT}/api/health`);
    console.log(`📚 API Docs: http://localhost:${PORT}/api`);
    console.log(`🌍 Entorno: ${process.env.NODE_ENV || 'development'}`);
    console.log('═'.repeat(60) + '\n');
  });
}

// Exportar para Vercel
module.exports = app;