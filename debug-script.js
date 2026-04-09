require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  try {
    const res = await pool.query(`SELECT id, name, party FROM candidates WHERE name ILIKE '%Hernandez%' OR name ILIKE '%Olag%' LIMIT 10`);
    console.log('--- CANDIDATOS OLAGER ---');
    console.table(res.rows);

    const res2 = await pool.query(`
      SELECT response_value, COUNT(*) as count 
      FROM survey_responses 
      WHERE response_value ILIKE '%Hernandez%' OR response_value ILIKE '%Olag%'
      GROUP BY response_value
    `);
    console.log('--- VOTOS OLAGER ---');
    console.table(res2.rows);

    const res3 = await pool.query(`
        SELECT id, name, party FROM candidates LIMIT 10
    `);
    console.log('--- MUESTRA CANDIDATOS ---');
    console.table(res3.rows);

  } catch (err) {
    console.error(err);
  } finally {
    pool.end();
  }
}
main();
