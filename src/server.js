/**
 * GUARDIANES GUERRERO 2027 - ARQUITECTURA DE ALTA CONFIANZA
 * CTO: Sistema Electoral de Alta Disponibilidad y Seguridad
 * Misión: Validar la voluntad ciudadana con integridad y transparencia.
 * Stack: Node.js 20+, Express, PostgreSQL (Neon), Vercel
 * Target: 1,000 usuarios concurrentes, 100K predicciones/día
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { Pool } = require('pg');

// ===================================
// CONFIGURACIÓN CENTRALIZADA Y SEGURA
// ===================================

// Validación de variables de entorno críticas al inicio
const requiredEnvVars = ['DATABASE_URL', 'JWT_SECRET', 'ADMIN_JWT_SECRET'];
for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
        console.error(`🚨 FATAL: La variable de entorno ${envVar} no está configurada. Deteniendo el servidor.`);
        process.exit(1);
    }
}

const CONFIG = {
    // Rate Limiting - Más granular y seguro
    rateLimit: {
        global: { windowMs: 15 * 60 * 1000, max: 1000, message: { error: 'Too many requests' } },
        auth: { windowMs: 15 * 60 * 1000, max: 5, skipSuccessfulRequests: true }, // 5 intentos de auth por 15 min
        voting: { windowMs: 60 * 60 * 1000, max: 10 } // 10 votos por hora por usuario
    },
    
    // JWT Configuration - SECRETOS ESTABLES DESDE ENV
    jwt: {
        userSecret: process.env.JWT_SECRET,
        adminSecret: process.env.ADMIN_JWT_SECRET,
        userExpiresIn: '7d',
        adminExpiresIn: '24h'
    },
    
    pagination: {
        defaultLimit: 20,
        maxLimit: 100
    },
    
    // Entorno
    isProduction: process.env.NODE_ENV === 'production'
};

// ===================================
// DATABASE POOL CON CONEXIÓN Y QUERY HELPER MEJORADOS
// ===================================

let dbPool = null;

function getDbPool() {
    if (!dbPool) {
        const databaseUrl = process.env.DATABASE_URL;
        
        dbPool = new Pool({
            connectionString: databaseUrl,
            ssl: { rejectUnauthorized: false },
            max: 25, // Ligeramente aumentado para mayor concurrencia
            min: 5,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 10000,
            query_timeout: 30000,
            statement_timeout: 30000
        });

        dbPool.on('error', (err, client) => {
            console.error('❌ Error inesperado en el Pool de BD:', err.message);
            // Aquí se podría añadir lógica para notificar a un sistema de monitoreo como Sentry
        });
        
        console.log('✅ Database Pool inicializado (max: 25 conexiones)');
    }
    return dbPool;
}

// Query helper con logging estructurado para análisis
global.dbQuery = async (text, params = []) => {
    const start = Date.now();
    try {
        const pool = getDbPool();
        const result = await pool.query(text, params);
        const duration = Date.now() - start;
        
        if (duration > 500) {
            console.warn(`⚠️ Slow Query (${duration}ms): ${text.substring(0, 100)}...`);
        }
        
        // Log de auditoría para queries críticas (INSERT/UPDATE/DELETE)
        const queryType = text.trim().split(' ')[0].toUpperCase();
        if (['INSERT', 'UPDATE', 'DELETE'].includes(queryType)) {
            const auditLog = {
                timestamp: new Date().toISOString(),
                queryType: queryType,
                table: text.match(/from\s+(\w+)|into\s+(\w+)|update\s+(\w+)/i)?.[1] || 'unknown',
                duration: `${duration}ms`
            };
            console.log('🔍 AUDIT DB:', JSON.stringify(auditLog));
        }

        return result;
    } catch (error) {
        console.error('❌ Query Error:', { message: error.message, query: text.substring(0, 100) });
        throw error;
    }
};

// ===================================
// EXPRESS APP - ARQUITECTURA MODULAR Y SEGURA
// ===================================

const app = express();

// Security Middleware Stack - CSP más estricta para producción
// Security Middleware Stack - Versión Corregida
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: [
                "'self'", 
                "'unsafe-inline'",
                "https://cdn.jsdelivr.net",
                "https://cdnjs.cloudflare.com"
            ],
            // LA CLAVE ESTÁ AQUÍ: Añadir los CDNs a styleSrc
            styleSrc: [
                "'self'", 
                "'unsafe-inline'", 
                "https://fonts.googleapis.com",
                "https://cdn.jsdelivr.net",     // <-- AÑADIDO
                "https://cdnjs.cloudflare.com"  // <-- AÑADIDO
            ],
            styleSrcElem: ["'self'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'"],
            fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"],
            upgradeInsecureRequests: [],
        },
    },
    hsts: CONFIG.isProduction ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false
}));

// CORS configurado para producción con lista blanca estricta
const allowedOrigins = [
    'https://pulsoguerrero.vercel.app',
    'https://guardianes-guerrero.vercel.app'
];

if (!CONFIG.isProduction) {
    allowedOrigins.push('http://localhost:3000', 'http://localhost:5173');
}

app.use(cors({
    origin: function(origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            console.warn(`🚫 Bloqueado por CORS: ${origin}`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Rate Limiting global y específico
const globalLimiter = rateLimit(CONFIG.rateLimit.global);
const authLimiter = rateLimit(CONFIG.rateLimit.auth);
const votingLimiter = rateLimit(CONFIG.rateLimit.voting);

app.use(globalLimiter);
app.use('/api/auth', authLimiter);
app.use('/api/surveys/*/response', votingLimiter); // Aplica a la ruta de voto

// Body parsing
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// Security y Audit Trail Middleware
app.use((req, res, next) => {
    res.header('X-Content-Type-Options', 'nosniff');
    res.header('X-Frame-Options', 'DENY');
    res.header('X-XSS-Protection', '1; mode=block');
    res.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    
    // Audit Trail - Log de requests (sin datos sensibles)
    if (req.path.startsWith('/api/')) {
        const auditLog = {
            timestamp: new Date().toISOString(),
            method: req.method,
            path: req.path,
            ip: req.ip?.replace(/::ffff:/, '') || 'unknown',
            userAgent: req.get('user-agent')?.substring(0, 100) || 'unknown'
        };
        console.log('📝 AUDIT REQUEST:', JSON.stringify(auditLog));
    }
    
    next();
});

// ===================================
// IMPORTACIÓN DE RUTAS (MODULAR)
// ===================================

const { router: authRoutes } = require('./routes/auth');
const surveysRoutes = require('./routes/surveys');
const dataRoutes = require('./routes/data');
const predictionsRoutes = require('./routes/predictions');
const incidentsRoutes = require('./routes/incidents');
const leaderboardRoutes = require('./routes/leaderboard');
const adminRoutes = require('./routes/admin');

// Mount routes con /api prefix
app.use('/api/auth', authRoutes);
app.use('/api/surveys', surveysRoutes);
app.use('/api/data', dataRoutes);
app.use('/api/predictions', predictionsRoutes);
app.use('/api/incidents', incidentsRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/admin', adminRoutes);

// ===================================
// ENDPOINTS DE SALUD Y DIAGNÓSTICO
// ===================================

app.get('/api/health', async (req, res) => {
    try {
        const dbResult = await global.dbQuery('SELECT 1 as check');
        res.json({
            status: 'healthy',
            title: 'DIAGNOSTICO - VERSION 3.0',
            timestamp: new Date().toISOString(),
            environment: process.env.NODE_ENV || 'development',
            uptime: process.uptime(),
            database: dbResult.rows[0].check === 1 ? 'connected' : 'error',
            memory: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB'
        });
    } catch (error) {
        res.status(503).json({ status: 'unhealthy', error: 'Database connection failed' });
    }
});

// ... (los endpoints /api/debug y /api/db-status se mantienen similares, son útiles) ...

// ===================================
// ENDPOINTS DE RECUPERACIÓN (SOLO DESARROLLO)
// ===================================

// CRÍTICO: Estos endpoints deben estar desactivados en producción
if (!CONFIG.isProduction) {
    console.warn('⚠️ MODO DESARROLLO: Endpoints de recuperación activados.');
    app.post('/api/recover-admin', async (req, res) => { /* ... código existente ... */ });
    app.post('/api/admin/create-test-survey', async (req, res) => { /* ... código existente ... */ });
} else {
    console.log('✅ MODO PRODUCCIÓN: Endpoints de recuperación desactivados por seguridad.');
}

// ===================================
// STATIC FILES - SPA SUPPORT
// ===================================

const frontendPath = path.join(__dirname, '..', 'public');
app.use(express.static(frontendPath, {
    maxAge: CONFIG.isProduction ? '1y' : '0', // Cache agresiva solo en producción
    etag: true
}));

// SPA fallback
app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();

    const reqPath = req.path;
    if (reqPath === '/admin' || reqPath === '/admin.html') {
        return res.sendFile(path.join(frontendPath, 'admin.html'));
    }
    if (reqPath === '/landing' || reqPath === '/landing.html') {
        return res.sendFile(path.join(frontendPath, 'landing.html'));
    }
    res.sendFile(path.join(frontendPath, 'index.html'));
});

// ===================================
// ERROR HANDLING MEJORADO
// ===================================

// 404 handler
app.use((req, res) => {
    res.status(404).json({ 
        error: 'Endpoint no encontrado',
        path: req.path
    });
});

// Global error handler con logging estructurado
app.use((err, req, res, next) => {
    const errorLog = {
        message: err.message,
        stack: err.stack,
        timestamp: new Date().toISOString(),
        path: req.path,
        method: req.method,
        ip: req.ip
    };
    
    console.error('❌ Error Crítico:', JSON.stringify(errorLog, null, 2));
    
    // En producción, no exponer el stack
    const response = CONFIG.isProduction 
        ? { error: 'Error interno del servidor' }
        : { error: err.message, stack: err.stack };
        
    res.status(err.status || 500).json(response);
});

// ===================================
// GRACEFUL SHUTDOWN
// ===================================

process.on('SIGTERM', async () => {
    console.log('🔄 SIGTERM received, closing connections...');
    if (dbPool) await dbPool.end();
    process.exit(0);
});

// ===================================
// EXPORT PARA VERCEL
// ===================================

module.exports = app;

console.log('🔥🔥🔥 ESTE ES EL NUEVO SERVIDOR - DESPLIEGUE DE PRUEBA 🔥🔥🔥');