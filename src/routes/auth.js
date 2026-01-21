// src/routes/auth.js
// Ruta de autenticación anónima con OTP
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { query } = require('../db');
const { body, validationResult } = require('express-validator');

const SECRET_KEY = process.env.JWT_SECRET || 'dev-secret-key-change-in-prod';
const SALT = 'GUARDIANES_SALT_2027';

// ===================================
// 1. SOLICITAR CÓDIGO OTP
// ===================================
router.post('/request-code', [
    body('phone').matches(/^\d{10}$/).withMessage('El teléfono debe ser de 10 dígitos')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { phone } = req.body;

        // Generar hash del teléfono
        const phoneHash = crypto.createHmac('sha256', SALT).update(phone).digest('hex');

        // Generar OTP de 6 dígitos
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutos

        console.log(`📱 OTP para ${phone.slice(-4)}: ${otp}`);

        // Guardar OTP en base de datos
        await query(
            `INSERT INTO phone_verifications (phone_hash, otp_code, expires_at) 
             VALUES ($1, $2, $3)`,
            [phoneHash, otp, expiresAt]
        );

        // EN PRODUCCIÓN: Enviar SMS con Twilio/SNS aquí
        // Para desarrollo, retornar el código
        res.json({
            success: true,
            message: 'Código enviado exitosamente',
            // Solo en desarrollo
            debug_otp: process.env.NODE_ENV !== 'production' ? otp : undefined
        });

    } catch (err) {
        console.error('❌ Error en request-code:', err);
        res.status(500).json({ 
            error: 'Error al generar código',
            message: process.env.NODE_ENV === 'development' ? err.message : 'Error interno'
        });
    }
});

// ===================================
// 2. VERIFICAR CÓDIGO OTP
// ===================================
router.post('/verify-code', [
    body('phone').matches(/^\d{10}$/).withMessage('Teléfono inválido'),
    body('code').isLength({ min: 4 }).withMessage('Código inválido')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { phone, code } = req.body;
        const phoneHash = crypto.createHmac('sha256', SALT).update(phone).digest('hex');

        // Verificar OTP
        const result = await query(
            `SELECT * FROM phone_verifications 
             WHERE phone_hash = $1 
             AND otp_code = $2 
             AND expires_at > NOW() 
             AND verified = false
             ORDER BY created_at DESC 
             LIMIT 1`,
            [phoneHash, code]
        );

        if (result.rows.length === 0) {
            return res.status(400).json({ 
                error: 'Código inválido o expirado',
                success: false 
            });
        }

        // Marcar OTP como usado
        await query(
            'UPDATE phone_verifications SET verified = true WHERE id = $1',
            [result.rows[0].id]
        );

        // Buscar o crear usuario
        let userResult = await query(
            'SELECT * FROM users WHERE phone_hash = $1',
            [phoneHash]
        );

        let user;
        if (userResult.rows.length === 0) {
            // Crear nuevo usuario
            userResult = await query(
                `INSERT INTO users (phone_hash, role, points, level) 
                 VALUES ($1, $2, $3, $4) 
                 RETURNING *`,
                [phoneHash, 'citizen', 0, 'Observador']
            );
            user = userResult.rows[0];
            console.log('✅ Nuevo usuario creado:', user.id);
        } else {
            user = userResult.rows[0];
            console.log('✅ Usuario existente:', user.id);
        }

        // Generar JWT
        const token = jwt.sign(
            { 
                id: user.id, 
                hash: user.phone_hash, 
                role: user.role 
            },
            SECRET_KEY,
            { expiresIn: '30d' }
        );

        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                role: user.role,
                points: user.points,
                level: user.level,
                predictions_count: user.predictions_count || 0,
                surveys_completed: user.surveys_completed || 0
            }
        });

    } catch (err) {
        console.error('❌ Error en verify-code:', err);
        res.status(500).json({ 
            error: 'Error de verificación',
            message: process.env.NODE_ENV === 'development' ? err.message : 'Error interno'
        });
    }
});

// ===================================
// 3. OBTENER DATOS DEL USUARIO ACTUAL
// ===================================
router.get('/me', authenticateToken, async (req, res) => {
    try {
        const result = await query(
            'SELECT id, phone_hash, role, points, level, predictions_count, surveys_completed, incidents_reported FROM users WHERE id = $1',
            [req.user.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }

        res.json(result.rows[0]);
    } catch (err) {
        console.error('❌ Error en /me:', err);
        res.status(500).json({ error: 'Error interno' });
    }
});

// ===================================
// MIDDLEWARE DE AUTENTICACIÓN
// ===================================
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Token no proporcionado' });
    }

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Token inválido o expirado' });
        }
        req.user = user;
        next();
    });
}

module.exports = router;