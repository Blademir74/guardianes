// src/seed-admin.js
const bcrypt = require('bcrypt');
const db = require('./db');

async function createAdmin() {
  try {
    const username = 'admin';
    const password = 'GuardianesGro2026!';
    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await db.query(`
      INSERT INTO admins (username, password_hash, role, is_active)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (username) DO UPDATE SET
        password_hash = EXCLUDED.password_hash,
        is_active = EXCLUDED.is_active
      RETURNING id, username
    `, [username, hashedPassword, 'admin', true]);

    console.log('✅ Admin creado/actualizado:', result.rows[0]);
  } catch (error) {
    console.error('❌ Error creando admin:', error);
  } finally {
    process.exit();
  }
}

createAdmin();