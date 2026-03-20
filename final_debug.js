require('dotenv').config();
const db = require('./src/db');

async function debug() {
    try {
        const surveyId = 1; // Probablemente el ID de la encuesta de Taxco
        
        console.log('--- SURVEY INFO ---');
        const s = await db.query('SELECT * FROM surveys WHERE id = $1', [surveyId]);
        console.table(s.rows);

        console.log('--- QUESTIONS ---');
        const q = await db.query('SELECT * FROM survey_questions WHERE survey_id = $1', [surveyId]);
        console.table(q.rows);

        console.log('--- CANDIDATES ---');
        const c = await db.query('SELECT id, name FROM candidates LIMIT 20');
        console.table(c.rows);

        console.log('--- RESPONSES ---');
        const r = await db.query('SELECT DISTINCT response_value, COUNT(*) FROM survey_responses WHERE survey_id = $1 GROUP BY response_value', [surveyId]);
        console.table(r.rows);

    } catch (e) {
        console.error(e);
    }
}

debug().then(() => process.exit(0));
