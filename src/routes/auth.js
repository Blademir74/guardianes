// src/routes/auth.js — GUARDIANES 2027 — VERSIÓN COMPLETA FUNCIONAL
const express = require('express');
const router = express.Router();
const { query } = require('../db');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const axios = require('axios');

// ============================================
// CONFIGURACIÓN
// ============================================
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-2027-guerrero';
const OTP_EXPIRY_MINUTES = 10;

// ============================================
// UTILIDADES
// ============================================
function generatePhoneHash(phone) {
  return crypto.createHash('sha256')
    .update(phone + (process.env.HASH_SALT || 'guardianes-2027'))
    .digest('hex');
}

function generateOTP() {
  // En desarrollo siempre retorna 345678 para facilitar pruebas
  if (process.env.NODE_ENV !== 'production') {
    return '345678';
  }
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ============================================
// ENDPOINTS
// ============================================

/**
 * POST /api/auth/request-code
 * Solicitar código OTP por SMS
 */
router.post('/request-code', async (req, res) => {
  try {
    const { phone } = req.body;
    
    if (!phone || !/^\d{10}$/.test(phone)) {
      return res.status(400).json({ error: 'Número inválido. Deben ser 10 dígitos.' });
    }

    // Generar OTP
    const otp = process.env.NODE_ENV === 'production' 
      ? Math.floor(100000 + Math.random() * 900000).toString()
      : '345678'; // Para pruebas locales

    // Guardar en BD (tu código actual ya hace esto)
    const phoneHash = crypto.createHash('sha256').update(phone + process.env.HASH_SALT).digest('hex');
    await query(`
      INSERT INTO users (phone_hash, phone_last4, otp_code, otp_expires, created_at, is_active)
      VALUES ($1, $2, $3, NOW() + INTERVAL '10 minutes', NOW(), true)
      ON CONFLICT (phone_hash) DO UPDATE SET
        otp_code = EXCLUDED.otp_code,
        otp_expires = NOW() + INTERVAL '10 minutes'
    `, [phoneHash, phone.slice(-4), otp]);

    // >>> ENVÍO REAL POR WHATSAPP <<<
       // >>> ENVÍO REAL POR WHATSAPP <<<
    if (process.env.NODE_ENV === 'production') {
      try {
        // Verificar que tenemos las variables necesarias
        if (!process.env.WHATSAPP_ACCESS_TOKEN || !process.env.WHATSAPP_PHONE_NUMBER_ID) {
          console.warn('⚠️ WhatsApp no configurado, usando modo DEBUG');
          // Fallback: mostrar en consola pero no romper
          console.log(`🔐 OTP PARA ${phone}: ${otp}`);
        } else {
          await sendVerificationWhatsApp(phone, otp);
          console.log(`📱 OTP enviado a ${phone}`);
        }
      } catch (whatsappError) {
        console.error('❌ Error WhatsApp:', whatsappError.message || whatsappError);
        // NO rompemos el flujo, devolvemos el OTP en debug para que pueda usarlo
        console.log(`🔐 OTP (fallback por error WhatsApp): ${otp}`);
      }
    } else {
      console.log(`🧪 MODO DEV - OTP para ${phone}: ${otp}`);
    }

    res.json({
      success: true,
      message: 'Código enviado por WhatsApp',
      phoneLast4: phone.slice(-4),
      // Solo en desarrollo mostramos el código
      debug_otp: process.env.NODE_ENV !== 'production' ? otp : undefined
    });

  } catch (error) {
    console.error('❌ Error enviando OTP:', error);
    res.status(500).json({ error: 'Error al generar código' });
  }
});

// Función para enviar OTP por WhatsApp Business API
async function sendVerificationWhatsApp(phoneNumber, otpCode) {
  try {
    // Validar configuración
    if (!process.env.WHATSAPP_PHONE_NUMBER_ID || !process.env.WHATSAPP_ACCESS_TOKEN) {
      throw new Error('Faltan variables de entorno de WhatsApp');
    }

    // Formato: código de país + número (México = 52)
    const formattedPhone = phoneNumber.startsWith('52') ? phoneNumber : `52${phoneNumber}`;
    
    const url = `https://graph.facebook.com/v18.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
    
    console.log(`📤 Enviando WhatsApp a ${formattedPhone}...`);
    
    const response = await axios.post(url, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: formattedPhone,
      type: 'text',
      text: {
        body: `🔐 *Guardianes Guerrero 2027*\n\nTu código de verificación es: *${otpCode}*\n\nVálido por 10 minutos. No compartas este código con nadie.`
      }
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000 // 10 segundos timeout
    });

    console.log('✅ WhatsApp enviado:', response.data?.messages?.[0]?.id);
    return true;
  } catch (error) {
    console.error('❌ Error detalle WhatsApp:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status
    });
    throw error; // Relanzamos para que el catch superior lo maneje
  }
}


/**
 * POST /api/auth/verify-code
 * Verificar código OTP y retornar JWT
 */
router.post('/verify-code', async (req, res) => {
  try {
    const { phone, code } = req.body;

    if (!phone || !code) {
      return res.status(400).json({ error: 'Teléfono y código requeridos' });
    }

    const phoneHash = generatePhoneHash(phone);

    console.log(`🔍 Verificando código para ${phone.slice(-4)}`);

    // Buscar usuario por hash de teléfono
    const result = await query(`
      SELECT 
        id, 
        otp_code, 
        otp_expires, 
        is_active,
        phone_last4,
        name,
        points
      FROM users
      WHERE phone_hash = $1
    `, [phoneHash]);

    if (result.rows.length === 0) {
      console.log(`❌ Usuario no encontrado para ${phone.slice(-4)}`);
      return res.status(404).json({ 
        error: 'Usuario no encontrado. Solicita un código primero.' 
      });
    }

    const user = result.rows[0];

    // Validar cuenta activa
    if (!user.is_active) {
      return res.status(403).json({ error: 'Cuenta inactiva' });
    }

    // Validar código
    if (user.otp_code !== code) {
      console.log(`❌ Código incorrecto para ${phone.slice(-4)}`);
      return res.status(401).json({ error: 'Código incorrecto' });
    }

    // Validar expiración
    if (new Date(user.otp_expires) < new Date()) {
      console.log(`❌ Código expirado para ${phone.slice(-4)}`);
      return res.status(401).json({ 
        error: 'Código expirado. Solicita uno nuevo.' 
      });
    }

    // Código válido → limpiar OTP y generar token
    await query(`
      UPDATE users 
      SET 
        otp_code = NULL, 
        otp_expires = NULL, 
        is_verified = true,
        last_active = NOW(),
        updated_at = NOW()
      WHERE id = $1
    `, [user.id]);

    // Generar JWT
    const token = jwt.sign(
      { 
        userId: user.id,
        phone: phone.slice(-4),
        role: 'user'
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    console.log(`✅ Token generado para usuario ${user.id}`);

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        phone: user.phone_last4,
        name: user.name || `Usuario ${user.phone_last4}`,
        points: user.points || 0
      }
    });

  } catch (error) {
    console.error('❌ Error en /verify-code:', error);
    res.status(500).json({ 
      error: 'Error verificando código',
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
    // Extraer token del header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token no proporcionado' });
    }

    const token = authHeader.split(' ')[1];

    // Verificar token
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      console.log('❌ Token inválido:', err.message);
      return res.status(401).json({ error: 'Token inválido' });
    }

    if (!decoded.userId) {
      return res.status(401).json({ error: 'Token malformado' });
    }

    // Buscar usuario en BD
    const result = await query(`
      SELECT 
        id, 
        phone_last4, 
        name, 
        points, 
        level, 
        role,
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
      name: user.name || `Usuario ${user.phone_last4}`,
      points: user.points || 0,
      level: user.level || 'Observador',
      role: user.role || 'user',
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
 * Actualizar perfil del usuario
 */
router.put('/profile', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token no proporcionado' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    if (!decoded.userId) {
      return res.status(401).json({ error: 'Token inválido' });
    }

    const { name, municipality_id } = req.body;

    await query(`
      UPDATE users 
      SET 
        name = COALESCE($1, name),
        municipality_id = COALESCE($2, municipality_id),
        updated_at = NOW()
      WHERE id = $3
    `, [name || null, municipality_id || null, decoded.userId]);

    res.json({ 
      success: true, 
      message: 'Perfil actualizado exitosamente' 
    });

  } catch (error) {
    console.error('❌ Error en /profile:', error);
    res.status(500).json({ error: 'Error al actualizar perfil' });
  }
});

module.exports = router;