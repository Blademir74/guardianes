// src/middleware/auth.js
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || 'admin-dev-secret';

// Función para generar token de usuario
function generateUserToken(userId, phoneHash) {
  return jwt.sign(
    { userId, phoneHash },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

// Función para generar token de admin
function generateAdminToken(adminId, username) {
  return jwt.sign(
    { adminId, username },
    ADMIN_JWT_SECRET,
    { expiresIn: '24h' }
  );
}

// Middleware para verificar token de usuario
function verifyToken(req, res, next) {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'Token requerido' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    req.phoneHash = decoded.phoneHash;
    
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Token inválido' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expirado' });
    }
    return res.status(500).json({ error: 'Error al verificar token' });
  }
}

// Middleware para verificar token de admin
function verifyAdminToken(req, res, next) {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'Token de admin requerido' });
    }

    const decoded = jwt.verify(token, ADMIN_JWT_SECRET);
    req.adminId = decoded.adminId;
    req.adminUsername = decoded.username;
    
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Token de admin inválido' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token de admin expirado' });
    }
    return res.status(500).json({ error: 'Error al verificar token de admin' });
  }
}

// Middleware opcional (no requiere token, pero si existe lo valida)
function optionalAuth(req, res, next) {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (token) {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.userId = decoded.userId;
      req.phoneHash = decoded.phoneHash;
    }
    
    next();
  } catch (error) {
    // Si el token es inválido, continuar sin autenticación
    next();
  }
}

module.exports = {
  verifyToken,
  verifyAdminToken,
  optionalAuth,
  generateUserToken,
  generateAdminToken
};