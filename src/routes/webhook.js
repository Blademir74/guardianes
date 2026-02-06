// src/routes/webhook.js — WhatsApp Webhook para Vercel
const express = require('express');
const router = express.Router();

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'verificacion_guardianes_2027_seguro';

console.log('🔧 [WEBHOOK] Inicializado');
console.log('🔧 [WEBHOOK] VERIFY_TOKEN configurado:', VERIFY_TOKEN ? 'SI' : 'NO');

/**
 * GET /api/webhook
 * Verificación de webhook por Meta
 */
router.get('/', (req, res) => {
  console.log('═══════════════════════════════════════════════');
  console.log('📥 [WEBHOOK GET] Solicitud de verificación');
  console.log('URL:', req.url);
  console.log('Query:', JSON.stringify(req.query, null, 2));
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  
  console.log('Parámetros recibidos:');
  console.log('  - hub.mode:', mode);
  console.log('  - hub.verify_token:', token);
  console.log('  - hub.challenge:', challenge);
  console.log('Token esperado:', VERIFY_TOKEN);
  console.log('Token match:', token === VERIFY_TOKEN);

  // Validar parámetros
  if (!mode || !token || !challenge) {
    console.log('❌ [WEBHOOK] Parámetros faltantes');
    console.log('═══════════════════════════════════════════════');
    return res.status(400).send('BAD_REQUEST');
  }

  // Validar modo y token
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('✅ [WEBHOOK] VERIFICACIÓN EXITOSA');
    console.log('Respondiendo con challenge:', challenge);
    console.log('═══════════════════════════════════════════════');
    
    // CRÍTICO: Enviar SOLO el challenge como texto plano
    return res.status(200).send(challenge);
  } else {
    console.log('❌ [WEBHOOK] VERIFICACIÓN FALLIDA');
    console.log('Razón:', mode !== 'subscribe' ? 'Modo incorrecto' : 'Token incorrecto');
    console.log('═══════════════════════════════════════════════');
    return res.status(403).send('FORBIDDEN');
  }
});

/**
 * POST /api/webhook
 * Recibir mensajes de WhatsApp
 */
router.post('/', async (req, res) => {
  console.log('═══════════════════════════════════════════════');
  console.log('📩 [WEBHOOK POST] Mensaje recibido');
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  console.log('Body:', JSON.stringify(req.body, null, 2));
  
  try {
    // Responder OK inmediatamente (CRÍTICO)
    res.status(200).send('EVENT_RECEIVED');
    console.log('✅ [WEBHOOK] Respondido OK a Meta');
    
    // Procesar mensaje en background
    const entry = req.body?.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const messages = value?.messages;
    
    if (messages && messages.length > 0) {
      const message = messages[0];
      console.log('💬 Mensaje procesado:');
      console.log('  - De:', message.from);
      console.log('  - Tipo:', message.type);
      console.log('  - Texto:', message.text?.body);
      
      // TODO: Implementar lógica de respuesta
    } else {
      console.log('ℹ️ [WEBHOOK] No hay mensajes en el webhook');
    }
    
    console.log('═══════════════════════════════════════════════');
    
  } catch (error) {
    console.error('❌ [WEBHOOK] Error procesando:', error);
    console.log('═══════════════════════════════════════════════');
  }
});

/**
 * GET /api/webhook/health
 * Health check del webhook
 */
router.get('/health', (req, res) => {
  const status = {
    status: 'ok',
    service: 'WhatsApp Webhook',
    timestamp: new Date().toISOString(),
    verifyToken: VERIFY_TOKEN ? 'configurado' : 'NO CONFIGURADO',
    env: {
      NODE_ENV: process.env.NODE_ENV,
      VERCEL: process.env.VERCEL || 'NO',
      VERCEL_ENV: process.env.VERCEL_ENV || 'N/A'
    }
  };
  
  console.log('🏥 [WEBHOOK HEALTH]', status);
  res.status(200).json(status);
});

module.exports = router;