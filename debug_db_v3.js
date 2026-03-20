require('dotenv').config();
const db = require('./src/db');

async function debugDB() {
    try {
        console.log('--- SURVEYS ---');
        const surveys = await db.query('SELECT id, title FROM surveys WHERE is_active = true');
        console.table(surveys.rows);

        for (const s of surveys.rows) {
            const sid = s.id;
            console.log(`\n=== SURVEY: ${s.title} (ID: ${sid}) ===`);
            
            console.log(`--- QUESTIONS ---`);
            const questions = await db.query('SELECT id, question_text, question_type FROM survey_questions WHERE survey_id = $1', [sid]);
            console.table(questions.rows);

            console.log(`--- ALL RESPONSES (Count by question_id) ---`);
            const qResp = await db.query('SELECT question_id, COUNT(*) FROM survey_responses WHERE survey_id = $1 GROUP BY question_id', [sid]);
            console.table(qResp.rows);

            console.log(`--- RESPONSE VALUES (Raw) ---`);
            const rawResp = await db.query('SELECT response_value, COUNT(*) FROM survey_responses WHERE survey_id = $1 GROUP BY response_value limit 10', [sid]);
            console.table(rawResp.rows);
        }

        console.log('\n--- CANDIDATES SAMPLE ---');
        const cand = await db.query('SELECT id, name, municipality_id, election_type FROM candidates LIMIT 10');
        console.table(cand.rows);

    } catch (e) {
        console.error('FAILED DEBUG:', e);
    }
}

debugDB().then(() => process.exit(0));
