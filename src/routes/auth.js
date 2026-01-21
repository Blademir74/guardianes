// src/routes/auth.js
const express = require('express');
const router = express.Router();
const { query } = require('../db');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// Generar hash SHA-256
function generatePhoneHash(phone) {
  return crypto.createHash('sha256').update(phone + process.env.HASH_SALT).digest('hex');
}

// 1. SOLICITAR CÓDIGO
router.post('/request-code', async (req, res) => {
  try {
    const { phone } = req.body;
    
    if (!phone || !/^\d{10}$/.test(phone)) {
      return res.status(400).json({ error: 'Número inválido. Deben ser 10 dígitos.' });
    }

    // Generar código OTP (6 dígitos)
    const otp = process.env.NODE_ENV === 'production' 
      ? Math.floor(100000 + Math.random() * 900000).toString()
      : '123456'; // Código fijo para desarrollo

    const phoneHash = generatePhoneHash(phone);
    
    // Verificar si el usuario ya existe
    const userCheck = await query(
      'SELECT id FROM users WHERE phone_hash = $1',
      [phoneHash]
    );

    if (userCheck.rows.length > 0) {
      // Actualizar OTP para usuario existente
      await query(
        `UPDATE users SET 
          otp_code = $1,
          otp_expires = NOW() + INTERVAL '10 minutes',
          updated_at = NOW()
        WHERE phone_hash = $2`,
        [otp, phoneHash]
      );
    } else {
      // Crear nuevo usuario
      await query(
        `INSERT INTO users (phone_hash, phone_last4, otp_code, otp_expires) 
         VALUES ($1, $2, $3, NOW() + INTERVAL '10 minutes')`,
        [phoneHash, phone.slice(-4), otp]
      );
    }

    console.log(`📱 OTP para ${phone}: ${otp} (Hash: ${phoneHash.substring(0, 10)}...)`);
    
    res.json({ 
      success: true, 
      message: 'Código enviado',
      debug_otp: process.env.NODE_ENV !== 'production' ? otp : undefined
    });
    
  } catch (error) {
    console.error('❌ Error en /request-code:', error);
    res.status(500).json({ error: 'Error interno al generar código' });
  }
});

// 2. VERIFICAR CÓDIGO
router.post('/verify-code', async (req, res) => {
  try {
    const { phone, code } = req.body;
    
    if (!phone || !code) {
      return res.status(400).json({ error: 'Teléfono y código requeridos' });
    }

    const phoneHash = generatePhoneHash(phone);
    
    // Verificar código
    const result = await query(`
      SELECT id, phone_last4, name, points, level, role
      FROM users 
      WHERE phone_hash = $1 
      AND otp_code = $2 
      AND otp_expires > NOW()
      AND is_active = true
    `, [phoneHash, code]);

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Código inválido o expirado' });
    }

    const user = result.rows[0];
    
    // Generar token JWT
    const token = jwt.sign(
      { 
        userId: user.id, 
        phoneHash: phoneHash,
        role: user.role || 'user'
      }, 
      process.env.JWT_SECRET || 'dev-secret-2027-guerrero',
      { expiresIn: '30d' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        phoneLast4: user.phone_last4,
        name: user.name || `Usuario ${user.phone_last4}`,
        points: user.points || 0,
        level: user.level || 'Observador',
        role: user.role || 'user'
      }
    });
    
  } catch (error) {
    console.error('❌ Error en /verify-code:', error);
    res.status(500).json({ error: 'Error al verificar código' });
  }
});

// 3. VERIFICAR TOKEN (ME)
router.get('/me', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ error: 'Token no proporcionado' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret-2027-guerrero');
    
    const result = await query(`
      SELECT id, phone_last4, name, points, level, role
      FROM users 
      WHERE id = $1 AND is_active = true
    `, [decoded.userId]);

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Usuario no encontrado' });
    }

    const user = result.rows[0];
    
    res.json({
      id: user.id,
      phoneLast4: user.phone_last4,
      name: user.name || `Usuario ${user.phone_last4}`,
      points: user.points || 0,
      level: user.level || 'Observador',
      role: user.role || 'user'
    });
    
  } catch (error) {
    console.error('❌ Error en /me:', error);
    res.status(401).json({ error: 'Token inválido' });
  }
});

// 4. ACTUALIZAR PERFIL
router.put('/profile', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'Token no proporcionado' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret-2027-guerrero');
    const { name, municipality_id } = req.body;
    
    await query(
      `UPDATE users SET 
        name = COALESCE($1, name),
        municipality_id = COALESCE($2, municipality_id),
        updated_at = NOW()
       WHERE id = $3`,
      [name, municipality_id, decoded.userId]
    );

    res.json({ success: true, message: 'Perfil actualizado' });
    
  } catch (error) {
    console.error('❌ Error en /profile:', error);
    res.status(500).json({ error: 'Error al actualizar perfil' });
  }
});

module.exports = router;