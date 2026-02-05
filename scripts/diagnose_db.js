require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function diagnose() {
    try {
        console.log('🔍 Starting Database Diagnosis...');

        // 1. Check historical_results
        try {
            const res = await pool.query('SELECT COUNT(*) FROM historical_results');
            console.log(`✅ historical_results table exists. Count: ${res.rows[0].count}`);
        } catch (err) {
            console.error('❌ historical_results table MISSING or error:', err.message);
        }

        // 2. Check surveys columns
        try {
            const res = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'surveys'
      `);
            const columns = res.rows.map(r => r.column_name);
            console.log('📊 Surveys table columns:', columns.join(', '));

            if (!columns.includes('municipality_id')) {
                console.error('❌ CRITICAL: municipality_id column MISSING in surveys table');
            } else {
                console.log('✅ municipality_id column exists in surveys');
            }
        } catch (err) {
            console.error('❌ Error checking surveys schema:', err.message);
        }

        // 3. Check Candidates Images
        try {
            const res = await pool.query('SELECT id, name, photo_url FROM candidates LIMIT 5');
            console.log('🖼️  Sample Candidate Images:');
            res.rows.forEach(r => {
                console.log(`   - ${r.name}: ${r.photo_url}`);
            });
        } catch (err) {
            console.error('❌ Error checking candidates:', err.message);
        }

    } catch (err) {
        console.error('diagnosis failed:', err);
    } finally {
        pool.end();
    }
}

diagnose();
