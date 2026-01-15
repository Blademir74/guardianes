// tests/setup.js
require('dotenv').config({ path: '.env.test' });

// Configuración global para tests
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test_db';

// Si no hay DB de test, usar memoria o mock
if (!process.env.DATABASE_URL.includes('test')) {
  console.warn('⚠️ Usando DB de desarrollo para tests. Considera configurar una DB de test separada.');
}