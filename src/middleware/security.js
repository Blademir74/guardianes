const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');

// Configuración de Helmet (Headers de Seguridad)
const helmetConfig = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.tailwindcss.com", "https://cdn.jsdelivr.net"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", "data:", "https:"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  crossOriginEmbedderPolicy: false,
});

// Configuración de CORS
const corsConfig = cors({
  origin: process.env.CORS_ORIGIN || '*', // En producción debería ser el dominio específico
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true,
  maxAge: 86400, // 24 horas
});

// Rate Limiter General (para toda la API)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 1000, // Límite de 1000 peticiones por IP (ajustado para alta concurrencia)
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 429,
    error: 'Demasiadas peticiones desde esta IP, por favor intente nuevamente en 15 minutos.'
  }
});

// Rate Limiter Específico para Auth (Login/Registro)
const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 10, // Máximo 10 intentos de login/registro por hora por IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 429,
    error: 'Demasiados intentos de autenticación, intente más tarde.'
  }
});

// Middleware de Validación de Inputs
const validate = (validations) => {
  return async (req, res, next) => {
    await Promise.all(validations.map(validation => validation.run(req)));

    const errors = validationResult(req);
    if (errors.isEmpty()) {
      return next();
    }

    res.status(400).json({
      success: false,
      errors: errors.array(),
      message: 'Error de validación en los datos enviados'
    });
  };
};

module.exports = {
  helmetConfig,
  corsConfig,
  apiLimiter,
  authLimiter,
  validate
};
