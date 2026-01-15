/**
 * GUARDIANES GUERRERO 2027 - AUTENTICACIÓN ANÓNIMA DE ALTA DISPONIBILIDAD
 * CTO: Sistema Electoral de Alta Disponibilidad y Seguridad
 * Misión: Garantizar el anonimato y la integridad del voto ciudadano.
 * Stack: Node.js, Express, JWT, PostgreSQL (Neon), Rate Limiting
 */

const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');

const router = express.Router();

// ========================================
// CONFIGURACIÓN Y MIDDLEWARE
// ========================================

// El JWT_SECRET DEBE estar configurado en el servidor. Sin fallbacks por seguridad.
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRATION = '7d';

if (!JWT_SECRET) {
    console.error('🚨 FATAL: JWT_SECRET no está configurado. El servidor no puede iniciar sin él.');
    // El server.js ya se detendría, pero esta es una segunda capa de seguridad.
}

// Rate Limiting para prevenir abuso en la solicitud de códigos
const requestCodeLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 5, // Máximo 5 solicitudes de código por IP en 15 minutos
    message: {
        success: false,
        error: 'Demasiadas solicitudes. Por seguridad, espera unos minutos antes de intentar de nuevo.'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// ========================================
// FUNCIONES AUXILIARES Y AUDITORÍA
// ========================================

function logAudit(level, action, details, userId = null) {
    const logEntry = {
        timestamp: new Date().toISOString(),
        level: level, // 'INFO', 'WARN', 'ERROR', 'SECURITY'
        action: action, // 'AUTH_CODE_REQUESTED', 'AUTH_SUCCESS', 'AUTH_FAILED'
        userId: userId, // Será un hash o ID numérico, nunca datos PII
        details: details,
        ip: details.ip || 'N/A'
    };
    console.log(`[AUDIT-${level}] ${action}:`, JSON.stringify(logEntry));
}

function hashPhone(phone) {
    // Se añade el prefijo +52 para estandarizar y una sal global para mayor seguridad
    const fullPhone = `+52${phone}`;
    const salt = 'guardianes-gro-sal-2027'; // Sal fija como parte del algoritmo
    return crypto.createHash('sha256').update(fullPhone + salt).digest('hex');
}

function generateCode(length = 4) {
    const min = Math.pow(10, length - 1);
    const max = Math.pow(10, length) - 1;
    return (Math.floor(Math.random() * (max - min + 1)) + min).toString();
}

function generateUserToken(userId, userHash) {
    return jwt.sign(
        { userId, user_hash: userHash, type: 'user' }, // Payload estandarizado
        JWT_SECRET,
        { expiresIn: JWT_EXPIRATION }
    );
}

// ========================================
// MIDDLEWARE DE VERIFICACIÓN DE TOKEN (REUTILIZABLE)
// ========================================
const verifyUserToken = (req, res, next) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
        logAudit('WARN', 'AUTH_ATTEMPT_NO_TOKEN', { ip: req.ip });
        return res.status(401).json({ success: false, error: 'Token de autenticación requerido' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded; // Adjuntamos el usuario decodificado al request
        next();
    } catch (error) {
        logAudit('WARN', 'AUTH_ATTEMPT_INVALID_TOKEN', { ip: req.ip, error: error.message });
        return res.status(401).json({ success: false, error: 'Token inválido o expirado' });
    }
};

// ========================================
// POST /api/auth/request-code
// Solicitar código de verificación (anónimo y con persistencia en BD)
// ========================================

router.post('/request-code', 
    requestCodeLimiter, // <-- CRÍTICO: Aplicamos rate limiting aquí
    [
        body('phone')
            .trim()
            .isLength({ min: 10, max: 10 })
            .isNumeric()
            .withMessage('El teléfono debe ser exactamente 10 dígitos numéricos')
    ], 
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                error: 'Datos inválidos',
                details: errors.array()
            });
        }

        const { phone } = req.body;
        const phoneHash = hashPhone(phone);
        const code = generateCode(4);
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // Expira en 10 mins

        try {
            // Usamos la BD para persistencia. Esto funciona en Vercel (serverless).
            // ON CONFLICT permite reenviar el código si el usuario lo solicita de nuevo.
            await global.dbQuery(`
                INSERT INTO auth_codes (phone_hash, code, expires_at)
                VALUES ($1, $2, $3)
                ON CONFLICT (phone_hash) DO UPDATE SET
                    code = EXCLUDED.code,
                    expires_at = EXCLUDED.expires_at,
                    created_at = NOW()
            `, [phoneHash, code, expiresAt]);

            logAudit('INFO', 'AUTH_CODE_REQUESTED', { phoneHash: phoneHash.substring(0, 12) + '...', ip: req.ip });

            // TEMPORAL: Devolver el código para desarrollo. En producción, aquí se integraría Twilio.
            const isDevelopment = process.env.NODE_ENV !== 'production';
            
            res.json({
                success: true,
                message: isDevelopment ? 'Código generado (modo desarrollo)' : 'Código enviado por SMS',
                ...(isDevelopment && { code }) // Solo mostrar código en desarrollo
            });

        } catch (error) {
            logAudit('ERROR', 'AUTH_CODE_REQUEST_FAILED', { phoneHash: phoneHash.substring(0, 12) + '...', error: error.message, ip: req.ip });
            res.status(500).json({ success: false, error: 'Error al procesar la solicitud' });
        }
    }
);

// ========================================
// POST /api/auth/verify-code
// Verificar código y obtener token JWT
// ========================================

router.post('/verify-code', [
    body('phone').trim().isLength({ min: 10, max: 10 }).isNumeric(),
    body('code').trim().isLength({ min: 4, max: 4 }).isNumeric()
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, error: 'Datos inválidos' });
    }

    const { phone, code } = req.body;
    const phoneHash = hashPhone(phone);

    try {
        // Buscar el código en la BD
        const codeResult = await global.dbQuery(`
            SELECT code, expires_at FROM auth_codes WHERE phone_hash = $1
        `, [phoneHash]);

        if (codeResult.rows.length === 0) {
            logAudit('WARN', 'AUTH_CODE_NOT_FOUND', { phoneHash: phoneHash.substring(0, 12) + '...', ip: req.ip });
            return res.status(400).json({ success: false, error: 'Código inválido o expirado' });
        }

        const storedCodeData = codeResult.rows[0];

        // Verificar expiración
        if (new Date() > new Date(storedCodeData.expires_at)) {
            logAudit('WARN', 'AUTH_CODE_EXPIRED', { phoneHash: phoneHash.substring(0, 12) + '...', ip: req.ip });
            // Limpiar el código expirado
            await global.dbQuery('DELETE FROM auth_codes WHERE phone_hash = $1', [phoneHash]);
            return res.status(400).json({ success: false, error: 'Código expirado. Solicita uno nuevo.' });
        }

        // Verificar el código
        if (storedCodeData.code !== code) {
            logAudit('SECURITY', 'AUTH_CODE_INCORRECT', { phoneHash: phoneHash.substring(0, 12) + '...', ip: req.ip });
            return res.status(400).json({ success: false, error: 'Código incorrecto' });
        }

        // Código válido. Limpiarlo de la BD para evitar reuso.
        await global.dbQuery('DELETE FROM auth_codes WHERE phone_hash = $1', [phoneHash]);

        // Buscar o crear usuario (solo con el hash, nunca el teléfono)
        let userResult = await global.dbQuery(`
            SELECT id, points, predictions_count, created_at FROM users WHERE phone_hash = $1
        `, [phoneHash]);
        
        let user;
        if (userResult.rows.length === 0) {
            userResult = await global.dbQuery(`
                INSERT INTO users (phone_hash, points, predictions_count, created_at, last_active)
                VALUES ($1, 0, 0, NOW(), NOW())
                RETURNING id, points, predictions_count, created_at
            `, [phoneHash]);
            logAudit('INFO', 'USER_CREATED', { userId: userResult.rows[0].id, phoneHash: phoneHash.substring(0, 12) + '...', ip: req.ip });
        } else {
            await global.dbQuery('UPDATE users SET last_active = NOW() WHERE id = $1', [userResult.rows[0].id]);
        }
        
        user = userResult.rows[0];
        
        // Generar JWT
        const token = generateUserToken(user.id, phoneHash);
        
        logAudit('INFO', 'AUTH_SUCCESS', { userId: user.id, ip: req.ip });
        
        res.json({
            success: true,
            token: token,
            user: {
                id: user.id,
                points: user.points,
                predictionsCount: user.predictions_count || 0
            }
        });

    } catch (error) {
        logAudit('ERROR', 'AUTH_VERIFY_FAILED', { phoneHash: phoneHash.substring(0, 12) + '...', error: error.message, ip: req.ip });
        res.status(500).json({ success: false, error: 'Error al verificar el código' });
    }
});

// ========================================
// GET /api/auth/me
// Obtener datos del usuario actual (usando el middleware)
// ========================================

router.get('/me', verifyUserToken, async (req, res) => {
    try {
        const result = await global.dbQuery(`
            SELECT id, points, predictions_count, accuracy_pct, 
                   incidents_reported, created_at, last_active
            FROM users WHERE id = $1
        `, [req.user.userId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Usuario no encontrado' });
        }

        const user = result.rows[0];
        
        res.json({
            success: true,
            user: {
                id: user.id,
                points: user.points,
                predictionsCount: user.predictions_count || 0,
                accuracyPct: user.accuracy_pct || 0,
                incidentsReported: user.incidents_reported || 0,
                memberSince: user.created_at,
                lastActive: user.last_active
            }
        });

    } catch (error) {
        logAudit('ERROR', 'AUTH_ME_FAILED', { userId: req.user.userId, error: error.message, ip: req.ip });
        res.status(500).json({ success: false, error: 'Error al obtener el perfil' });
    }
});

// ========================================
// POST /api/auth/logout
// El logout es una acción del lado del cliente (eliminar el token)
// ========================================

router.post('/logout', (req, res) => {
    // Aquí se podría implementar una "blacklist" de tokens en Redis si fuera necesario
    logAudit('INFO', 'AUTH_LOGOUT', { userId: req.user?.userId, ip: req.ip });
    res.json({
        success: true,
        message: 'Sesión cerrada. Por favor, elimina el token de tu dispositivo.'
    });
});

// Exportamos el router y el middleware para que otros archivos lo usen
module.exports = { router, verifyUserToken };