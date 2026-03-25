// src/middleware/predictionSecurity.js
// Candado de Integridad Triple - Sin fricción por IP

const db = require('../db');
const jwt = require('jsonwebtoken');

const predictionSecurity = async (req, res, next) => {
  try {
    const {
      municipalityId,
      candidateId,
      confidence,
      fingerprintId,
      latitude,
      longitude,
      locationProvided
    } = req.body;

    // ── 1. VALIDACIÓN BÁSICA ──────────────────────────────
    if (!municipalityId || !candidateId) {
      return res.status(400).json({
        error: 'Datos requeridos: municipalityId y candidateId'
      });
    }

    if (!fingerprintId) {
      return res.status(400).json({
        error: 'Candado de Integridad: fingerprint requerido'
      });
    }

    // ── 2. EXTRACCIÓN DE TOKEN JWT (Opcional - sin bloqueo) ──
    let userId = null;
    let isAuthenticated = false;

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '').trim();
      try {
        const decoded = jwt.verify(
          token,
          process.env.JWT_SECRET || 'dev-secret-2027-guerrero'
        );
        userId = decoded.userId;
        isAuthenticated = true;
      } catch (err) {
        // Token inválido → continuar como anónimo, sin bloquear
        console.warn('⚠️ Token inválido, modo anónimo:', err.message);
      }
    }

    // ── 3. ANTI-SPAM POR FINGERPRINT (No por IP) ────────────
    // Permite múltiples usuarios en mismo WiFi (hogar, escuela, etc.)
    const spamCheck = await db.query(
      `SELECT id, created_at
       FROM predictions
       WHERE fingerprint_id = $1
         AND municipality_id = $2
       ORDER BY created_at DESC
       LIMIT 1`,
      [String(fingerprintId), parseInt(municipalityId, 10)]
    );

    if (spamCheck.rows.length > 0) {
      const lastPrediction = spamCheck.rows[0];
      const hoursSince =
        (Date.now() - new Date(lastPrediction.created_at).getTime()) /
        (1000 * 60 * 60);

      if (hoursSince < 24) {
        return res.status(429).json({
          error: 'Candado de Integridad: ya registraste tu percepción en este municipio',
          message: `Podrás actualizar en ${Math.ceil(24 - hoursSince)} horas`,
          hoursRemaining: Math.ceil(24 - hoursSince)
        });
      }
    }

    // ── 4. CALCULAR LOCATION_STATUS ──────────────────────────
    // Guerrero bounding box aproximado
    const GUERRERO_BOUNDS = {
      latMin: 16.2,
      latMax: 18.9,
      lonMin: -100.8,
      lonMax: -98.0
    };

    let locationStatus = 'NO_GPS';
    if (
      locationProvided &&
      latitude !== null &&
      longitude !== null &&
      !isNaN(parseFloat(latitude)) &&
      !isNaN(parseFloat(longitude))
    ) {
      const lat = parseFloat(latitude);
      const lon = parseFloat(longitude);
      const inRange =
        lat >= GUERRERO_BOUNDS.latMin &&
        lat <= GUERRERO_BOUNDS.latMax &&
        lon >= GUERRERO_BOUNDS.lonMin &&
        lon <= GUERRERO_BOUNDS.lonMax;

      locationStatus = inRange ? 'IN_RANGE' : 'OUT_OF_RANGE';
    }

    // ── 5. INYECTAR CONTEXTO EN req ──────────────────────────
    req.predictionCtx = {
      userId,
      isAuthenticated,
      fingerprintId: String(fingerprintId),
      locationStatus,
      latitude: latitude ?? null,
      longitude: longitude ?? null
    };

    next();
  } catch (error) {
    console.error('❌ Error en predictionSecurity:', error);
    res.status(500).json({ error: 'Error en validación de seguridad' });
  }
};

module.exports = { predictionSecurity };