// src/scripts/fix-neon-schema.js
require('dotenv').config({ path: '.env' });
const { Pool } = require('pg');

async function fixSchema() {
  console.log('🚀 Iniciando migración de esquema en Neon...');
  
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const client = await pool.connect();
    console.log('✅ Conexión establecida.');

    console.log('🛠️  Añadiendo columnas a survey_responses...');
    await client.query(`
      ALTER TABLE survey_responses 
      ADD COLUMN IF NOT EXISTS fingerprint_id VARCHAR(255),
      ADD COLUMN IF NOT EXISTS ip_address VARCHAR(100),
      ADD COLUMN IF NOT EXISTS phone_hash VARCHAR(64);
    `);
    console.log('✅ Columnas añadidas (o ya existentes).');

    console.log('🛠️  Creando índice de integridad si no existe...');
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_survey_responses_unique_vote 
      ON survey_responses (survey_id, fingerprint_id) 
      WHERE fingerprint_id IS NOT NULL;
    `);
    console.log('✅ Índice de integridad verificado.');

    console.log('🛠️  Verificando estructura de la tabla...');
    const res = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'survey_responses'
    `);
    console.log('📊 Columnas actuales:', res.rows.map(r => r.column_name).join(', '));

    client.release();
    console.log('🎉 Migración completada exitosamente.');
  } catch (err) {
    console.error('❌ Error durante la migración:', err.message);
  } finally {
    await pool.end();
  }
}

fixSchema();
