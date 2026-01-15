// src/routes/incidents.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const { verifyToken } = require('../middleware/auth');

/**
 * POST /api/incidents
 * Crear reporte de incidente con geolocalización
 */
router.post('/', verifyToken, async (req, res) => {
  const client = await db.connect();
  try {
    const { municipalityId, type, description, latitude, longitude, photoUrl } = req.body;
    const userId = req.userId;

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

    res.json({
      success: true,
      incidentId: incident.id,
      pointsEarned: 50,
      createdAt: incident.created_at
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al crear incidente:', error);
    res.status(500).json({ error: 'Error al registrar incidente' });
  } finally {
    client.release();
  }
});

/**
 * GET /api/incidents
 * Listar incidentes con filtros
 * Query params: municipalityId, status, limit
 */
router.get('/', async (req, res) => {
  try {
    const { municipalityId, status, limit = 50 } = req.query;

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
        COUNT(*) OVER() as total_count
      FROM incidents i
      JOIN municipalities m ON m.id = i.municipality_id
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

    query += ` ORDER BY i.created_at DESC LIMIT $${paramIndex}`;
    params.push(parseInt(limit));

    const result = await db.query(query, params);

    res.json({
      total: result.rows.length > 0 ? parseInt(result.rows[0].total_count) : 0,
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
        createdAt: i.created_at
      }))
    });

  } catch (error) {
    console.error('Error al obtener incidentes:', error);
    res.status(500).json({ error: 'Error al obtener incidentes' });
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
        m.name as municipality_name
      FROM incidents i
      JOIN municipalities m ON m.id = i.municipality_id
      WHERE i.id = $1
    `, [incidentId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Incidente no encontrado' });
    }

    const incident = result.rows[0];
    res.json({
      id: incident.id,
      municipalityId: incident.municipality_id,
      municipalityName: incident.municipality_name,
      type: incident.type,
      description: incident.description,
      latitude: incident.latitude,
      longitude: incident.longitude,
      photoUrl: incident.photo_url,
      status: incident.status,
      createdAt: incident.created_at
    });

  } catch (error) {
    console.error('Error al obtener incidente:', error);
    res.status(500).json({ error: 'Error al obtener incidente' });
  }
});

/**
 * PATCH /api/incidents/:id/status
 * Actualizar status de incidente (solo admin)
 * TODO: Agregar middleware de rol admin
 */
router.patch('/:id/status', verifyToken, async (req, res) => {
  try {
    const incidentId = parseInt(req.params.id, 10);
    const { status } = req.body;

    const validStatuses = ['pending', 'verified', 'rejected', 'resolved'];
    
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ 
        error: `Status inválido. Valores: ${validStatuses.join(', ')}` 
      });
    }

    const result = await db.query(`
      UPDATE incidents 
      SET status = $1, verified_by = $2
      WHERE id = $3
      RETURNING id, status
    `, [status, req.userId, incidentId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Incidente no encontrado' });
    }

    res.json({
      success: true,
      incidentId: result.rows[0].id,
      newStatus: result.rows[0].status
    });

  } catch (error) {
    console.error('Error al actualizar status:', error);
    res.status(500).json({ error: 'Error al actualizar incidente' });
  }
});

module.exports = router;