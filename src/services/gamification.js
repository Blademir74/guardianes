const { query } = require('../db');

const BADGES = {
    first_prediction: { name: 'Primer Voto', points: 50, icon: '🗳️', description: 'Realizaste tu primera predicción' },
    first_incident: { name: 'Vigilante', points: 75, icon: '🚨', description: 'Reportaste tu primer incidente' },
    ten_predictions: { name: 'Ciudadano Activo', points: 200, icon: '🌟', description: 'Realizaste 10 predicciones' },
    municipality_leader: { name: 'Líder Municipal', points: 500, icon: '👑', description: 'Top 1 en tu municipio' },
    verified_reporter: { name: 'Reportero Verificado', points: 300, icon: '✅', description: '3 reportes verificados como reales' }
};

/**
 * Otorga puntos y verifica badges
 */
async function awardPoints(userId, action, points) {
    try {
        // 1. Dar puntos
        await query('UPDATE users SET points = points + $1 WHERE id = $2', [points, userId]);

        // 2. Verificar badges (lógica simplificada)
        await checkBadges(userId, action);

        return { success: true, pointsAdded: points };
    } catch (error) {
        console.error('Error awarding points:', error);
        return { success: false };
    }
}

async function checkBadges(userId, action) {
    // Aquí iría la lógica compleja de verificar si cumple condiciones
    // Por ahora es un placeholder para expansión futura
    console.log(`Checking badges for user ${userId} after action ${action}`);
}

/**
 * Obtener leaderboard global
 */
async function getLeaderboard(limit = 10) {
    const result = await query(`
    SELECT id, points, predictions_count, 
           SUBSTRING(phone_hash, 1, 6) as short_hash
    FROM users 
    ORDER BY points DESC 
    LIMIT $1
  `, [limit]);
    return result.rows;
}

/**
 * Obtener leaderboard por municipio
 * Se basa en las predicciones o incidentes realizados en ese municipio
 */
async function getMunicipalityLeaderboard(municipalityId, limit = 10) {
    // Buscamos usuarios que tengan actividad (predicciones o incidentes) en el municipio
    // y los ordenamos por sus puntos totales (o puntos locales si tuviéramos esa métrica separada)
    // Para simplificar, usamos puntos totales de usuarios activos en el municipio.

    const result = await query(`
    SELECT DISTINCT u.id, u.points, u.predictions_count,
           SUBSTRING(u.phone_hash, 1, 6) as short_hash
    FROM users u
    JOIN predictions p ON p.user_id = u.id
    WHERE p.municipality_id = $1
    ORDER BY u.points DESC
    LIMIT $2
  `, [municipalityId, limit]);

    return result.rows;
}

module.exports = {
    BADGES,
    awardPoints,
    getLeaderboard,
    getMunicipalityLeaderboard
};
