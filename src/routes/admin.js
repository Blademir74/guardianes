// backend/src/routes/admin.js
const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../db');
const { verifyAdminToken, generateAdminToken } = require('../middleware/auth');

const router = express.Router();

// ========================================
// AUTENTICACIÓN ADMIN
// ========================================

/**
 * POST /api/admin/login
 * Login para administradores
 */
router.post('/login', async (req, res) => {
  console.log('🔐 Admin login attempt');
  
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username y password requeridos' });
    }

    // Buscar admin en BD
    const result = await db.query(`
      SELECT id, username, password_hash, role, created_at
      FROM admins
      WHERE username = $1 AND is_active = true
    `, [username]);

    if (result.rows.length === 0) {
      console.log('❌ Admin no encontrado:', username);
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const admin = result.rows[0];

    // Verificar password
    const isValid = await bcrypt.compare(password, admin.password_hash);
    
    if (!isValid) {
      console.log('❌ Password incorrecto para:', username);
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    // Generar token admin
    const token = generateAdminToken(admin.id, admin.username);

    // Actualizar last_login
    await db.query(`
      UPDATE admins SET last_login = NOW() WHERE id = $1
    `, [admin.id]);

    console.log('✅ Admin login exitoso:', username);

    res.json({
      success: true,
      token,
      admin: {
        id: admin.id,
        username: admin.username,
        role: admin.role
      }
    });

  } catch (error) {
    console.error('❌ Error en admin login:', error);
    res.status(500).json({ error: 'Error interno' });
  }
});

// ========================================
// ESTADÍSTICAS
// ========================================

/**
 * GET /api/admin/stats
 * Estadísticas generales del sistema
 */
router.get('/stats', verifyAdminToken, async (req, res) => {
  try {
    // Total usuarios
    const usersResult = await db.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours') as today,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') as week
      FROM users
    `);

    // Total predicciones
    const predictionsResult = await db.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours') as today,
        AVG(confidence) as avg_confidence
      FROM predictions
    `);

    // Total incidentes
    const incidentsResult = await db.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours') as today,
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'verified') as verified
      FROM incidents
    `);

    // Puntos totales
    const pointsResult = await db.query(`
      SELECT SUM(points) as total_points FROM users
    `);

    // Distribución por municipio
    const municipiosResult = await db.query(`
      SELECT 
        m.name,
        COUNT(DISTINCT p.user_id) as usuarios,
        COUNT(p.id) as predicciones
      FROM municipalities m
      LEFT JOIN predictions p ON p.municipality_id = m.id
      GROUP BY m.id, m.name
      ORDER BY predicciones DESC
      LIMIT 10
    `);

    res.json({
      users: {
        total: parseInt(usersResult.rows[0].total),
        today: parseInt(usersResult.rows[0].today),
        week: parseInt(usersResult.rows[0].week)
      },
      predictions: {
        total: parseInt(predictionsResult.rows[0].total),
        today: parseInt(predictionsResult.rows[0].today),
        avgConfidence: parseFloat(predictionsResult.rows[0].avg_confidence || 0).toFixed(1)
      },
      incidents: {
        total: parseInt(incidentsResult.rows[0].total),
        today: parseInt(incidentsResult.rows[0].today),
        pending: parseInt(incidentsResult.rows[0].pending),
        verified: parseInt(incidentsResult.rows[0].verified)
      },
      points: {
        total: parseInt(pointsResult.rows[0].total_points || 0)
      },
      topMunicipios: municipiosResult.rows
    });

  } catch (error) {
    console.error('❌ Error obteniendo stats:', error);
    res.status(500).json({ error: 'Error obteniendo estadísticas' });
  }
});

/**
 * GET /api/admin/stats/timeline
 * Serie temporal de registros por día
 */
router.get('/stats/timeline', verifyAdminToken, async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;

    const result = await db.query(`
      WITH dates AS (
        SELECT generate_series(
          NOW() - INTERVAL '${days} days',
          NOW(),
          INTERVAL '1 day'
        )::date AS date
      )
      SELECT 
        d.date,
        COUNT(DISTINCT u.id) as new_users,
        COUNT(DISTINCT p.id) as predictions,
        COUNT(DISTINCT i.id) as incidents
      FROM dates d
      LEFT JOIN users u ON u.created_at::date = d.date
      LEFT JOIN predictions p ON p.created_at::date = d.date
      LEFT JOIN incidents i ON i.created_at::date = d.date
      GROUP BY d.date
      ORDER BY d.date
    `);

    res.json(result.rows);

  } catch (error) {
    console.error('❌ Error en timeline:', error);
    res.status(500).json({ error: 'Error obteniendo timeline' });
  }
});

// ========================================
// GESTIÓN DE USUARIOS
// ========================================

/**
 * GET /api/admin/users
 * Lista de usuarios con paginación
 */
router.get('/users', verifyAdminToken, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';

    let query = `
      SELECT 
        id,
        LEFT(phone_hash, 16) || '...' as phone_preview,
        points,
        predictions_count,
        accuracy_pct,
        created_at,
        last_active
      FROM users
      WHERE 1=1
    `;

    const params = [];
    let paramIndex = 1;

    if (search) {
      query += ` AND (CAST(id AS TEXT) LIKE $${paramIndex} OR phone_hash LIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await db.query(query, params);

    // Total count
    const countResult = await db.query('SELECT COUNT(*) FROM users');
    const total = parseInt(countResult.rows[0].count);

    res.json({
      users: result.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('❌ Error obteniendo usuarios:', error);
    res.status(500).json({ error: 'Error obteniendo usuarios' });
  }
});

/**
 * GET /api/admin/users/:id
 * Detalle de un usuario específico
 */
router.get('/users/:id', verifyAdminToken, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);

    const userResult = await db.query(`
      SELECT 
        id,
        LEFT(phone_hash, 16) || '...' as phone_preview,
        points,
        predictions_count,
        accuracy_pct,
        created_at,
        last_active
      FROM users
      WHERE id = $1
    `, [userId]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    // Predicciones del usuario
    const predictionsResult = await db.query(`
      SELECT 
        p.id,
        p.confidence,
        p.created_at,
        c.name as candidate_name,
        c.party,
        m.name as municipality_name,
        e.name as election_name
      FROM predictions p
      JOIN candidates c ON c.id = p.candidate_id
      JOIN municipalities m ON m.id = p.municipality_id
      JOIN elections e ON e.id = p.election_id
      WHERE p.user_id = $1
      ORDER BY p.created_at DESC
      LIMIT 20
    `, [userId]);

    // Incidentes del usuario
    const incidentsResult = await db.query(`
      SELECT 
        i.id,
        i.type,
        i.description,
        i.status,
        i.created_at,
        m.name as municipality_name
      FROM incidents i
      JOIN municipalities m ON m.id = i.municipality_id
      WHERE i.user_id = $1
      ORDER BY i.created_at DESC
      LIMIT 20
    `, [userId]);

    res.json({
      user: userResult.rows[0],
      predictions: predictionsResult.rows,
      incidents: incidentsResult.rows
    });

  } catch (error) {
    console.error('❌ Error obteniendo usuario:', error);
    res.status(500).json({ error: 'Error obteniendo usuario' });
  }
});

// ========================================
// RANKINGS
// ========================================

/**
 * GET /api/admin/rankings
 * Top usuarios por puntos, predicciones, precisión
 */
router.get('/rankings', verifyAdminToken, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;

    // Top por puntos
    const byPoints = await db.query(`
      SELECT 
        id,
        LEFT(phone_hash, 16) || '...' as user_id,
        points,
        predictions_count,
        accuracy_pct,
        last_active
      FROM users
      ORDER BY points DESC
      LIMIT $1
    `, [limit]);

    // Top por predicciones
    const byPredictions = await db.query(`
      SELECT 
        id,
        LEFT(phone_hash, 16) || '...' as user_id,
        points,
        predictions_count,
        accuracy_pct,
        last_active
      FROM users
      WHERE predictions_count > 0
      ORDER BY predictions_count DESC
      LIMIT $1
    `, [limit]);

    // Top por precisión (solo usuarios con 10+ predicciones)
    const byAccuracy = await db.query(`
      SELECT 
        id,
        LEFT(phone_hash, 16) || '...' as user_id,
        points,
        predictions_count,
        accuracy_pct,
        last_active
      FROM users
      WHERE predictions_count >= 10
      ORDER BY accuracy_pct DESC, predictions_count DESC
      LIMIT $1
    `, [limit]);

    res.json({
      byPoints: byPoints.rows,
      byPredictions: byPredictions.rows,
      byAccuracy: byAccuracy.rows
    });

  } catch (error) {
    console.error('❌ Error obteniendo rankings:', error);
    res.status(500).json({ error: 'Error obteniendo rankings' });
  }
});

// ========================================
// DASHBOARD DE CONSOLIDACIÓN
// ========================================

/**
 * GET /api/admin/dashboard
 * Dashboard consolidado con métricas clave
 */
router.get('/dashboard', verifyAdminToken, async (req, res) => {
  try {
    console.log('📊 Generando dashboard consolidado...');

    // Métricas generales
    const generalStats = await db.query(`
      SELECT
        (SELECT COUNT(*) FROM users) as total_users,
        (SELECT COUNT(*) FROM predictions) as total_predictions,
        (SELECT COUNT(*) FROM incidents) as total_incidents,
        (SELECT COUNT(*) FROM surveys) as total_surveys,
        (SELECT COUNT(*) FROM survey_responses) as total_responses,
        (SELECT SUM(points) FROM users) as total_points
    `);

    // Actividad reciente (últimas 24h)
    const recentActivity = await db.query(`
      SELECT
        COUNT(DISTINCT CASE WHEN u.created_at >= NOW() - INTERVAL '24 hours' THEN u.id END) as new_users_24h,
        COUNT(DISTINCT CASE WHEN p.created_at >= NOW() - INTERVAL '24 hours' THEN p.id END) as predictions_24h,
        COUNT(DISTINCT CASE WHEN i.created_at >= NOW() - INTERVAL '24 hours' THEN i.id END) as incidents_24h,
        COUNT(DISTINCT CASE WHEN sr.created_at >= NOW() - INTERVAL '24 hours' THEN sr.id END) as responses_24h
      FROM users u
      FULL OUTER JOIN predictions p ON true
      FULL OUTER JOIN incidents i ON true
      FULL OUTER JOIN survey_responses sr ON true
    `);

    // Top municipios por actividad
    const topMunicipios = await db.query(`
      SELECT
        m.name,
        COUNT(DISTINCT u.id) as users,
        COUNT(DISTINCT p.id) as predictions,
        COUNT(DISTINCT i.id) as incidents
      FROM municipalities m
      LEFT JOIN users u ON u.id IN (
        SELECT DISTINCT user_id FROM predictions WHERE municipality_id = m.id
        UNION
        SELECT DISTINCT user_id FROM incidents WHERE municipality_id = m.id
      )
      LEFT JOIN predictions p ON p.municipality_id = m.id
      LEFT JOIN incidents i ON i.municipality_id = m.id
      GROUP BY m.id, m.name
      ORDER BY (users + predictions + incidents) DESC
      LIMIT 10
    `);

    // Estado de encuestas activas
    const surveysActive = await db.query(`
      SELECT
        s.id,
        s.title,
        COUNT(sr.id) as responses_count,
        s.created_at
      FROM surveys s
      LEFT JOIN survey_responses sr ON sr.survey_id = s.id
      WHERE s.is_active = true
      GROUP BY s.id, s.title, s.created_at
      ORDER BY s.created_at DESC
    `);

    // Distribución de tipos de incidentes
    const incidentTypes = await db.query(`
      SELECT
        type,
        COUNT(*) as count,
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'verified') as verified
      FROM incidents
      GROUP BY type
      ORDER BY count DESC
    `);

    // Predicciones por candidato líder
    const candidateLeaders = await db.query(`
      SELECT
        c.name as candidate_name,
        c.party,
        COUNT(p.id) as prediction_count,
        ROUND(AVG(p.confidence), 1) as avg_confidence
      FROM candidates c
      LEFT JOIN predictions p ON p.candidate_id = c.id
      GROUP BY c.id, c.name, c.party
      ORDER BY prediction_count DESC
      LIMIT 10
    `);

    res.json({
      timestamp: new Date(),
      general: generalStats.rows[0],
      recentActivity: recentActivity.rows[0],
      topMunicipios: topMunicipios.rows,
      activeSurveys: surveysActive.rows,
      incidentTypes: incidentTypes.rows,
      candidateLeaders: candidateLeaders.rows
    });

  } catch (error) {
    console.error('❌ Error generando dashboard:', error);
    res.status(500).json({ error: 'Error generando dashboard consolidado' });
  }
});

// ========================================
// GESTIÓN DE INCIDENTES
// ========================================

/**
 * GET /api/admin/incidents
 * Lista de incidentes con filtros
 */
router.get('/incidents', verifyAdminToken, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;
    const status = req.query.status;
    const municipalityId = req.query.municipalityId;

    let query = `
      SELECT 
        i.id,
        i.type,
        i.description,
        i.latitude,
        i.longitude,
        i.status,
        i.created_at,
        m.name as municipality_name,
        LEFT(u.phone_hash, 12) || '...' as user_preview
      FROM incidents i
      JOIN municipalities m ON m.id = i.municipality_id
      JOIN users u ON u.id = i.user_id
      WHERE 1=1
    `;

    const params = [];
    let paramIndex = 1;

    if (status) {
      query += ` AND i.status = $${paramIndex++}`;
      params.push(status);
    }

    if (municipalityId) {
      query += ` AND i.municipality_id = $${paramIndex++}`;
      params.push(parseInt(municipalityId));
    }

    query += ` ORDER BY i.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await db.query(query, params);

    const countQuery = `SELECT COUNT(*) FROM incidents WHERE 1=1` +
      (status ? ` AND status = '${status}'` : '') +
      (municipalityId ? ` AND municipality_id = ${municipalityId}` : '');
    
    const countResult = await db.query(countQuery);
    const total = parseInt(countResult.rows[0].count);

    res.json({
      incidents: result.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('❌ Error obteniendo incidentes:', error);
    res.status(500).json({ error: 'Error obteniendo incidentes' });
  }
});

/**
 * PATCH /api/admin/incidents/:id
 * Actualizar status de incidente
 */
router.patch('/incidents/:id', verifyAdminToken, async (req, res) => {
  try {
    const incidentId = parseInt(req.params.id);
    const { status } = req.body;

    const validStatuses = ['pending', 'verified', 'rejected', 'resolved'];
    
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ 
        error: `Status inválido. Valores: ${validStatuses.join(', ')}` 
      });
    }

    const result = await db.query(`
      UPDATE incidents 
      SET status = $1, verified_by = $2, verified_at = NOW()
      WHERE id = $3
      RETURNING id, status
    `, [status, req.adminId, incidentId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Incidente no encontrado' });
    }

    console.log(`✅ Incidente ${incidentId} actualizado a ${status} por admin ${req.adminUsername}`);

    res.json({
      success: true,
      incident: result.rows[0]
    });

  } catch (error) {
    console.error('❌ Error actualizando incidente:', error);
    res.status(500).json({ error: 'Error actualizando incidente' });
  }
});

/**
 * GET /api/admin/incidents/map
 * Datos para mapa de incidentes
 */
router.get('/incidents/map', verifyAdminToken, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        i.id,
        i.type,
        i.latitude,
        i.longitude,
        i.status,
        i.created_at,
        m.name as municipality_name
      FROM incidents i
      JOIN municipalities m ON m.id = i.municipality_id
      WHERE i.latitude IS NOT NULL 
        AND i.longitude IS NOT NULL
      ORDER BY i.created_at DESC
      LIMIT 500
    `);

    res.json(result.rows);

  } catch (error) {
    console.error('❌ Error obteniendo datos de mapa:', error);
    res.status(500).json({ error: 'Error obteniendo datos de mapa' });
  }
});

// ========================================
// EXPORTACIÓN DE DATOS
// ========================================

/**
 * GET /api/admin/export/users
 * Exportar usuarios a CSV (teléfonos mascarados)
 */
router.get('/export/users', verifyAdminToken, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        id,
        LEFT(phone_hash, 20) || '...' as phone_masked,
        points,
        predictions_count,
        accuracy_pct,
        TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI:SS') as created_at,
        TO_CHAR(last_active, 'YYYY-MM-DD HH24:MI:SS') as last_active
      FROM users
      ORDER BY created_at DESC
    `);

    // Generar CSV
    const headers = ['ID', 'Phone (Masked)', 'Points', 'Predictions', 'Accuracy %', 'Created At', 'Last Active'];
    const csvRows = [headers.join(',')];

    result.rows.forEach(row => {
      csvRows.push([
        row.id,
        row.phone_masked,
        row.points,
        row.predictions_count,
        row.accuracy_pct,
        row.created_at,
        row.last_active
      ].join(','));
    });

    const csv = csvRows.join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=users_${Date.now()}.csv`);
    res.send('\ufeff' + csv); // BOM para UTF-8

  } catch (error) {
    console.error('❌ Error exportando usuarios:', error);
    res.status(500).json({ error: 'Error exportando datos' });
  }
});

/**
 * GET /api/admin/export/predictions
 * Exportar predicciones a CSV
 */
router.get('/export/predictions', verifyAdminToken, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        p.id,
        p.user_id,
        c.name as candidate,
        c.party,
        m.name as municipality,
        p.confidence,
        TO_CHAR(p.created_at, 'YYYY-MM-DD HH24:MI:SS') as created_at
      FROM predictions p
      JOIN candidates c ON c.id = p.candidate_id
      JOIN municipalities m ON m.id = p.municipality_id
      ORDER BY p.created_at DESC
    `);

    const headers = ['ID', 'User ID', 'Candidate', 'Party', 'Municipality', 'Confidence', 'Created At'];
    const csvRows = [headers.join(',')];

    result.rows.forEach(row => {
      csvRows.push([
        row.id,
        row.user_id,
        `"${row.candidate}"`,
        row.party,
        `"${row.municipality}"`,
        row.confidence,
        row.created_at
      ].join(','));
    });

    const csv = csvRows.join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=predictions_${Date.now()}.csv`);
    res.send('\ufeff' + csv);

  } catch (error) {
    console.error('❌ Error exportando predicciones:', error);
    res.status(500).json({ error: 'Error exportando datos' });
  }
});
// ================================
// PREDICCIONES
// ================================

// GET /api/admin/predictions
router.get('/predictions', verifyAdminToken, async (req, res) => {
    try {
        const limit = 50;
        const page = parseInt(req.query.page) || 1;
        const offset = (page - 1) * limit;

        const query = `
            SELECT 
                p.id,
                p.candidate_id,
                COALESCE(c.name, 'Desconocido') as candidate_name,
                COALESCE(c.party, 'N/A') as party,
                p.municipality_id,
                COALESCE(m.name, 'N/A') as municipality_name,
                p.confidence,
                p.user_id,
                SUBSTRING(CAST(p.user_id AS text), 1, 10) || '...' as user_preview,
                p.created_at,
                COUNT(*) OVER() as total_count
            FROM predictions p
            LEFT JOIN candidates c ON p.candidate_id = c.id
            LEFT JOIN municipalities m ON p.municipality_id = m.id
            ORDER BY p.created_at DESC
            LIMIT $1 OFFSET $2
        `;

        const result = await db.query(query, [limit, offset]);
        
        if (result.rows.length === 0) {
            return res.json({
                predictions: [],
                pagination: { total: 0, page, pages: 0 }
            });
        }

        const total = parseInt(result.rows[0].total_count);
        const pages = Math.ceil(total / limit);

        res.json({
            predictions: result.rows,
            pagination: { total, page, pages, limit }
        });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/admin/predictions/stats
router.get('/predictions/stats', verifyAdminToken, async (req, res) => {
    try {
        const query = `
            SELECT 
                c.id,
                c.name as candidate_name,
                c.party,
                m.name as municipality_name,
                COUNT(p.id) as total_predictions,
                AVG(p.confidence) as avg_confidence
            FROM candidates c
            LEFT JOIN predictions p ON c.id = p.candidate_id
            LEFT JOIN municipalities m ON p.municipality_id = m.id
            WHERE p.id IS NOT NULL
            GROUP BY c.id, c.name, c.party, m.name
            ORDER BY total_predictions DESC
            LIMIT 10
        `;

        const result = await db.query(query);
        res.json(result.rows);

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: error.message });
    }
});


module.exports = router;