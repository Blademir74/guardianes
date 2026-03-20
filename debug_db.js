const { Client } = require('pg');
const dotenv = require('dotenv');
dotenv.config();

async function debugDB() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/guardianes'
    });
    await client.connect();
    
    console.log('--- 10 EJEMPLOS DE RESPUESTAS ---');
    const res = await client.query('SELECT response_value, COUNT(*) FROM survey_responses GROUP BY response_value LIMIT 20');
    console.table(res.rows);

    console.log('--- CANDIDATOS ---');
    const cand = await client.query('SELECT id, name FROM candidates LIMIT 10');
    console.table(cand.rows);

    await client.end();
}

debugDB().catch(console.error);
