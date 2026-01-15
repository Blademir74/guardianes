// tests/auth.test.js
const request = require('supertest');
const express = require('express');
const authRoutes = require('../src/routes/auth');

// Crear app de test sin el servidor completo
const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);

// Health check para tests
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date(),
    env: process.env.NODE_ENV || 'test'
  });
});

describe('Auth Routes', () => {
  describe('POST /api/auth/request-code', () => {
    it('should return 400 for invalid phone', async () => {
      const response = await request(app)
        .post('/api/auth/request-code')
        .send({ phone: '123' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
    });

    it('should accept valid phone', async () => {
      const response = await request(app)
        .post('/api/auth/request-code')
        .send({ phone: '5512345678' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('POST /api/auth/verify-code', () => {
    it('should return 400 for missing fields', async () => {
      const response = await request(app)
        .post('/api/auth/verify-code')
        .send({ phone: '5512345678' });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/health', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/api/health');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ok');
    });
  });
});