const router = require('express').Router();
const db = require('../db');
const { verifyToken } = require('../middleware/auth');

// POST /api/predictions (protegido)
// src/routes/predictions.js

/**
 * POST /api/predictions
 * Crear predicción con validación estricta de IDs
 */
router.post('/', verifyToken, async (req, res) => {
  const client = await db.connect();
  try {
    const { electionId, municipalityId, candidateId, confidence } = req.body;
    const userId = req.userId;

    // Validar campos requeridos
    if (!electionId || !municipalityId || !candidateId || confidence === undefined) {
      return res.status(400).json({ error: 'Campos requeridos: electionId, municipalityId, candidateId, confidence' });
    }

    // Validar confianza
    if (confidence < 0 || confidence > 100) {
      return res.status(400).json({ error: 'Confianza debe estar entre 0 y 100' });
    }

    await client.query('BEGIN');

    // Validar que municipio existe
    const municipioCheck = await client.query(
      'SELECT id FROM municipalities WHERE id = $1',
      [municipalityId]
    );
    
    if (municipioCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Municipio inválido' });
    }

    // Validar que elección existe y está activa
    const electionCheck = await client.query(
      'SELECT id FROM elections WHERE id = $1 AND is_active = true',
      [electionId]
    );
    
    if (electionCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Elección inválida o inactiva' });
    }

    // Validar que candidato existe
    const candidateCheck = await client.query(
      'SELECT id FROM candidates WHERE id = $1 AND election_id = $2 AND municipality_id = $3',
      [candidateId, electionId, municipalityId]
    );
    
    if (candidateCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Candidato inválido para esta elección/municipio' });
    }

    // Insertar predicción
    const insertQuery = `
      INSERT INTO predictions (user_id, election_id, municipality_id, candidate_id, confidence, created_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      RETURNING id
    `;
    const result = await client.query(insertQuery, [userId, electionId, municipalityId, candidateId, confidence]);
    const predictionId = result.rows[0].id;
    
    // Actualizar puntos y contador del usuario
    await client.query(
      'UPDATE users SET points = points + 100, predictions_count = predictions_count + 1, last_active = NOW() WHERE id = $1',
      [userId]
    );
    
    await client.query('COMMIT');
    
    res.json({ success: true, predictionId, pointsEarned: 100 });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error al crear predicción:', error);
    res.status(500).json({ error: 'Prediction failed' });
  } finally {
    client.release();
  }
});

// GET /api/predictions/:electionId/:municipalityId
router.get('/:electionId/:municipalityId', async (req, res) => {
  try {
    const electionId = parseInt(req.params.electionId, 10);
    const municipioId = parseInt(req.params.municipalityId, 10);

    if (!electionId || electionId <= 0 || !municipioId || municipioId <= 0) {
      return res.status(400).json({ error: 'Invalid parameters' });
    }
    
    const query = `
      SELECT 
        p.candidate_id,
        c.name,
        c.party,
        COUNT(*) AS count
      FROM predictions p
      JOIN candidates c ON c.id = p.candidate_id
      WHERE p.election_id = $1 AND p.municipality_id = $2
      GROUP BY p.candidate_id, c.name, c.party
      ORDER BY count DESC;
    `;
    
    const result = await db.query(query, [electionId, municipioId]);
    const predictions = result.rows;
    
    const totalPredictions = predictions.reduce((sum, row) => sum + parseInt(row.count), 0);

    const response = predictions.map(p => ({
      candidateId: p.candidate_id,
      name: p.name,
      party: p.party,
      count: parseInt(p.count),
      percentage: totalPredictions > 0 ? parseFloat(((p.count / totalPredictions) * 100).toFixed(2)) : 0
    }));

    res.json(response);
  } catch (error) {
    console.error('Error al obtener predicciones:', error);
    res.status(500).json({ error: 'Failed to fetch predictions' });
  }
});

module.exports = router;