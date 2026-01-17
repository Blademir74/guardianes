const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const xss = require('xss-clean');
const { getDbPool } = require('./db');

// ===================================
// CONFIGURACIÓN DEL SERVIDOR
// ===================================

const app = express();

// 1. Seguridad Avanzada
app.use(helmet()); // Headers de seguridad
app.use(xss()); // Sanitización contra XSS

// Configuración CORS Permisiva para desarrollo/prod controlado
const corsOptions = {
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};
app.use(cors(corsOptions));

// 2. Parsers
app.use(express.json({ limit: '10kb' })); // Limitar tamaño de body
app.use(express.urlencoded({ extended: true }));

// 3. Rate Limiting (Protección DDOS básica)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 1000, // Límite de 1000 peticiones por IP
  message: 'Demasiadas peticiones desde esta IP, por favor intente de nuevo más tarde.'
});
app.use('/api/', limiter);

const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 10, // Max 5 intentos de login/verify por hora por IP
  message: 'Demasiados intentos de autenticación.'
});
app.use('/api/auth/', authLimiter);

// 4. Logging
app.use((req, res, next) => {
  if (req.path !== '/api/health') {
    console.log(`📨 ${req.method} ${req.path}`);
  }
  next();
});

// ===================================
// RUTAS
// ===================================

// Rutas Públicas y Auth
app.use('/api/auth', require('./routes/auth'));
app.use('/api/public', require('./routes/public-data'));

// Rutas Protegidas (Requieren Auth Middleware interno)
app.use('/api/surveys', require('./routes/surveys'));
app.use('/api/incidents', require('./routes/incidents'));
app.use('/api/admin', require('./routes/admin'));

// Health Check (Vital para Vercel/Render)
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

// STATIC FILES (Solo para dev local, Vercel lo maneja fuera)
if (process.env.NODE_ENV !== 'production') {
  app.use(express.static(path.join(__dirname, '../public')));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(__dirname, '../public/index.html'));
    } else {
      res.status(404).json({ error: 'Endpoint not found' });
    }
  });
}

// Server Start (Local)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`\n🚀 Guerrero Guardianes 2027 System Active`);
    console.log(`📍 Port: ${PORT}`);
  });
}

module.exports = app;