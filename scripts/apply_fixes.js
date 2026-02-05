require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function runSqlFile(filename) {
    const filePath = path.join(__dirname, filename);
    console.log(`\n📄 Reading ${filename}...`);
    const sql = fs.readFileSync(filePath, 'utf8');

    try {
        console.log(`🚀 Executing ${filename}...`);
        await pool.query(sql);
        console.log(`✅ Successfully executed ${filename}`);
    } catch (err) {
        console.error(`❌ Error executing ${filename}:`, err.message);
    }
}

async function apply() {
    try {
        await runSqlFile('restore_historical.sql');
        await runSqlFile('fix_surveys_schema.sql');
    } catch (err) {
        console.error('Test failed:', err);
    } finally {
        pool.end();
    }
}

apply();
