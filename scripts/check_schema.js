require('dotenv').config();
var { Pool } = require('pg');
var pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function checkSchema() {
    try {
        const tables = ['candidates', 'surveys', 'predictions'];
        for (const table of tables) {
            console.log(`\n--- Structure of ${table} ---`);
            const res = await pool.query(`
                SELECT column_name, data_type, is_nullable
                FROM information_schema.columns
                WHERE table_name = '${table}'
                ORDER BY ordinal_position;
            `);
            res.rows.forEach(row => {
                console.log(`${row.column_name}: ${row.data_type} (${row.is_nullable})`);
            });
        }
    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

checkSchema();
