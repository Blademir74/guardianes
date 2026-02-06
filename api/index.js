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
    ? ['https://pulsoguerrero.vercel.app']
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
// 2. INTEGRACIÓN DIRECTA DE WHATSAPP WEBHOOK (MOVIDO AQUÍ ARRIBA)
// ==========================================
const WHATSAPP_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || 'guardianes_guerrero_webhook_2027_secure_token';

// 1. Verificación (GET) - Lo que pide Meta
app.get('/api/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  console.log('🔍 Webhook check:', { mode, token, challenge });

  if (mode === 'subscribe' && token === WHATSAPP_TOKEN) {
    console.log('✅ Webhook verificado correctamente');
    res.status(200).send(challenge);
  } else {
    console.error('❌ Fallo verificación webhook');
    res.sendStatus(403);
  }
});

// 2. Recepción de mensajes (POST)
app.post('/api/webhook', async (req, res) => {
  console.log('📩 Webhook evento recibido');
  res.sendStatus(200);
  
  try {
    const body = req.body;
    if (body.object === 'whatsapp_business_account') {
       console.log('Payload:', JSON.stringify(body, null, 2));
    }
  } catch (e) {
    console.error('Error procesando mensaje:', e);
  }
});

// ==========================================
// 3. HEALTH CHECK
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
// 4. API ROUTES REGISTRATION
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
const historicalRoutes = requireRoute('historical');

if (authRoutes) app.use('/api/auth', authRoutes);
if (dataRoutes) app.use('/api/data', dataRoutes);
if (surveyRoutes) app.use('/api/surveys', surveyRoutes);
if (adminRoutes) app.use('/api/admin', adminRoutes);
if (candidateRoutes) app.use('/api/candidates', candidateRoutes);
if (predictionsRoutes) app.use('/api/predictions', predictionsRoutes);
if (leaderboardRoutes) app.use('/api/leaderboard', leaderboardRoutes);
if (incidentsRoutes) app.use('/api/incidents', incidentsRoutes);
if (historicalRoutes) app.use('/api/historical', historicalRoutes);

// ==========================================
// 5. STATIC FILES & HTML ROUTES
// ==========================================
const publicPath = path.join(__dirname, '../public');
app.use(express.static(publicPath, { maxAge: '1d' }));

app.get('/', (req, res) => {
  res.sendFile(path.join(publicPath, 'index.html'));
});

app.get('/landing', (req, res) => {
  res.sendFile(path.join(publicPath, 'landing.html'));
});

app.get('/admin', (req, res) => {
  const adminPath = path.join(publicPath, 'admin.html');
  if (fs.existsSync(adminPath)) {
    res.sendFile(adminPath);
  } else {
    res.status(404).send('Admin portal file not found');
  }
});

// ==========================================
// 6. ERROR HANDLING (Siempre al final)
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
// 7. SERVER START
// ==========================================
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`\n🚀 Server running at http://localhost:${PORT}`);
  });
}

module.exports = app;