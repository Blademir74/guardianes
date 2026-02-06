// api/index.js - GUARDIANES GUERRERO
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const fs = require('fs');

const app = express();

// ==========================================
// 1. SECURITY & PARSING MIDDLEWARE
// ==========================================
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? ['https://pulsoguerrero.vercel.app/']
    : '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use((req, res, next) => {
  if (!req.path.includes('.well-known') && !req.path.includes('favicon')) {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  }
  next();
});

// ==========================================
// 2. HEALTH CHECK
// ==========================================
app.get('/api/health', async (req, res) => {
  try {
    const { query } = require('../src/db');
    const dbCheck = await query('SELECT NOW()');
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: 'connected',
      dbTime: dbCheck.rows[0].now
    });
  } catch (err) {
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// ==========================================
// 3. API ROUTES REGISTRATION
// ==========================================
const routesPath = path.join(__dirname, '../src/routes');

// Helper to safely require routes
const requireRoute = (name) => {
  try {
    const routePath = path.join(routesPath, `${name}.js`);
    if (fs.existsSync(routePath)) {
      console.log(`✅ Loading route: /api/${name}`);
      return require(routePath);
    } else {
      console.warn(`⚠️ Route file not found: ${name}.js`);
      return null;
    }
  } catch (err) {
    console.error(`❌ Error loading route ${name}:`, err);
    return null;
  }
};

const authRoutes = requireRoute('auth');
const dataRoutes = require('../src/routes/data');
const surveyRoutes = requireRoute('surveys');
const adminRoutes = require('../src/routes/admin');
const candidateRoutes = requireRoute('candidates');
const predictionsRoutes = requireRoute('predictions');
const leaderboardRoutes = requireRoute('leaderboard');
const incidentsRoutes = requireRoute('incidents');
const whatsappRoutes = requireRoute('whatsapp');
const historicalRoutes = requireRoute('historical');
const webhookRouter = require('./routes/webhook');

if (webhookRoutesRoutes) app.use('/api/webhook', webhookRouter);
if (authRoutes) app.use('/api/auth', authRoutes);
if (dataRoutes) app.use('/api/data', dataRoutes);
if (surveyRoutes) app.use('/api/surveys', surveyRoutes);
if (adminRoutes) app.use('/api/admin', adminRoutes);
if (candidateRoutes) app.use('/api/candidates', candidateRoutes);
if (predictionsRoutes) app.use('/api/predictions', predictionsRoutes);
if (leaderboardRoutes) app.use('/api/leaderboard', leaderboardRoutes);
if (incidentsRoutes) app.use('/api/incidents', incidentsRoutes);
if (whatsappRoutes) app.use('/api/whatsapp', whatsappRoutes);
// Synchronize historical route naming
if (historicalRoutes) app.use('/api/historical', historicalRoutes);

// ==========================================
// 4. STATIC FILES & HTML ROUTES
// ==========================================
const publicPath = path.join(__dirname, '../public');
app.use(express.static(publicPath, { maxAge: '1d' }));

app.get('/', (req, res) => {
  res.sendFile(path.join(publicPath, 'index.html'));
});

app.get('/landing', (req, res) => {
  res.sendFile(path.join(publicPath, 'landing.html'));
});

// Explicit Admin Route
app.get('/admin', (req, res) => {
  const adminPath = path.join(publicPath, 'admin.html');
  if (fs.existsSync(adminPath)) {
    console.log('✅ Serving Admin Portal');
    res.sendFile(adminPath);
  } else {
    console.error('❌ Admin file missing at:', adminPath);
    res.status(404).send('Admin portal file not found');
  }
});

// ==========================================
// 5. ERROR HANDLING
// ==========================================
app.use((req, res) => {
  if (req.path.startsWith('/api')) {
    res.status(404).json({ error: 'Endpoint not found' });
  } else {
    res.status(404).redirect('/');
  }
});

app.use((err, req, res, next) => {
  console.error('❌ Global Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error'
  });
});

// ==========================================
// 6. SERVER START
// ==========================================
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`\n🚀 Server running at http://localhost:${PORT}`);
    console.log(`⚙️  Admin Portal at http://localhost:${PORT}/admin`);
    console.log(`📂 Public dir: ${publicPath}`);
  });
}

module.exports = app;