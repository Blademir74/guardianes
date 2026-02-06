// src/routes/auth.js — GUARDIANES PILOTO — LOGIN SIMPLIFICADO SIN OTP
const express = require('express');
const router = express.Router();
const { query } = require('../db');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-2027-guerrero';

// Generar hash del teléfono para privacidad
function generatePhoneHash(phone) {
  return crypto.createHash('sha256')
    .update(phone + (process.env.HASH_SALT || 'guardianes-2027'))
    .digest('hex');
}

// Generar fingerprint del navegador
function generateFingerprint(req) {
  const userAgent = req.headers['user-agent'] || '';
  const ip = req.ip || req.connection.remoteAddress || '';
  return crypto.createHash('sha256')
    .update(userAgent + ip)
    .digest('hex');
}

/**
 * POST /api/auth/quick-login
 * Login simplificado: solo teléfono → token directo
 */
router.post('/quick-login', async (req, res) => {
  try {
    const { phone } = req.body;

    // Validar formato (10 dígitos)
    if (!phone || !/^\d{10}$/.test(phone)) {
      return res.status(400).json({ 
        error: 'Número inválido. Deben ser 10 dígitos (ejemplo: 7441234567)' 
      });
    }

    // Validar que sea de Guerrero (códigos de área)
    const guerreroAreaCodes = ['744', '747', '733', '758', '767', '741', '742'];
    const areaCode = phone.substring(0, 3);
    
    if (!guerreroAreaCodes.includes(areaCode)) {
      return res.status(400).json({
        error: 'Solo números de Guerrero. Tu número debe empezar con: 744, 747, 733, 758, 767, 741, o 742'
      });
    }

    const phoneHash = generatePhoneHash(phone);
    const fingerprint = generateFingerprint(req);

    console.log(`📱 Quick login para: ${phone.substring(0, 3)}****${phone.substring(7)}`);

    // Buscar o crear usuario
    let result = await query(`
      SELECT id, phone_last4, name, points, level
      FROM users
      WHERE phone_hash = $1
    `, [phoneHash]);

    let userId;
    let isNewUser = false;

    if (result.rows.length === 0) {
      // Usuario nuevo - crear
      const insertResult = await query(`
        INSERT INTO users (
          phone_hash,
          phone_last4,
          level,
          device_fingerprint,
          is_active,
          created_at
        )
        VALUES ($1, $2, 'Piloto', $3, true, NOW())
        RETURNING id, phone_last4, name, points, level
      `, [phoneHash, phone.slice(-4), fingerprint]);

      result = insertResult;
      isNewUser = true;
      console.log(`✅ Nuevo usuario Piloto creado: ${phone.slice(-4)}`);
    } else {
      // Usuario existente - actualizar fingerprint y last_active
      await query(`
        UPDATE users 
        SET 
          device_fingerprint = $1,
          last_active = NOW()
        WHERE id = $2
      `, [fingerprint, result.rows[0].id]);
      
      console.log(`✅ Usuario existente: ${phone.slice(-4)}`);
    }

    const user = result.rows[0];
    userId = user.id;

    // Generar JWT
    const token = jwt.sign(
      { 
        userId: userId,
        phone: phone.slice(-4),
        level: 'Piloto',
        fingerprint: fingerprint
      },
      JWT_SECRET,
      { expiresIn: '30d' } // Token válido por 30 días
    );

    console.log(`🔑 Token generado para usuario ${userId}`);

    res.json({
      success: true,
      token,
      user: {
        id: userId,
        phone: user.phone_last4,
        name: user.name || `Guardián ${user.phone_last4}`,
        points: user.points || 0,
        level: 'Piloto',
        isNew: isNewUser
      },
      message: isNewUser 
        ? '¡Bienvenido a Guardianes Guerrero! 🗳️' 
        : '¡De vuelta, Guardián! 🎯'
    });

  } catch (error) {
    console.error('❌ Error en quick-login:', error);
    res.status(500).json({ 
      error: 'Error al procesar login',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * GET /api/auth/me
 * Obtener datos del usuario autenticado
 */
router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token no proporcionado' });
    }

    const token = authHeader.split(' ')[1];
    let decoded;

    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ error: 'Token inválido o expirado' });
    }

    const result = await query(`
      SELECT 
        id, 
        phone_last4, 
        name, 
        points, 
        level, 
        predictions_count,
        surveys_completed
      FROM users
      WHERE id = $1 AND is_active = true
    `, [decoded.userId]);

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Usuario no encontrado' });
    }

    const user = result.rows[0];

    res.json({
      id: user.id,
      phone: user.phone_last4,
      name: user.name || `Guardián ${user.phone_last4}`,
      points: user.points || 0,
      level: user.level || 'Piloto',
      predictions: user.predictions_count || 0,
      surveys: user.surveys_completed || 0
    });

  } catch (error) {
    console.error('❌ Error en /me:', error);
    res.status(401).json({ error: 'Error de autenticación' });
  }
});

/**
 * PUT /api/auth/profile
 * Actualizar nombre del usuario
 */
router.put('/profile', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token no proporcionado' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    const { name } = req.body;

    if (name && name.length > 2) {
      await query(`
        UPDATE users 
        SET name = $1, updated_at = NOW()
        WHERE id = $2
      `, [name, decoded.userId]);

      console.log(`✅ Perfil actualizado: Usuario ${decoded.userId}`);
    }

    res.json({ 
      success: true, 
      message: 'Perfil actualizado' 
    });

  } catch (error) {
    console.error('❌ Error en /profile:', error);
    res.status(500).json({ error: 'Error al actualizar perfil' });
  }
});

module.exports = router;