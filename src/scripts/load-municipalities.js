const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { Pool } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const GUERRERO_MUNICIPALITIES = [
    { id: 1, name: 'Acapulco de Juárez' },
    { id: 2, name: 'Acatepec' },
    { id: 3, name: 'Ajuchitlán del Progreso' },
    { id: 4, name: 'Alcozauca de Guerrero' },
    { id: 5, name: 'Alpoyeca' },
    { id: 6, name: 'Apaxtla' },
    { id: 7, name: 'Arcelia' },
    { id: 8, name: 'Atenango del Río' },
    { id: 9, name: 'Atlamajalcingo del Monte' },
    { id: 10, name: 'Atlixtac' },
    { id: 11, name: 'Atoyac de Álvarez' },
    { id: 12, name: 'Ayutla de los Libres' },
    { id: 13, name: 'Azoyú' },
    { id: 14, name: 'Benito Juárez' },
    { id: 15, name: 'Buenavista de Cuéllar' },
    { id: 16, name: 'Coahuayutla de José María Izazaga' },
    { id: 17, name: 'Cocula' },
    { id: 18, name: 'Copala' },
    { id: 19, name: 'Copalillo' },
    { id: 20, name: 'Copanatoyac' },
    { id: 21, name: 'Coyuca de Benítez' },
    { id: 22, name: 'Coyuca de Catalán' },
    { id: 23, name: 'Cuajinicuilapa' },
    { id: 24, name: 'Cualác' },
    { id: 25, name: 'Cuautepec' },
    { id: 26, name: 'Cuetzala del Progreso' },
    { id: 27, name: 'Cutzamala de Pinzón' },
    { id: 28, name: 'Chilapa de Álvarez' },
    { id: 29, name: 'Chilpancingo de los Bravo' },
    { id: 30, name: 'Florencio Villarreal' },
    { id: 31, name: 'General Canuto A. Neri' },
    { id: 32, name: 'General Heliodoro Castillo' },
    { id: 33, name: 'Huamuxtitlán' },
    { id: 34, name: 'Huitzuco de los Figueroa' },
    { id: 35, name: 'Iguala de la Independencia' },
    { id: 36, name: 'Igualapa' },
    { id: 37, name: 'Ixcateopan de Cuauhtémoc' },
    { id: 38, name: 'Zihuatanejo de Azueta' },
    { id: 39, name: 'Juan R. Escudero' },
    { id: 40, name: 'Leonardo Bravo' },
    { id: 41, name: 'Malinaltepec' },
    { id: 42, name: 'Mártir de Cuilapan' },
    { id: 43, name: 'Metlatónoc' },
    { id: 44, name: 'Mochitlán' },
    { id: 45, name: 'Olinalá' },
    { id: 46, name: 'Ometepec' },
    { id: 47, name: 'Pedro Ascencio Alquisiras' },
    { id: 48, name: 'Petatlán' },
    { id: 49, name: 'Pilcaya' },
    { id: 50, name: 'Pungarabato' },
    { id: 51, name: 'Quechultenango' },
    { id: 52, name: 'San Luis Acatlán' },
    { id: 53, name: 'San Marcos' },
    { id: 54, name: 'San Miguel Totolapan' },
    { id: 55, name: 'Taxco de Alarcón' },
    { id: 56, name: 'Tecoanapa' },
    { id: 57, name: 'Técpan de Galeana' },
    { id: 58, name: 'Teloloapan' },
    { id: 59, name: 'Tepecoacuilco de Trujano' },
    { id: 60, name: 'Tetipac' },
    { id: 61, name: 'Tixtla de Guerrero' },
    { id: 62, name: 'Tlacoachistlahuaca' },
    { id: 63, name: 'Tlacoapa' },
    { id: 64, name: 'Tlalchapa' },
    { id: 65, name: 'Tlalixtaquilla de Maldonado' },
    { id: 66, name: 'Tlapa de Comonfort' },
    { id: 67, name: 'Tlapehuala' },
    { id: 68, name: 'La Unión de Isidoro Montes de Oca' },
    { id: 69, name: 'Xalpatláhuac' },
    { id: 70, name: 'Xochihuehuetlán' },
    { id: 71, name: 'Xochistlahuaca' },
    { id: 72, name: 'Zapotitlán Tablas' },
    { id: 73, name: 'Zirándaro' },
    { id: 74, name: 'Zitlala' },
    { id: 75, name: 'Eduardo Neri' },
    { id: 76, name: 'Acatepec' },
    { id: 77, name: 'Marquelia' },
    { id: 78, name: 'Cochoapa el Grande' },
    { id: 79, name: 'José Joaquín de Herrera' },
    { id: 80, name: 'Juchitán' },
    { id: 81, name: 'Iliatenco' },
    { id: 82, name: 'Las Vigas' },
    { id: 83, name: 'Ñuu Savi' },
    { id: 84, name: 'Santa Cruz del Rincón' },
    { id: 85, name: 'San Nicolás' }
];

async function seedMunicipalities() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Create table if not exists
        await client.query(`
      CREATE TABLE IF NOT EXISTS municipalities (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        region VARCHAR(100),
        total_voters INTEGER DEFAULT 0,
        latitude DECIMAL(10, 8),
        longitude DECIMAL(11, 8)
      );
    `);

        // Upsert municipalities
        for (const muni of GUERRERO_MUNICIPALITIES) {
            await client.query(`
        INSERT INTO municipalities (id, name)
        VALUES ($1, $2)
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
      `, [muni.id, muni.name]);
        }

        await client.query('COMMIT');
        console.log('✅ 85 Municipalities seeded successfully');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error seeding municipalities:', err);
    } finally {
        client.release();
        pool.end();
    }
}

seedMunicipalities();
