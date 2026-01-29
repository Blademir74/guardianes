// src/routes/predictions.js

const express = require('express');
const router = express.Router();
const db = require('../db');
const jwt = require('jsonwebtoken');

/**
 * GET /api/predictions/municipalities/:municipalityId
 * Obtener candidatos disponibles para predicción
 */
router.get('/municipalities/:municipalityId', async (req, res) => {
  try {
    const { municipalityId } = req.params;
    const { electionType } = req.query;

    console.log(`🔍 Buscando candidatos para municipio: ${municipalityId}, tipo: ${electionType}`);

    const result = await db.query(`
      SELECT
        id,
        name,
        party,
        photo_url as "photoUrl",
        bio
      FROM candidates 
      WHERE municipality_id = $1 
        AND is_active = true
        ${electionType ? `AND election_type = $2` : ''}
      ORDER BY name ASC
    `, electionType ? [municipalityId, electionType] : [municipalityId]);

    console.log(`✅ Candidatos encontrados: ${result.rows.length}`);
    
    res.json(result.rows);
    
  } catch (error) {
    console.error('❌ Error obteniendo candidatos:', error);
    res.status(500).json({ error: 'Error obteniendo candidatos municipales' });
  }
});

/**
 * POST /api/predictions
 * Crear nueva predicción
 */
router.post('/', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'Token de autenticación requerido' });
    }
    
    let userId = null;
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret-change-in-production');
      userId = decoded.userId;
    } catch (err) {
      return res.status(401).json({ error: 'Token inválido o expirado' });
    }
    
    const { municipalityId, candidateId, confidence } = req.body;

    console.log('📥 Predicción recibida:', { userId, municipalityId, candidateId, confidence });

    if (!municipalityId || !candidateId) {
      return res.status(400).json({ error: 'Faltan datos requeridos' });
    }

    const confidenceNormalized = (confidence > 10) ? confidence : (confidence * 10 || 50);

    // Verificar si ya existe
    const existing = await db.query(`
      SELECT id FROM predictions 
      WHERE user_id = $1 AND municipality_id = $2
    `, [userId, municipalityId]);

    if (existing.rows.length > 0) {
      // Actualizar
      await db.query(`
        UPDATE predictions 
        SET candidate_id = $1, confidence = $2
        WHERE user_id = $3 AND municipality_id = $4
      `, [candidateId, confidenceNormalized, userId, municipalityId]);
      
      console.log('✅ Predicción actualizada');
    } else {
      // Insertar
      await db.query(`
        INSERT INTO predictions (user_id, municipality_id, candidate_id, confidence)
        VALUES ($1, $2, $3, $4)
      `, [userId, municipalityId, candidateId, confidenceNormalized]);
      
      console.log('✅ Predicción insertada');
    }

    // Otorgar puntos
    let pointsEarned = 30;
    try {
      await db.query(`
        UPDATE users 
        SET points = points + $1 
        WHERE id = $2
      `, [pointsEarned, userId]);
    } catch (err) {
      console.error('⚠️ Error añadiendo puntos:', err);
    }

    res.json({
      success: true,
      message: 'Predicción guardada exitosamente',
      pointsEarned
    });

  } catch (error) {
    console.error('❌ Error creando predicción:', error);
    res.status(500).json({ 
      error: 'Error guardando predicción',
      details: error.message 
    });
  }
});

/**
 * GET /api/predictions/stats/:municipalityId
 * Obtener estadísticas de predicciones
 */
router.get('/stats/:municipalityId', async (req, res) => {
  try {
    const { municipalityId } = req.params;
    const result = await db.query(`
      SELECT
        c.name as candidate_name,
        c.party,
        c.photo_url,
        COUNT(p.id) as votes,
        AVG(p.confidence) as avg_confidence
      FROM predictions p
      JOIN candidates c ON c.id = p.candidate_id
      WHERE p.municipality_id = $1
      GROUP BY c.id, c.name, c.party, c.photo_url
      ORDER BY votes DESC
    `, [municipalityId]);
    
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Error obteniendo stats:', error);
    res.status(500).json({ error: 'Error obteniendo estadísticas' });
  }
});

/**
 * GET /api/predictions/leaderboard
 * Usuarios con más puntos/predicciones
 */
router.get('/leaderboard', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT name, points
      FROM users
      ORDER BY points DESC
      LIMIT 10
    `);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Error obteniendo leaderboard' });
  }
});

/**
 * GET /api/predictions/results/:municipalityId
 * Ranking de tendencias por municipio
 */
router.get('/results/:municipalityId', async (req, res) => {
  try {
    const { municipalityId } = req.params;
    const result = await db.query(`
      SELECT
        c.name as candidate_name,
        c.party,
        c.photo_url,
        COUNT(p.id) as total_predictions,
        AVG(p.confidence) as avg_confidence,
        COUNT(p.id) * AVG(p.confidence) / 100 as trend_score
      FROM predictions p
      JOIN candidates c ON c.id = p.candidate_id
      WHERE p.municipality_id = $1
      GROUP BY c.id, c.name, c.party, c.photo_url
      ORDER BY trend_score DESC, total_predictions DESC
      LIMIT 10
    `, [municipalityId]);
    
    res.json({
      municipalityId: parseInt(municipalityId),
      rankings: result.rows,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error obteniendo ranking:', error);
    res.status(500).json({ error: 'Error obteniendo ranking de tendencias' });
  }
});

/**
 * GET /api/predictions/candidates/:municipalityId
 * Alias para compatibilidad con el frontend
 */
router.get('/candidates/:municipalityId', async (req, res) => {
  try {
    const { municipalityId } = req.params;
    const { electionType } = req.query;

    let whereClause = 'c.municipality_id = $1';
    let queryParams = [municipalityId];

    if (electionType) {
      whereClause += ' AND c.election_type = $2';
      queryParams.push(electionType);
    }
    
    const result = await db.query(`
      SELECT
        c.id,
        c.name,
        c.party,
        c.photo_url,
        c.bio
      FROM candidates c
      WHERE ${whereClause}
      AND c.is_active = true
      ORDER BY c.name
    `, queryParams);
    
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Error obteniendo candidatos:', error);
    res.status(500).json({ error: 'Error obteniendo candidatos' });
  }
});

module.exports = router;