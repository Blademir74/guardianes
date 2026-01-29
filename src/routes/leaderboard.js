// src/routes/leaderboard.js
const express = require('express');
const router = express.Router();
const db = require('../db');

/**
 * GET /api/leaderboard
 * Obtener tabla de posiciones
 */
router.get('/', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;

    const result = await db.query(`
      SELECT 
        u.id,
        u.name,
        u.phone_last4,
        u.points,
        u.level,
        m.name as municipality_name,
        ROW_NUMBER() OVER (ORDER BY u.points DESC) as rank
      FROM users u
      LEFT JOIN municipalities m ON m.id = u.municipality_id
      WHERE u.is_active = true
      ORDER BY u.points DESC
      LIMIT $1
    `, [limit]);

    res.json(result.rows);
  } catch (error) {
    console.error('❌ Error obteniendo leaderboard:', error);
    res.status(500).json({ error: 'Error obteniendo clasificación' });
  }
});

module.exports = router;