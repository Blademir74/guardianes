const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const { Pool } = require('pg');

// ===================================
// CONFIGURACIÓN DE BASE DE DATOS
// ===================================

let dbPool = null;

function getDbPool() {
  if (!dbPool) {
    console.log('🔄 Creando pool de BD para Vercel...');
    
    const databaseUrl = process.env.DATABASE_URL;
    
    if (!databaseUrl) {
      console.error('❌ DATABASE_URL no está configurada');
      throw new Error('DATABASE_URL no configurada en variables de entorno');
    }
    
    console.log('✅ DATABASE_URL encontrada');
    console.log('📍 Conexión:', databaseUrl.substring(0, 50) + '...');

    dbPool = new Pool({
      connectionString: databaseUrl,
      ssl: { 
        rejectUnauthorized: false 
      },
      max: 3,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });

    dbPool.on('error', (err) => {
      console.error('❌ Error en pool de BD:', err.message);
      dbPool = null; // Reset pool on error
    });

    console.log('✅ Pool de BD creado exitosamente');
  }
  return dbPool;
}

// Función global para queries con mejor manejo de errores
global.dbQuery = async (text, params = []) => {
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    console.log('🔍 Ejecutando query:', text.substring(0, 100) + '...');
    const result = await client.query(text, params);
    console.log('✅ Query exitosa, filas:', result.rows.length);
    return result;
  } catch (error) {
    console.error('❌ Error en query:', error.message);
    throw error;
  } finally {
    client.release();
  }
};

// ===================================
// CONFIGURACIÓN DE EXPRESS
// ===================================

const app = express();

// Helmet con configuración permisiva para CSP
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.tailwindcss.com", "https://cdn.jsdelivr.net"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", "data:", "https:"],
    },
  },
}));

// CORS permisivo
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging middleware
app.use((req, res, next) => {
  console.log(`📨 ${req.method} ${req.path}`);
  next();
});

// ===================================
// IMPORTAR RUTAS DE src/routes/
// ===================================

const authRoutes = require('./routes/auth');
const surveysRoutes = require('./routes/surveys');
const dataRoutes = require('./routes/data');
const predictionsRoutes = require('./routes/predictions');
const incidentsRoutes = require('./routes/incidents');
const leaderboardRoutes = require('./routes/leaderboard');
const adminRoutes = require('./routes/admin');

// Montar rutas
app.use('/api/auth', authRoutes);
app.use('/api/surveys', surveysRoutes);
app.use('/api/data', dataRoutes);
app.use('/api/predictions', predictionsRoutes);
app.use('/api/incidents', incidentsRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/admin', adminRoutes);

// ===================================
// ENDPOINTS DE DIAGNÓSTICO
// ===================================

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development',
    database: process.env.DATABASE_URL ? 'configured' : 'missing',
    vercel: !!process.env.VERCEL,
  });
});

app.get('/api/debug', (req, res) => {
  res.json({
    status: 'debug',
    timestamp: new Date().toISOString(),
    env: {
      DATABASE_URL: process.env.DATABASE_URL ? '✅ configured' : '❌ missing',
      JWT_SECRET: process.env.JWT_SECRET ? '✅ configured' : '❌ missing',
      ADMIN_JWT_SECRET: process.env.ADMIN_JWT_SECRET ? '✅ configured' : '❌ missing',
      NODE_ENV: process.env.NODE_ENV || 'not set',
      VERCEL: process.env.VERCEL || 'not on vercel',
      VERCEL_ENV: process.env.VERCEL_ENV || 'not set',
    }
  });
});

app.get('/api/db-test', async (req, res) => {
  try {
    console.log('🧪 Testeando conexión a BD...');
    const result = await global.dbQuery('SELECT NOW() as now, version() as version');
    res.json({
      success: true,
      timestamp: result.rows[0].now,
      version: result.rows[0].version,
      message: '✅ Conexión a BD exitosa'
    });
  } catch (error) {
    console.error('❌ Error al conectar a BD:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: error.code,
      hint: 'Verifica DATABASE_URL en Vercel Dashboard'
    });
  }
});

app.get('/api/db-status', async (req, res) => {
  try {
    console.log('📊 Verificando estado de tablas...');
    
    const tables = ['municipalities', 'resultados_electorales', 'surveys', 'survey_questions', 'survey_responses', 'admins', 'users'];
    const counts = {};
    
    for (const table of tables) {
      try {
        const result = await global.dbQuery(`SELECT COUNT(*) as count FROM ${table}`);
        counts[table] = parseInt(result.rows[0].count);
      } catch (err) {
        counts[table] = `❌ ${err.message}`;
      }
    }

    res.json({
      success: true,
      tables: counts,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// ===================================
// ENDPOINTS DE AUTENTICACIÓN (MOCK)
// ===================================

app.post('/api/auth/request-code', (req, res) => {
  const { phone } = req.body;
  console.log('📱 Solicitud de código para:', phone);

  if (!phone) {
    return res.status(400).json({ error: 'Teléfono requerido' });
  }

  res.json({
    success: true,
    message: 'Código enviado (mock)',
    code: '1234' // Para testing
  });
});

app.post('/api/auth/verify-code', (req, res) => {
  const { phone, code } = req.body;
  console.log('🔐 Verificación de código:', phone, code);

  if (!phone || !code) {
    return res.status(400).json({ error: 'Teléfono y código requeridos' });
  }

  if (code.length === 4) {
    res.json({
      success: true,
      token: 'mock-jwt-token-for-testing',
      user: {
        id: 1,
        phone: phone,
        points: 0,
        predictionsCount: 0
      }
    });
  } else {
    res.status(400).json({ error: 'Código inválido' });
  }
});

app.get('/api/auth/me', (req, res) => {
  res.json({
    id: 1,
    phone: '5512345678',
    points: 150,
    predictionsCount: 5,
    accuracyPct: 80
  });
});

// ===================================
// ENDPOINTS DE ADMIN (MOCK)
// ===================================

app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  console.log('🔓 Login admin:', username);

  if (username === 'admin' && password === 'admin123') {
    res.json({
      success: true,
      token: 'mock-admin-jwt-token',
      admin: {
        id: 1,
        username: 'admin'
      }
    });
  } else {
    res.status(401).json({ error: 'Credenciales inválidas' });
  }
});

// ===================================
// ENDPOINTS DE DATOS (CON BD)
// ===================================

app.get('/api/data/municipios', async (req, res) => {
  try {
    console.log('🏛️ Obteniendo municipios...');
    const result = await global.dbQuery(`
      SELECT id, name, state
      FROM municipalities
      ORDER BY name ASC
      LIMIT 100
    `);
    
    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    console.error('❌ Error obteniendo municipios:', error);
    
    // Fallback a datos mock
    res.json({
      success: true,
      data: [
        { id: 1, name: 'Acapulco de Juárez', state: 'Guerrero' },
        { id: 2, name: 'Chilpancingo de los Bravo', state: 'Guerrero' },
        { id: 3, name: 'Iguala de la Independencia', state: 'Guerrero' },
        { id: 4, name: 'Zihuatanejo de Azueta', state: 'Guerrero' },
        { id: 5, name: 'Taxco de Alarcón', state: 'Guerrero' }
      ],
      count: 5,
      fallback: true,
      error: error.message
    });
  }
});

app.get('/api/surveys/active', async (req, res) => {
  try {
    console.log('📊 Obteniendo encuestas activas...');
    const result = await global.dbQuery(`
      SELECT
        s.id,
        s.title,
        s.description,
        s.election_type as "electionType",
        COUNT(DISTINCT sr.user_id) as "totalRespondents"
      FROM surveys s
      LEFT JOIN survey_responses sr ON sr.survey_id = s.id
      WHERE s.is_active = true
      GROUP BY s.id
      ORDER BY s.created_at DESC
      LIMIT 10
    `);
    
    res.json({
      success: true,
      surveys: result.rows,
      total: result.rows.length
    });
  } catch (error) {
    console.error('❌ Error obteniendo encuestas:', error);
    
    // Fallback a datos mock
    res.json({
      success: true,
      surveys: [{
        id: 1,
        title: 'Encuesta Piloto Electoral 2027',
        description: 'Predicción Gubernatura Guerrero',
        electionType: 'Gubernatura',
        totalRespondents: 0
      }],
      total: 1,
      fallback: true,
      error: error.message
    });
  }
});

app.get('/api/data/comparacion/:id', async (req, res) => {
  try {
    const municipioId = parseInt(req.params.id);
    console.log('📈 Comparación para municipio:', municipioId);

    const municipioResult = await global.dbQuery(
      'SELECT name FROM municipalities WHERE id = $1',
      [municipioId]
    );

    if (municipioResult.rows.length === 0) {
      return res.status(404).json({ error: 'Municipio no encontrado' });
    }

    const municipioNombre = municipioResult.rows[0].name;

    const result = await global.dbQuery(`
      SELECT
        tipo_eleccion,
        COALESCE(ROUND((SUM(CASE WHEN anio = 2024 THEN votos_validos ELSE 0 END)::numeric /
                       NULLIF(SUM(CASE WHEN anio = 2024 THEN lista_nominal ELSE 0 END), 0) * 100), 2), 0.00) as "2024",
        COALESCE(ROUND((SUM(CASE WHEN anio = 2021 THEN votos_validos ELSE 0 END)::numeric /
                       NULLIF(SUM(CASE WHEN anio = 2021 THEN lista_nominal ELSE 0 END), 0) * 100), 2), 0.00) as "2021",
        COALESCE(ROUND((SUM(CASE WHEN anio = 2018 THEN votos_validos ELSE 0 END)::numeric /
                       NULLIF(SUM(CASE WHEN anio = 2018 THEN lista_nominal ELSE 0 END), 0) * 100), 2), 0.00) as "2018"
      FROM resultados_electorales
      WHERE tipo_eleccion IN ('Ayuntamiento','Diputación Local','Gubernatura')
        AND trim(upper(split_part(ambito_nombre, ' - ', 2))) LIKE trim(upper($1))
      GROUP BY tipo_eleccion
      ORDER BY tipo_eleccion
    `, [municipioNombre]);

    res.json({
      success: true,
      municipio: municipioNombre,
      data: result.rows
    });
  } catch (error) {
    console.error('❌ Error en comparación:', error);
    
    res.json({
      success: true,
      data: [
        { tipo_eleccion: 'Ayuntamiento', "2018": 60.92, "2021": 60.04, "2024": 58.45 },
        { tipo_eleccion: 'Diputación Local', "2018": 60.92, "2021": 60.06, "2024": 60.75 }
      ],
      fallback: true,
      error: error.message
    });
  }
});

app.get('/api/data/participacion/:id', async (req, res) => {
  try {
    const municipioId = parseInt(req.params.id);
    console.log('📊 Participación para municipio:', municipioId);

    const municipioResult = await global.dbQuery(
      'SELECT name FROM municipalities WHERE id = $1',
      [municipioId]
    );

    if (municipioResult.rows.length === 0) {
      return res.status(404).json({ error: 'Municipio no encontrado' });
    }

    const municipioNombre = municipioResult.rows[0].name;

    const result = await global.dbQuery(`
      SELECT
        tipo_eleccion,
        anio AS year,
        COALESCE(ROUND((SUM(votos_validos)::numeric / NULLIF(SUM(lista_nominal), 0) * 100), 2), 0.00) as participacion
      FROM resultados_electorales
      WHERE trim(upper(split_part(ambito_nombre, ' - ', 2))) LIKE trim(upper($1))
        AND tipo_eleccion IN ('Ayuntamiento','Diputación Local','Gubernatura')
      GROUP BY tipo_eleccion, anio
      ORDER BY anio DESC, tipo_eleccion
      LIMIT 20
    `, [municipioNombre]);

    res.json({
      success: true,
      municipio: municipioNombre,
      data: result.rows
    });
  } catch (error) {
    console.error('❌ Error en participación:', error);
    
    res.json({
      success: true,
      data: [
        { tipo_eleccion: 'Ayuntamiento', year: 2024, participacion: 58.45 },
        { tipo_eleccion: 'Ayuntamiento', year: 2021, participacion: 60.04 },
        { tipo_eleccion: 'Diputación Local', year: 2024, participacion: 60.75 }
      ],
      fallback: true,
      error: error.message
    });
  }
});

// ===================================
// ARCHIVOS ESTÁTICOS Y RUTAS HTML
// ===================================

const frontendPath = path.join(__dirname, '..', 'public');
app.use(express.static(frontendPath));

// Rutas HTML
app.get('/', (req, res) => {
  res.sendFile(path.join(frontendPath, 'landing.html'), (err) => {
    if (err) {
      res.status(404).send('landing.html no encontrado en public/');
    }
  });
});

app.get('/portal', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'), (err) => {
    if (err) {
      res.status(404).send('index.html (portal ciudadano) no encontrado');
    }
  });
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(frontendPath, 'admin.html'), (err) => {
    if (err) {
      res.status(404).send('admin.html no encontrado en public/');
    }
  });
});

app.get('/test', (req, res) => {
  res.sendFile(path.join(frontendPath, 'test.html'), (err) => {
    if (err) {
      res.status(404).send('test.html no encontrado');
    }
  });
});

app.get('/diagnostico', (req, res) => {
  res.sendFile(path.join(frontendPath, 'diagnostico.html'), (err) => {
    if (err) {
      res.status(404).send('diagnostico.html no encontrado');
    }
  });
});

// ===================================
// ERROR HANDLING
// ===================================

app.use((err, req, res, next) => {
  console.error('❌ Error no manejado:', err);
  res.status(500).json({
    error: 'Error interno del servidor',
    message: err.message,
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use((req, res) => {
  console.log('❌ 404 - Ruta no encontrada:', req.path);
  res.status(404).json({
    error: 'Ruta no encontrada',
    path: req.path,
    timestamp: new Date().toISOString()
  });
});

// ===================================
// EXPORT PARA VERCEL
// ===================================

// Para desarrollo local
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`\n🚀 Servidor corriendo en http://localhost:${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
    console.log(`🔍 Debug: http://localhost:${PORT}/api/debug`);
    console.log(`🗄️  DB Status: http://localhost:${PORT}/api/db-status\n`);
  });
}

// Export para Vercel
module.exports = app;