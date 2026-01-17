const express = require('express');
const router = express.Router();
const gamification = require('../services/gamification');

/**
 * GET /api/leaderboard
 * Obtener el top 10 de usuarios con más puntos
 */
router.get('/', async (req, res) => {
  try {
    const leaderboard = await gamification.getLeaderboard();

    // Asignar posición
    const ranked = leaderboard.map((user, index) => ({
      ...user,
      position: index + 1
    }));

    res.json({
      success: true,
      leaderboard: ranked
    });
  } catch (error) {
    console.error('❌ Error obteniendo leaderboard:', error);
    res.status(500).json({ error: 'Error obteniendo leaderboard' });
  }
});

module.exports = router;