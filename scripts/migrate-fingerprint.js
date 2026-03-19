require('dotenv').config();
const db = require('../src/db');

async function migrate() {
    console.log('Starting DB migration...');
    try {
        await db.query(`
            ALTER TABLE survey_responses 
            ADD COLUMN IF NOT EXISTS fingerprint_id VARCHAR(255);
        `);
        console.log('✅ Column fingerprint_id added to survey_responses.');

        await db.query(`
            ALTER TABLE survey_responses
            ADD COLUMN IF NOT EXISTS ip_address VARCHAR(45);
        `);
        console.log('✅ Column ip_address added to survey_responses.');

        // Add Unique Composite Index for (survey_id, fingerprint_id)
        // We use IF NOT EXISTS workaround by checking pg_class or just creating it directly in a block if needed,
        // but Postgres 9.5+ supports CREATE UNIQUE INDEX IF NOT EXISTS
        await db.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_survey_fingerprint 
            ON survey_responses(survey_id, fingerprint_id) 
            WHERE fingerprint_id IS NOT NULL;
        `);
        console.log('✅ Unique Composite Index (survey_id, fingerprint_id) added.');

    } catch (error) {
        console.error('❌ Migration failed:', error);
    } finally {
        process.exit();
    }
}

migrate();
