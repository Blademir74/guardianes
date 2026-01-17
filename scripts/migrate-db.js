const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

const runMigration = async () => {
    console.log('🚀 Iniciando migración de base de datos...');

    if (!process.env.DATABASE_URL) {
        console.error('❌ Error: DATABASE_URL no está definida en .env');
        process.exit(1);
    }

    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false } // Necesario para Neon/Vercel
    });

    try {
        const client = await pool.connect();
        console.log('✅ Conectado a PostgreSQL');

        const schemaPath = path.join(__dirname, '../new-schema.sql');
        const schemaSql = fs.readFileSync(schemaPath, 'utf8');

        console.log('📜 Ejecutando script SQL...');
        await client.query(schemaSql);

        console.log('✅ Migración completada exitosamente.');
        console.log('✅ Tablas creadas y datos semilla insertados.');

        client.release();
    } catch (err) {
        console.error('❌ Error durante la migración:', err);
        process.exit(1);
    } finally {
        await pool.end();
    }
};

runMigration();
