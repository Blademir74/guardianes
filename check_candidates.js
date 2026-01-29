require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function checkSchema() {
    try {
        const res = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'candidates'
    `);
        console.log('Columns in candidates table:');
        res.rows.forEach(row => {
            console.log(`- ${row.column_name} (${row.data_type})`);
        });

        const countRes = await pool.query('SELECT COUNT(*) FROM candidates');
        console.log(`Total candidates: ${countRes.rows[0].count}`);

        const sampleRes = await pool.query('SELECT * FROM candidates LIMIT 5');
        console.log('Sample data:', sampleRes.rows);

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await pool.end();
    }
}

checkSchema();
