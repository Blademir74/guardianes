// src/middleware/auth.js — ESTÁNDAR DE ORO (Auditoría P0)
// Correcciones: Eliminados todos los fallbacks con valores hardcodeados.
// JWT_SECRET y ADMIN_JWT_SECRET deben existir como variables de entorno.
// Si no existen, el proceso lanza error en arranque — esto es intencional.

const jwt = require('jsonwebtoken');

function requireEnv(name) {
  const val = process.env[name];
  if (!val) {
    throw new Error(`FATAL: Variable de entorno "${name}" no está definida. Configúrala en Vercel antes de desplegar.`);
  }
  return val;
}

const JWT_SECRET       = requireEnv('JWT_SECRET');
const ADMIN_JWT_SECRET = requireEnv('ADMIN_JWT_SECRET');

function generateUserToken(userId, phoneHash) {
  return jwt.sign({ userId, phoneHash }, JWT_SECRET, { expiresIn: '7d' });
}

function generateAdminToken(adminId, username) {
  return jwt.sign({ adminId, username, role: 'admin' }, ADMIN_JWT_SECRET, { expiresIn: '24h' });
}

function verifyToken(req, res, next) {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Token requerido' });
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId    = decoded.userId;
    req.phoneHash = decoded.phoneHash;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError')  return res.status(401).json({ error: 'Token inválido' });
    if (error.name === 'TokenExpiredError')  return res.status(401).json({ error: 'Token expirado' });
    return res.status(500).json({ error: 'Error al verificar token' });
  }
}

function verifyAdminToken(req, res, next) {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
    if (!token) return res.status(401).json({ error: 'Token de admin requerido' });
    const decoded    = jwt.verify(token, ADMIN_JWT_SECRET);
    req.adminId       = decoded.adminId;
    req.adminUsername = decoded.username;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError')  return res.status(401).json({ error: 'Token de admin inválido' });
    if (error.name === 'TokenExpiredError')  return res.status(401).json({ error: 'Token de admin expirado' });
    return res.status(500).json({ error: 'Error al verificar token de admin' });
  }
}

function optionalAuth(req, res, next) {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token) {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.userId    = decoded.userId;
      req.phoneHash = decoded.phoneHash;
    }
    next();
  } catch (_) {
    next();
  }
}

module.exports = { verifyToken, verifyAdminToken, optionalAuth, generateUserToken, generateAdminToken };
