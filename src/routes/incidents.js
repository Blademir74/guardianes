// src/routes/incidents.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const jwt = require('jsonwebtoken');
const { verifyToken } = require('../middleware/auth');

/**
 * POST /api/incidents
 * Crear reporte de incidente con geolocalización
 */
router.post('/', async (req, res) => {
  let client;

  try {
    // Verificar autenticación
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'Token de autenticación requerido' });
    }

    let userId = null;
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret-2027-guerrero');
      userId = decoded.userId;
    } catch (err) {
      return res.status(401).json({ error: 'Token inválido o expirado' });
    }

    client = await db.connect();
    const { municipalityId, type, description, latitude, longitude, photoUrl } = req.body;

    // Validar campos requeridos
    if (!municipalityId || !type || !description) {
      return res.status(400).json({
        error: 'Campos requeridos: municipalityId, type, description'
      });
    }

    // Validar tipo de incidente
    const validTypes = [
      'compra_voto',
      'intimidacion',
      'casilla_irregular',
      'propaganda_ilegal',
      'violencia',
      'fraude',
      'otro'
    ];

    if (!validTypes.includes(type)) {
      return res.status(400).json({
        error: `Tipo inválido. Valores: ${validTypes.join(', ')}`
      });
    }

    // Validar municipio
    const municipioCheck = await db.query(
      'SELECT id FROM municipalities WHERE id = $1',
      [municipalityId]
    );

    if (municipioCheck.rows.length === 0) {
      return res.status(400).json({ error: 'Municipio inválido' });
    }

    // Validar coordenadas si se proporcionan
    if (latitude !== undefined || longitude !== undefined) {
      if (isNaN(latitude) || isNaN(longitude)) {
        return res.status(400).json({ error: 'Coordenadas inválidas' });
      }
      if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
        return res.status(400).json({ error: 'Coordenadas fuera de rango' });
      }
    }

    await client.query('BEGIN');

    // Insertar incidente
    const result = await client.query(`
      INSERT INTO incidents 
        (user_id, municipality_id, type, description, latitude, longitude, photo_url, status, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', NOW())
      RETURNING id, created_at
    `, [userId, municipalityId, type, description, latitude, longitude, photoUrl]);

    const incident = result.rows[0];

    // Otorgar puntos
    await client.query(`
      UPDATE users 
      SET points = points + 50, last_active = NOW()
      WHERE id = $1
    `, [userId]);

    await client.query('COMMIT');

    console.log(`✅ Incidente creado: ${incident.id} por usuario ${userId}`);

    res.json({
      success: true,
      incident: {
        id: incident.id,
        municipalityId,
        type,
        description,
        latitude,
        longitude,
        photoUrl,
        status: 'pending',
        createdAt: incident.created_at
      },
      pointsEarned: 50
    });

  } catch (error) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('Error en rollback:', rollbackError);
      }
    }
    console.error('❌ Error al crear incidente:', error);
    res.status(500).json({ error: 'Error al registrar incidente' });
  } finally {
    if (client) {
      client.release();
    }
  }
});

/**
 * GET /api/incidents/stats
 * Obtener estadísticas de incidentes
 */
router.get('/stats', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'verified' THEN 1 END) as verified,
        COUNT(CASE WHEN created_at > NOW() - INTERVAL '24 hours' THEN 1 END) as last_24h
      FROM incidents
    `);

    const byType = await db.query(`
      SELECT type, COUNT(*) as count 
      FROM incidents 
      GROUP BY type
      ORDER BY count DESC
    `);

    const byMunicipality = await db.query(`
      SELECT 
        m.name as municipality,
        COUNT(i.id) as count
      FROM incidents i
      JOIN municipalities m ON m.id = i.municipality_id
      GROUP BY m.id, m.name
      ORDER BY count DESC
      LIMIT 10
    `);

    res.json({
      summary: result.rows[0],
      byType: byType.rows,
      byMunicipality: byMunicipality.rows
    });
  } catch (error) {
    console.error('❌ Error obteniendo estadísticas:', error);
    res.status(500).json({ error: 'Error obteniendo estadísticas' });
  }
});

/**
 * GET /api/incidents
 * Listar incidentes con filtros
 * Query params: municipalityId, status, limit, offset
 */
router.get('/', async (req, res) => {
  try {
    const { municipalityId, status, limit = 50, offset = 0 } = req.query;

    let query = `
      SELECT 
        i.id,
        i.municipality_id,
        m.name as municipality_name,
        i.type,
        i.description,
        i.latitude,
        i.longitude,
        i.photo_url,
        i.status,
        i.created_at,
        u.name as reporter_name,
        u.phone_last4 as reporter_phone,
        COUNT(*) OVER() as total_count
      FROM incidents i
      JOIN municipalities m ON m.id = i.municipality_id
      LEFT JOIN users u ON u.id = i.user_id
      WHERE 1=1
    `;

    const params = [];
    let paramIndex = 1;

    if (municipalityId) {
      query += ` AND i.municipality_id = $${paramIndex++}`;
      params.push(parseInt(municipalityId));
    }

    if (status) {
      query += ` AND i.status = $${paramIndex++}`;
      params.push(status);
    }

    query += ` ORDER BY i.created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await db.query(query, params);

    res.json({
      total: result.rows.length > 0 ? parseInt(result.rows[0].total_count) : 0,
      limit: parseInt(limit),
      offset: parseInt(offset),
      incidents: result.rows.map(i => ({
        id: i.id,
        municipalityId: i.municipality_id,
        municipalityName: i.municipality_name,
        type: i.type,
        description: i.description,
        latitude: i.latitude,
        longitude: i.longitude,
        photoUrl: i.photo_url,
        status: i.status,
        createdAt: i.created_at,
        reporter: {
          name: i.reporter_name || 'Anónimo',
          phoneLast4: i.reporter_phone || null
        }
      }))
    });

  } catch (error) {
    console.error('❌ Error al obtener incidentes:', error);
    res.status(500).json({ error: 'Error al obtener incidentes' });
  }
});

/**
 * GET /api/incidents/map
 * Obtener incidentes para visualización en mapa
 */
router.get('/map', async (req, res) => {
  try {
    const { municipalityId, status } = req.query;

    let query = `
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
    `;

    const params = [];
    let paramIndex = 1;

    if (municipalityId) {
      query += ` AND i.municipality_id = $${paramIndex++}`;
      params.push(parseInt(municipalityId));
    }

    if (status) {
      query += ` AND i.status = $${paramIndex++}`;
      params.push(status);
    }

    query += ` ORDER BY i.created_at DESC LIMIT 500`;

    const result = await db.query(query, params);

    res.json({
      incidents: result.rows.map(i => ({
        id: i.id,
        type: i.type,
        latitude: parseFloat(i.latitude),
        longitude: parseFloat(i.longitude),
        status: i.status,
        municipalityName: i.municipality_name,
        createdAt: i.created_at
      }))
    });

  } catch (error) {
    console.error('❌ Error obteniendo incidentes para mapa:', error);
    res.status(500).json({ error: 'Error obteniendo incidentes' });
  }
});

/**
 * GET /api/incidents/:id
 * Obtener detalle de un incidente específico
 */
router.get('/:id', async (req, res) => {
  try {
    const incidentId = parseInt(req.params.id, 10);

    if (isNaN(incidentId) || incidentId <= 0) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    const result = await db.query(`
      SELECT 
        i.*,
        m.name as municipality_name,
        m.region as municipality_region,
        u.name as reporter_name,
        u.phone_last4 as reporter_phone,
        u.level as reporter_level,
        v.username as verified_by_username
      FROM incidents i
      JOIN municipalities m ON m.id = i.municipality_id
      LEFT JOIN users u ON u.id = i.user_id
      LEFT JOIN admins v ON v.id = i.verified_by
      WHERE i.id = $1
    `, [incidentId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Incidente no encontrado' });
    }

    const incident = result.rows[0];

    res.json({
      id: incident.id,
      municipality: {
        id: incident.municipality_id,
        name: incident.municipality_name,
        region: incident.municipality_region
      },
      type: incident.type,
      description: incident.description,
      location: {
        latitude: incident.latitude,
        longitude: incident.longitude
      },
      photoUrl: incident.photo_url,
      status: incident.status,
      reporter: {
        name: incident.reporter_name || 'Anónimo',
        phoneLast4: incident.reporter_phone || null,
        level: incident.reporter_level || null
      },
      verifiedBy: incident.verified_by_username || null,
      createdAt: incident.created_at,
      updatedAt: incident.updated_at
    });

  } catch (error) {
    console.error('❌ Error al obtener incidente:', error);
    res.status(500).json({ error: 'Error al obtener incidente' });
  }
});

const { verifyAdminToken } = require('../middleware/auth');
router.patch('/:id/status', verifyAdminToken, async (req, res) => {
  try {
    const incidentId = parseInt(req.params.id, 10);
    const { status, notes } = req.body;

    const validStatuses = ['pending', 'verified', 'rejected', 'resolved'];

    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        error: `Status inválido. Valores: ${validStatuses.join(', ')}`
      });
    }

    // Verificar que el incidente existe
    const checkResult = await db.query(
      'SELECT id FROM incidents WHERE id = $1',
      [incidentId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Incidente no encontrado' });
    }

    const result = await db.query(`
      UPDATE incidents 
      SET 
        status = $1, 
        verified_by = $2,
        notes = COALESCE($3, notes),
        updated_at = NOW()
      WHERE id = $4
      RETURNING id, status, notes
    `, [status, req.userId, notes, incidentId]);

    console.log(`✅ Incidente ${incidentId} actualizado a ${status} por usuario ${req.userId}`);

    res.json({
      success: true,
      incident: {
        id: result.rows[0].id,
        status: result.rows[0].status,
        notes: result.rows[0].notes
      }
    });

  } catch (error) {
    console.error('❌ Error al actualizar status:', error);
    res.status(500).json({ error: 'Error al actualizar incidente' });
  }
});

/**
 * DELETE /api/incidents/:id
 * Eliminar un incidente (solo admin o creador)
 */
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const incidentId = parseInt(req.params.id, 10);
    const userId = req.userId;

    if (isNaN(incidentId) || incidentId <= 0) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    // Verificar permisos (el usuario debe ser el creador o admin)
    const checkResult = await db.query(
      'SELECT user_id FROM incidents WHERE id = $1',
      [incidentId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Incidente no encontrado' });
    }

    // TODO: Agregar verificación de rol admin
    if (checkResult.rows[0].user_id !== userId) {
      return res.status(403).json({ error: 'No tienes permiso para eliminar este incidente' });
    }

    await db.query('DELETE FROM incidents WHERE id = $1', [incidentId]);

    console.log(`✅ Incidente ${incidentId} eliminado por usuario ${userId}`);

    res.json({
      success: true,
      message: 'Incidente eliminado exitosamente'
    });

  } catch (error) {
    console.error('❌ Error al eliminar incidente:', error);
    res.status(500).json({ error: 'Error al eliminar incidente' });
  }
});

/**
 * POST /api/incidents/:id/comments
 * Agregar comentario a un incidente
 */
router.post('/:id/comments', verifyToken, async (req, res) => {
  try {
    const incidentId = parseInt(req.params.id, 10);
    const { comment } = req.body;
    const userId = req.userId;

    if (!comment || comment.trim().length === 0) {
      return res.status(400).json({ error: 'El comentario no puede estar vacío' });
    }

    // Verificar que el incidente existe
    const checkResult = await db.query(
      'SELECT id FROM incidents WHERE id = $1',
      [incidentId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Incidente no encontrado' });
    }

    const result = await db.query(`
      INSERT INTO incident_comments (incident_id, user_id, comment, created_at)
      VALUES ($1, $2, $3, NOW())
      RETURNING id, comment, created_at
    `, [incidentId, userId, comment.trim()]);

    res.json({
      success: true,
      comment: {
        id: result.rows[0].id,
        incidentId,
        userId,
        comment: result.rows[0].comment,
        createdAt: result.rows[0].created_at
      }
    });

  } catch (error) {
    console.error('❌ Error al agregar comentario:', error);
    res.status(500).json({ error: 'Error al agregar comentario' });
  }
});

/**
 * GET /api/incidents/:id/comments
 * Obtener comentarios de un incidente
 */
router.get('/:id/comments', async (req, res) => {
  try {
    const incidentId = parseInt(req.params.id, 10);

    if (isNaN(incidentId) || incidentId <= 0) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    const result = await db.query(`
      SELECT 
        ic.id,
        ic.comment,
        ic.created_at,
        u.name as user_name,
        u.phone_last4 as user_phone,
        u.level as user_level
      FROM incident_comments ic
      JOIN users u ON u.id = ic.user_id
      WHERE ic.incident_id = $1
      ORDER BY ic.created_at DESC
    `, [incidentId]);

    res.json({
      incidentId,
      comments: result.rows.map(c => ({
        id: c.id,
        comment: c.comment,
        createdAt: c.created_at,
        user: {
          name: c.user_name || 'Anónimo',
          phoneLast4: c.user_phone || null,
          level: c.user_level || null
        }
      }))
    });

  } catch (error) {
    console.error('❌ Error al obtener comentarios:', error);
    res.status(500).json({ error: 'Error al obtener comentarios' });
  }
});

module.exports = router;