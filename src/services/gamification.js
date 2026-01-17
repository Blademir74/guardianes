const db = require('../db');

// Constantes de puntos (gamification)
const POINTS = {
    PREDICTION: 10,
    SURVEY_COMPLETE: 50,
    INCIDENT_REPORT: 20,
    INCIDENT_VERIFIED: 100, // Bonus si se valida
    DAILY_LOGIN: 5
};

/**
 * Añade puntos a un usuario y actualiza su registro.
 * @param {number} userId - ID del usuario.
 * @param {string} action - Tipo de acción (PREDICTION, SURVEY, etc.)
 * @param {object} client - Cliente de BD opcional para transacciones.
 */
async function addPoints(userId, action, client = null) {
    const pointsToAdd = POINTS[action] || 0;
    if (pointsToAdd === 0) return 0;

    const query = `
    UPDATE users 
    SET points = points + $1 
    WHERE id = $2 
    RETURNING points
  `;

    const executor = client || db;

    try {
        const result = await executor.query(query, [pointsToAdd, userId]);
        if (result.rows.length > 0) {
            console.log(`🏆 Usuario ${userId} recibió ${pointsToAdd} puntos por ${action}. Total: ${result.rows[0].points}`);
        }
        return pointsToAdd;
    } catch (err) {
        console.error(`❌ Error sumando puntos a usuario ${userId}:`, err.message);
        return 0; // No fallamos la request principal por esto
    }
}

/**
 * Obtiene el ranking global de usuarios (Top 10).
 * Anonimiza los nombres/teléfonos solo mostrando los últimos dígitos.
 */
async function getLeaderboard() {
    const query = `
    SELECT id, phone_hash, points, accuracy_pct 
    FROM users 
    ORDER BY points DESC, accuracy_pct DESC 
    LIMIT 10
  `;

    try {
        const result = await db.query(query);
        return result.rows.map(user => ({
            position: 0, // Se llenará en el map
            userId: user.id,
            // Alias anónimo: "Guardian...1234" (usando últimos caracteres del hash)
            alias: `Guardian-${user.phone_hash.substring(0, 6)}`,
            points: user.points,
            accuracy: user.accuracy_pct
        }));
    } catch (err) {
        console.error('❌ Error obteniendo leaderboard:', err.message);
        return [];
    }
}

module.exports = {
    addPoints,
    getLeaderboard,
    POINTS
};
