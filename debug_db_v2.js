const { Client } = require('pg');
const dotenv = require('dotenv');
dotenv.config();

async function debugDB() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });
    await client.connect();
    
    console.log('--- SURVAYS ---');
    const surveys = await client.query('SELECT id, title FROM surveys WHERE is_active = true');
    console.table(surveys.rows);

    if (surveys.rows.length > 0) {
        const sid = surveys.rows[0].id;
        console.log(`--- QUESTIONS FOR SURVEY ${sid} ---`);
        const questions = await client.query('SELECT id, question_text, question_type FROM survey_questions WHERE survey_id = $1', [sid]);
        console.table(questions.rows);

        console.log(`--- RESPONSE VALUES FOR SURVEY ${sid} ---`);
        const responses = await client.query('SELECT response_value, COUNT(*) FROM survey_responses WHERE survey_id = $1 GROUP BY response_value', [sid]);
        console.table(responses.rows);
        
        console.log(`--- CANDIDATES FOR SURVEY ${sid} ---`);
        // We need to know context (municipality/election_type) but let's just see some
        const candidates = await client.query('SELECT id, name FROM candidates LIMIT 20');
        console.table(candidates.rows);
    }

    await client.end();
}

debugDB().catch(console.error);
