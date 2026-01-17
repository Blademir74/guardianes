const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { query } = require('../db');
const { body, validationResult } = require('express-validator');

const SECRET_KEY = process.env.JWT_SECRET || 'dev-secret-key-change-in-prod';

// ===================================
// AUTH ANONIMA (Teléfono -> Hash -> JWT)
// ===================================

// 1. SOLICITAR CÓDIGO (Simulado para MVP, en prod usar Twilio/SNS)
// POST /api/auth/request-code
router.post('/request-code', [
    body('phone').matches(/^\d{10}$/).withMessage('El teléfono debe ser de 10 dígitos')
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { phone } = req.body;

    // Generar Hash del teléfono (Salt fijo por app + teléfono) para consistencia
    // NOTA: Para anonimato REAL, el salt no debería guardarse con el hash, pero necesitamos recuperar el usuario.
    // Usamos scrypt para hacer lento el ataque de fuerza bruta.
    const phoneHash = crypto.createHmac('sha256', 'GUARDIANES_SALT_2027').update(phone).digest('hex');

    // Generar OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 min

    try {
        // Guardar OTP
        await query(
            `INSERT INTO phone_verifications (phone_hash, otp_code, expires_at) 
             VALUES ($1, $2, $3)
             RETURNING id`,
            [phoneHash, otp, expiresAt]
        );

        // EN PRODUCCIÓN: Enviar SMS aquí.
        // PARA MVP: Retornar el código en la respuesta (SOLO BETA)
        console.log(`🔑 OTP para ${phone.slice(-4)}: ${otp}`);

        res.json({
            success: true,
            message: 'Código enviado (ver consola en dev)',
            debug_otp: process.env.NODE_ENV !== 'production' ? otp : undefined
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error al generar código' });
    }
});

// 2. VERIFICAR CÓDIGO
// POST /api/auth/verify-code
router.post('/verify-code', [
    body('phone').matches(/^\d{10}$/).withMessage('Teléfono inválido'),
    body('code').isLength({ min: 6, max: 6 }).withMessage('Código inválido')
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { phone, code } = req.body;
    const phoneHash = crypto.createHmac('sha256', 'GUARDIANES_SALT_2027').update(phone).digest('hex');

    try {
        // Verificar OTP
        const result = await query(
            `SELECT * FROM phone_verifications 
             WHERE phone_hash = $1 AND otp_code = $2 AND expires_at > NOW() AND verified = false
             ORDER BY created_at DESC LIMIT 1`,
            [phoneHash, code]
        );

        if (result.rows.length === 0) {
            return res.status(400).json({ error: 'Código inválido o expirado' });
        }

        // Marcar OTP como usado
        await query('UPDATE phone_verifications SET verified = true WHERE id = $1', [result.rows[0].id]);

        // Crear o Actualizar Usuario
        let userResult = await query('SELECT * FROM users WHERE phone_hash = $1', [phoneHash]);

        if (userResult.rows.length === 0) {
            userResult = await query(
                `INSERT INTO users (phone_hash) VALUES ($1) RETURNING *`,
                [phoneHash]
            );
        }

        const user = userResult.rows[0];

        // Generar JWT
        const token = jwt.sign(
            { id: user.id, hash: user.phone_hash, role: user.role },
            SECRET_KEY,
            { expiresIn: '30d' } // Sesión larga para conveniencia
        );

        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                role: user.role,
                points: user.points
            }
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error de verificación' });
    }
});

module.exports = router;