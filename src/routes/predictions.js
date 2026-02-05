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
/**
 * POST /api/predictions
 * Crear nueva predicción
 * - Si hay token válido → usa ese userId y da puntos
 * - Si NO hay token o es inválido → usa usuario anónimo (id=1), sin puntos
 */
/**
 * POST /api/predictions
 * Crear nueva predicción (robusto, sin 401 por token)
 */
router.post('/', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    let userId = null;
    let isAuthenticated = false;

    // 1) Intentar leer token SI existe
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '');
      try {
        const decoded = jwt.verify(
          token,
          process.env.JWT_SECRET || 'dev-secret-2027-guerrero'
        );
        userId = decoded.userId;
        isAuthenticated = true;
      } catch (err) {
        console.warn('⚠️ Token inválido en /api/predictions, se usará usuario anónimo:', err.message);
      }
    }

    // 2) Si no hay userId válido → usuario anónimo (id=1)
    if (!userId) {
  // Crear (una sola vez) un usuario anónimo técnico con un phone_hash fijo.
  // IMPORTANTE: phone_hash es NOT NULL en tu BD, por eso fallaba antes.

  await db.query(`
    INSERT INTO users (
      id,
      phone_hash,
      phone_last4,
      name,
      email,
      password,
      is_active,
      is_anonymous,
      points
    )
    VALUES (
      1,
      'ANON_USER_1',   -- valor fijo que no colisiona con hashes reales
      '0000',
      'Invitado',
      'anon@guardianes.mx',
      'no-password',
      true,
      true,
      0
    )
    ON CONFLICT (id) DO NOTHING
  `);

  userId = 1;
  isAuthenticated = false;
}

    const { municipalityId, candidateId, confidence } = req.body;
    console.log('📥 Predicción recibida:', { userId, municipalityId, candidateId, confidence });

    if (!municipalityId || !candidateId) {
      return res.status(400).json({ error: 'Faltan datos requeridos' });
    }

    // 3) Normalizar ID de candidato ("candidato_21" → 21)
    let numericCandidateId = candidateId;
    if (typeof candidateId === 'string') {
      if (candidateId.includes('_')) {
        numericCandidateId = parseInt(candidateId.split('_')[1], 10);
      } else {
        numericCandidateId = parseInt(candidateId, 10);
      }
    }

    if (!numericCandidateId || Number.isNaN(numericCandidateId)) {
      return res.status(400).json({ error: 'ID de candidato inválido' });
    }

    // 4) Verificar candidato
    const candidateCheck = await db.query(
      'SELECT id, name, party FROM candidates WHERE id = $1',
      [numericCandidateId]
    );
    if (candidateCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Candidato no encontrado' });
    }
    const candidate = candidateCheck.rows[0];

    const confidenceNormalized =
      confidence > 10 ? confidence : (confidence * 10 || 50);

    // 5) Verificar si ya existe predicción para user+municipio
    const existing = await db.query(
      `
      SELECT id FROM predictions 
      WHERE user_id = $1 AND municipality_id = $2
      `,
      [userId, municipalityId]
    );

    if (existing.rows.length > 0) {
      await db.query(
        `
        UPDATE predictions 
        SET candidate_id = $1, confidence = $2
        WHERE user_id = $3 AND municipality_id = $4
        `,
        [numericCandidateId, confidenceNormalized, userId, municipalityId]
      );
      console.log('✅ Predicción actualizada');
    } else {
      await db.query(
        `
        INSERT INTO predictions (user_id, municipality_id, candidate_id, confidence)
        VALUES ($1, $2, $3, $4)
        `,
        [userId, municipalityId, numericCandidateId, confidenceNormalized]
      );
      console.log('✅ Predicción insertada');
    }

    // 6) Puntos SOLO para usuarios autenticados reales
    let pointsEarned = 0;
    if (isAuthenticated && userId !== 1) {
      pointsEarned = 30;
      try {
        await db.query(
          `
          UPDATE users 
          SET points = points + $1 
          WHERE id = $2
          `,
          [pointsEarned, userId]
        );
      } catch (err) {
        console.error('⚠️ Error añadiendo puntos:', err);
      }
    }

    res.json({
      success: true,
      message: 'Predicción guardada exitosamente',
      pointsEarned,
      prediction: {
        candidateName: candidate.name,
        candidateParty: candidate.party,
        confidence: confidenceNormalized
      }
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