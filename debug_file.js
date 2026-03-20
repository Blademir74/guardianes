require('dotenv').config();
const db = require('./src/db');
const fs = require('fs');

async function debug() {
    let output = '';
    const log = (msg) => { output += msg + '\n'; console.log(msg); };

    try {
        log('--- ACTIVE SURVEYS ---');
        const surveys = await db.query('SELECT id, title, election_type, municipality_id FROM surveys WHERE is_active = true');
        output += JSON.stringify(surveys.rows, null, 2) + '\n';

        if (surveys.rows.length > 0) {
            const sid = surveys.rows[0].id;
            const mid = surveys.rows[0].municipality_id;
            log(`\n--- CANDIDATES FOR MUN ${mid} ---`);
            const cand = await db.query('SELECT id, name, party FROM candidates WHERE municipality_id = $1 OR municipality_id IS NULL LIMIT 20', [mid]);
            output += JSON.stringify(cand.rows, null, 2) + '\n';

            log(`\n--- RESPONSES FOR SURVEY ${sid} ---`);
            const resp = await db.query('SELECT response_value, COUNT(*) FROM survey_responses WHERE survey_id = $1 GROUP BY response_value', [sid]);
            output += JSON.stringify(resp.rows, null, 2) + '\n';
        }
    } catch (e) {
        log('ERROR: ' + e.message);
    }
    
    fs.writeFileSync('db_debug_result.txt', output);
}

debug().then(() => process.exit(0));
