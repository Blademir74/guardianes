// fix_direct.js
const { Pool } = require('pg');

const DATABASE_URL = 'postgresql://neondb_owner:npg_S3p5ZlAKTEzj@ep-crimson-voice-ahzm53r1-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require';

async function fix() {
  console.log('🚀 UNIÓN DE INTEGRIDAD: Ejecutando parche directo en Neon...');
  const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  
  try {
    const client = await pool.connect();
    console.log('✅ Conexión establecida.');

    console.log('🛠️  Aplicando ALTER TABLE...');
    await client.query(`
      ALTER TABLE survey_responses 
      ADD COLUMN IF NOT EXISTS fingerprint_id VARCHAR(255),
      ADD COLUMN IF NOT EXISTS ip_address VARCHAR(100),
      ADD COLUMN IF NOT EXISTS phone_hash VARCHAR(64);
      
      CREATE UNIQUE INDEX IF NOT EXISTS idx_survey_responses_unique_vote 
      ON survey_responses (survey_id, fingerprint_id) 
      WHERE fingerprint_id IS NOT NULL;
    `);
    console.log('✅ Cambio de esquema completado.');
    
    client.release();
  } catch (err) {
    console.error('❌ ERROR:', err.message);
  } finally {
    await pool.end();
  }
}

fix();
