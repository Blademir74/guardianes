// backend/src/routes/auth.js
const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../db');
const { body, validationResult } = require('express-validator');
const { generateUserToken } = require('../middleware/auth');

const router = express.Router();

// Configuración
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const JWT_EXPIRATION = '7d';

// Almacenamiento temporal de códigos (en producción usar Redis)
const codes = new Map(); // phone -> { code, expiresAt }

// ========================================
// FUNCIONES AUXILIARES
// ========================================
function hashPhone(phone) {
    const fullPhone = `+52${phone}`;
    return crypto.createHash('sha256').update(fullPhone).digest('hex');
}

function generateCode(length = 4) {
    const min = Math.pow(10, length - 1);
    const max = Math.pow(10, length) - 1;
    return (Math.floor(Math.random() * (max - min + 1)) + min).toString();
}

// ========================================
// POST /api/auth/request-code
// ========================================
router.post('/request-code', [
  body('phone')
    .trim()
    .isLength({ min: 10, max: 10 })
    .isNumeric()
    .withMessage('Teléfono debe ser exactamente 10 dígitos numéricos')
], async (req, res) => {
    console.log('📱 POST /api/auth/request-code - Body:', req.body);

    // Manejar errores de validación
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            error: 'Datos inválidos',
            details: errors.array()
        });
    }

    try {
        const { phone } = req.body;

        // Generar código
        const code = generateCode(4);
        const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutos

        // Guardar en memoria
        codes.set(phone, { code, expiresAt });

        console.log(`✅ Código generado para ${phone}: ${code}`);
        console.log(`   Expira en: ${new Date(expiresAt).toLocaleTimeString()}`);

        // Respuesta
        return res.json({ 
            success: true,
            message: 'Código generado',
            code, // SOLO EN DESARROLLO
            phonePreview: `+52 ${phone.slice(0,3)} ${phone.slice(3,6)} ${phone.slice(6)}`,
            expiresIn: 600
        });

    } catch (error) {
        console.error('❌ Error en /request-code:', error);
        return res.status(500).json({ 
            error: 'Error interno al generar código' 
        });
    }
});

// ========================================
// POST /api/auth/verify-code
// ========================================
router.post('/verify-code', [
  body('phone')
    .trim()
    .isLength({ min: 10, max: 10 })
    .isNumeric()
    .withMessage('Teléfono debe ser exactamente 10 dígitos numéricos'),
  body('code')
    .trim()
    .isLength({ min: 4, max: 4 })
    .isNumeric()
    .withMessage('Código debe ser exactamente 4 dígitos numéricos')
], async (req, res) => {
    console.log('🔐 POST /api/auth/verify-code - Body:', req.body);

    // Manejar errores de validación
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            error: 'Datos inválidos',
            details: errors.array()
        });
    }

    const client = await db.connect();

    try {
        const { phone, code } = req.body;

        // Buscar código en memoria
        const entry = codes.get(phone);
        console.log('📋 Código almacenado:', entry);

        if (!entry) {
            console.log('❌ No hay código para este teléfono');
            return res.status(400).json({ 
                error: 'No hay código generado para este teléfono. Solicita uno nuevo.' 
            });
        }

        // Verificar expiración
        if (Date.now() > entry.expiresAt) {
            codes.delete(phone);
            console.log('❌ Código expirado');
            return res.status(400).json({ 
                error: 'Código expirado. Solicita uno nuevo.' 
            });
        }

        // Verificar código
        if (entry.code !== code) {
            console.log(`❌ Código incorrecto. Esperado: ${entry.code}, Recibido: ${code}`);
            return res.status(400).json({ 
                error: 'Código incorrecto' 
            });
        }

        console.log('✅ Código válido');

        await client.query('BEGIN');

        // Hash del teléfono
        const phoneHash = hashPhone(phone);

        // Buscar o crear usuario
        let userResult = await client.query(`
            SELECT id, points, predictions_count, accuracy_pct
            FROM users
            WHERE phone_hash = $1
        `, [phoneHash]);

        let userId;
        if (userResult.rows.length === 0) {
            // Crear nuevo usuario
            console.log('👤 Creando nuevo usuario');
            const newUserResult = await client.query(`
                INSERT INTO users (phone_hash, points, predictions_count, accuracy_pct, created_at, last_active)
                VALUES ($1, 0, 0, 0.0, NOW(), NOW())
                RETURNING id, points, predictions_count, accuracy_pct
            `, [phoneHash]);
            userId = newUserResult.rows[0].id;
            userResult = newUserResult;
        } else {
            userId = userResult.rows[0].id;
            console.log('👤 Usuario existente:', userId);
            // Actualizar last_active
            await client.query(`
                UPDATE users SET last_active = NOW() WHERE id = $1
            `, [userId]);
        }

        await client.query('COMMIT');

        const user = userResult.rows[0];

        // Generar JWT usando la función del middleware
        const token = generateUserToken(userId, phoneHash);

        // Limpiar código usado
        codes.delete(phone);

        console.log('✅ Token generado para userId:', userId);

        return res.json({
            success: true,
            token,
            user: {
                id: userId,
                points: user.points,
                predictionsCount: user.predictions_count,
                accuracyPct: user.accuracy_pct || 0
            }
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Error en /verify-code:', error);
        return res.status(500).json({ 
            error: 'Error interno al verificar código' 
        });
    } finally {
        client.release();
    }
});

// ========================================
// GET /api/auth/me
// ========================================
router.get('/me', async (req, res) => {
    console.log('👤 GET /api/auth/me');
    
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(401).json({ error: 'Token requerido' });
        }

        const decoded = jwt.verify(token, JWT_SECRET);
        
        const result = await db.query(`
            SELECT id, points, predictions_count, accuracy_pct, created_at, last_active
            FROM users
            WHERE id = $1
        `, [decoded.userId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        const user = result.rows[0];
        res.json({
            id: user.id,
            points: user.points,
            predictionsCount: user.predictions_count,
            accuracyPct: user.accuracy_pct || 0,
            memberSince: user.created_at,
            lastActive: user.last_active
        });

    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({ error: 'Token inválido' });
        }
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Token expirado' });
        }
        console.error('Error en /me:', error);
        res.status(500).json({ error: 'Error al obtener perfil' });
    }
});

// ========================================
// EXPORTAR ROUTER
// ========================================
console.log('✅ Router de autenticación configurado');

module.exports = router;