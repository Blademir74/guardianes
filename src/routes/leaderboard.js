const router = require('express').Router();
const db = require('../db');

// GET /api/leaderboard
router.get('/', async (req, res) => {
  try {
    let limit = parseInt(req.query.limit, 10) || 10;
    let offset = parseInt(req.query.offset, 10) || 0;

    if (limit > 100) limit = 100;
    if (limit < 1) limit = 10;
    if (offset < 0) offset = 0;

    const query = `
      SELECT id, points, predictions_count, accuracy_pct, last_active
      FROM users
      ORDER BY points DESC
      LIMIT $1 OFFSET $2;
    `;
    
    const result = await db.query(query, [limit, offset]);
    
    const leaderboard = result.rows.map((user, index) => ({
      rank: offset + index + 1,
      userId: user.id,
      points: user.points,
      predictionsCount: user.predictions_count,
      accuracyPct: user.accuracy_pct,
      lastActive: user.last_active
    }));
    
    res.json(leaderboard);
  } catch (error) {
    console.error('Failed to fetch leaderboard:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

module.exports = router;