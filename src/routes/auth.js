// src/routes/auth.js - VERSIÓN PILOTO (ACCESO DIRECTO)
const express = require('express');
const router = express.Router();
const { query } = require('../db');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-2027-guerrero';

// Utility: Hash del teléfono (para privacidad en BD)
function generatePhoneHash(phone) {
  return crypto.createHash('sha256')
    .update(phone + (process.env.HASH_SALT || 'guardianes-2027'))
    .digest('hex');
}

// 1. SOLICITUD DE ACCESO (SIMULADA)
router.post('/request-code', async (req, res) => {
  try {
    const { phone } = req.body;
    
    // Validación básica: México 10 dígitos
    if (!phone || !/^\d{10}$/.test(phone)) {
      return res.status(400).json({ error: 'Ingresa un número válido de 10 dígitos.' });
    }

    // Código MAESTRO para el piloto (El frontend lo usará automáticamente)
    const MASTER_CODE = '202727'; 

    const phoneHash = generatePhoneHash(phone);

    // Creamos o actualizamos el usuario (Sin enviar mensaje real)
    await query(`
      INSERT INTO users (phone_hash, phone_last4, otp_code, otp_expires, created_at, is_active, level)
      VALUES ($1, $2, $3, NOW() + INTERVAL '1 hour', NOW(), true, 'PILOTO')
      ON CONFLICT (phone_hash) DO UPDATE SET
        otp_code = EXCLUDED.otp_code,
        otp_expires = NOW() + INTERVAL '1 hour',
        last_active = NOW()
    `, [phoneHash, phone.slice(-4), MASTER_CODE]);

    console.log(`🚀 ACCESO PILOTO: Usuario ${phone.slice(-4)} registrado.`);

    // Respondemos que "se envió" pero mandamos el código en la respuesta
    // para que el Frontend lo use automáticamente.
    res.json({
      success: true,
      message: 'Acceso autorizado',
      phoneLast4: phone.slice(-4),
      autoFillCode: MASTER_CODE // <--- LA CLAVE MÁGICA
    });

  } catch (error) {
    console.error('❌ Error en login piloto:', error);
    res.status(500).json({ error: 'Error interno' });
  }
});

// 2. VERIFICACIÓN (Mantenemos la lógica pero aceptamos el código maestro)
router.post('/verify-code', async (req, res) => {
  try {
    const { phone, code } = req.body;
    const phoneHash = generatePhoneHash(phone);

    // Buscamos al usuario
    const result = await query(
      'SELECT id, otp_code, name, points FROM users WHERE phone_hash = $1', 
      [phoneHash]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const user = result.rows[0];

    // Verificamos el código (que será siempre 202727 en esta fase)
    if (user.otp_code !== code) {
      return res.status(401).json({ error: 'Código incorrecto' });
    }

    // Generamos Token real para que el sistema funcione normalmente
    const token = jwt.sign(
      { userId: user.id, phone: phone.slice(-4), role: 'citizen' },
      JWT_SECRET,
      { expiresIn: '30d' } // Sesión larga para que no tengan que volver a entrar
    );

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        name: user.name || `Ciudadano ${phone.slice(-4)}`,
        points: user.points || 0
      }
    });

  } catch (error) {
    console.error('❌ Error verify:', error);
    res.status(500).json({ error: 'Error de verificación' });
  }
});

// ... (Deja las rutas /me y /profile igual que antes) ...
// Copia aquí abajo las rutas /me y /profile que ya tenías funcionando
router.get('/me', async (req, res) => { /* ... tu código existente ... */ });
router.put('/profile', async (req, res) => { /* ... tu código existente ... */ });

module.exports = router;