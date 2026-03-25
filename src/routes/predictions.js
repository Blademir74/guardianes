// src/routes/predictions.js - VERSIÓN CORREGIDA COMPLETA
const express = require('express');
const router = express.Router();
const db = require('../db');
const jwt = require('jsonwebtoken');
const { predictionSecurity } = require('../middleware/predictionSecurity');

// ══════════════════════════════════════════════════════════
// GET /api/predictions/municipalities/:municipalityId
// Candidatos disponibles para predicción
// ══════════════════════════════════════════════════════════
router.get('/municipalities/:municipalityId', async (req, res) => {
  try {
    const { municipalityId } = req.params;
    const { electionType } = req.query;

    console.log(`🔍 Candidatos para municipio ${municipalityId}, tipo: ${electionType}`);

    const result = await db.query(
      `SELECT id, name, party, photo_url AS "photoUrl", bio
       FROM candidates
       WHERE municipality_id = $1
         AND is_active = true
         ${electionType ? 'AND election_type = $2' : ''}
       ORDER BY name ASC`,
      electionType ? [municipalityId, electionType] : [municipalityId]
    );

    console.log(`✅ Candidatos encontrados: ${result.rows.length}`);
    res.json(result.rows);
  } catch (error) {
    console.error('❌ Error obteniendo candidatos:', error);
    res.status(500).json({ error: 'Error obteniendo candidatos municipales' });
  }
});

// ══════════════════════════════════════════════════════════
// POST /api/predictions
// Crear predicción con Candado Triple
// ══════════════════════════════════════════════════════════
router.post('/', predictionSecurity, async (req, res) => {
  try {
    const { municipalityId, candidateId, confidence } = req.body;
    const {
      userId,
      isAuthenticated,
      fingerprintId,
      locationStatus,
      latitude,
      longitude
    } = req.predictionCtx;

    // ── Crear usuario anónimo técnico si no hay userId ──
    let resolvedUserId = userId;
    let resolvedIsAuthenticated = isAuthenticated;

    if (!resolvedUserId) {
      await db.query(
        `INSERT INTO users (
           id, phone_hash, phone_last4, name,
           is_active, is_anonymous, points
         )
         VALUES (1, 'ANON_USER_1', '0000', 'Invitado', true, true, 0)
         ON CONFLICT (id) DO NOTHING`
      );
      resolvedUserId = 1;
      resolvedIsAuthenticated = false;
    }

    // ── Normalizar candidateId ──────────────────────────
    let numericCandidateId = candidateId;
    if (typeof candidateId === 'string') {
      if (candidateId.includes('candidato')) {
        numericCandidateId = parseInt(candidateId.split('candidato')[1], 10);
      } else {
        numericCandidateId = parseInt(candidateId, 10);
      }
    }

    if (!numericCandidateId || isNaN(numericCandidateId)) {
      return res.status(400).json({ error: 'ID de candidato inválido' });
    }

    // ── Verificar candidato existe ──────────────────────
    const candidateCheck = await db.query(
      `SELECT id, name, party FROM candidates WHERE id = $1`,
      [numericCandidateId]
    );

    if (candidateCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Candidato no encontrado' });
    }

    const candidate = candidateCheck.rows[0];

    // ── Normalizar confianza ────────────────────────────
    const confidenceNormalized =
      confidence > 1 ? confidence : confidence * 100;
    const finalConfidence = Math.min(100, Math.max(0, confidenceNormalized || 50));

    // ── Upsert: actualizar si ya existe por fingerprint ─
    const existing = await db.query(
      `SELECT id FROM predictions
       WHERE municipality_id = $1 AND fingerprint_id = $2
       LIMIT 1`,
      [parseInt(municipalityId, 10), fingerprintId]
    );

    if (existing.rows.length > 0) {
      await db.query(
        `UPDATE predictions
         SET candidate_id = $1,
             confidence = $2,
             location_status = $3,
             latitude = $4,
             longitude = $5,
             updated_at = NOW()
         WHERE id = $6`,
        [
          numericCandidateId,
          finalConfidence,
          locationStatus,
          latitude,
          longitude,
          existing.rows[0].id
        ]
      );
    } else {
      await db.query(
        `INSERT INTO predictions (
           user_id, municipality_id, candidate_id,
           confidence, fingerprint_id,
           location_status, latitude, longitude,
           created_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
        [
          resolvedUserId,
          parseInt(municipalityId, 10),
          numericCandidateId,
          finalConfidence,
          fingerprintId,
          locationStatus,
          latitude,
          longitude
        ]
      );
    }

    // ── Puntos solo para usuarios reales ───────────────
    let pointsEarned = 0;
    if (resolvedIsAuthenticated && resolvedUserId !== 1) {
      pointsEarned = 30;
      try {
        await db.query(
          `UPDATE users
           SET points = points + $1,
               predictions_count = predictions_count + 1
           WHERE id = $2`,
          [pointsEarned, resolvedUserId]
        );
      } catch (err) {
        console.error('⚠️ Error añadiendo puntos:', err.message);
      }
    }

    res.json({
      success: true,
      message: 'Predicción guardada exitosamente',
      pointsEarned,
      locationStatus,
      prediction: {
        candidateName: candidate.name,
        candidateParty: candidate.party,
        confidence: finalConfidence
      }
    });
  } catch (error) {
    console.error('❌ Error creando predicción:', error);
    console.error('Stack:', error.stack);
    res.status(500).json({
      error: 'Error guardando predicción',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ══════════════════════════════════════════════════════════
// GET /api/predictions/stats/:municipalityId
// Estadísticas de predicciones
// ══════════════════════════════════════════════════════════
router.get('/stats/:municipalityId', async (req, res) => {
  try {
    const { municipalityId } = req.params;

    // LEFT JOIN para incluir candidatos con 0 votos
    const result = await db.query(
      `SELECT
         c.name AS "candidateName",
         c.party,
         c.photo_url AS "photoUrl",
         COUNT(p.id) AS votes,
         COALESCE(AVG(p.confidence), 0) AS "avgConfidence"
       FROM candidates c
       LEFT JOIN predictions p
         ON p.candidate_id = c.id
         AND p.municipality_id = $1
       WHERE c.municipality_id = $1
         AND c.is_active = true
       GROUP BY c.id, c.name, c.party, c.photo_url
       ORDER BY votes DESC, c.name ASC`,
      [municipalityId]
    );

    const totalVoters = result.rows.reduce(
      (sum, r) => sum + parseInt(r.votes || 0),
      0
    );

    // Confianza Promedio = promedio de niveles 50%, 75% y 100%
    const confidenceLevels = [50, 75, 100];
    const avgConfidence =
      confidenceLevels.reduce((a, b) => a + b, 0) / confidenceLevels.length;

    res.json({
      totalVoters,
      avgConfidence: avgConfidence.toFixed(1),
      rankings: result.rows
    });
  } catch (error) {
    console.error('❌ Error obteniendo stats:', error);
    res.status(500).json({ error: 'Error obteniendo estadísticas' });
  }
});

// ══════════════════════════════════════════════════════════
// GET /api/predictions/results/:municipalityId
// Ranking de tendencias - LEFT JOIN para 0 votos
// ══════════════════════════════════════════════════════════
router.get('/results/:municipalityId', async (req, res) => {
  try {
    const { municipalityId } = req.params;

    const result = await db.query(
      `SELECT
         c.name AS "candidateName",
         c.party,
         c.photo_url AS "photoUrl",
         COUNT(p.id) AS "totalPredictions",
         COALESCE(AVG(p.confidence), 0) AS "avgConfidence",
         COUNT(p.id) * COALESCE(AVG(p.confidence), 0) / 100 AS "trendScore"
       FROM candidates c
       LEFT JOIN predictions p
         ON p.candidate_id = c.id
         AND p.municipality_id = $1
       WHERE c.municipality_id = $1
         AND c.is_active = true
       GROUP BY c.id, c.name, c.party, c.photo_url
       ORDER BY "trendScore" DESC, "totalPredictions" DESC`,
      [municipalityId]
    );

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

module.exports = router;