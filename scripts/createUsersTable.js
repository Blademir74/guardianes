// scripts/createUsersTable.js
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres:NuevaClave123@localhost:5432/guardianes_db',
});

async function createUsersTable() {
  console.log('Creando la tabla "users" si no existe...');
  try {
    const query = `
      CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          phone_hash VARCHAR(64) UNIQUE NOT NULL,
          points INT DEFAULT 0,
          predictions_count INT DEFAULT 0,
          accuracy_pct DECIMAL(5, 2) DEFAULT 0.00,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          last_active TIMESTAMPTZ DEFAULT NOW()
      );
    `;
    await pool.query(query);
    console.log('✅ Tabla "users" creada o ya existente.');
  } catch (err) {
    console.error('❌ Error al crear la tabla "users":', err);
  } finally {
    await pool.end();
  }
}

createUsersTable();