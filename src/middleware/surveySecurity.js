const rateLimit = require('express-rate-limit');

// Límite estricto: máximo 1 voto por hora
const surveyRateLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hora
    max: 1, // Limita cada IP a 1 solicitud por ventana
    message: {
        success: false,
        error: 'Has alcanzado el límite de votos desde esta conexión (1 voto por hora).'
    },
    standardHeaders: true, // Retorna info del límite en headers RateLimit-*
    legacyHeaders: false, // Desactiva los headers X-RateLimit-*
    skipFailedRequests: true, // Solo contabiliza votos exitosos en el rate limit (evita quemar la cuota si falta el fingerprint)
});

// Función mock para no romper integraciones previas (ahora automatizado por express-rate-limit)
function registerIpVote(ip) {
    // Manejado automáticamente por el middleware
}

module.exports = {
    surveyRateLimiter,
    registerIpVote
};
