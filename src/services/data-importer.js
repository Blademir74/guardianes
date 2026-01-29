const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { Pool } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

class DataImporter {
    constructor() {
        this.pool = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
        });
    }

    async initialize() {
        try {
            await this.createTablesIfNotExist();
            console.log('✅ Base de datos inicializada correctamente');
        } catch (error) {
            console.error('❌ Error inicializando base de datos:', error);
            throw error;
        }
    }

    async createTablesIfNotExist() {
        const queries = [
            `CREATE TABLE IF NOT EXISTS electorado_seccional (
                id SERIAL PRIMARY KEY,
                distrito_federal INTEGER,
                clave_municipio INTEGER,
                nombre_municipio VARCHAR(255),
                seccion VARCHAR(50),
                lista_nominal_total INTEGER DEFAULT 0,
                hombres_ln INTEGER DEFAULT 0,
                mujeres_ln INTEGER DEFAULT 0,
                hombres_18 INTEGER DEFAULT 0,
                mujeres_18 INTEGER DEFAULT 0,
                hombres_19 INTEGER DEFAULT 0,
                mujeres_19 INTEGER DEFAULT 0,
                hombres_20_24 INTEGER DEFAULT 0,
                mujeres_20_24 INTEGER DEFAULT 0,
                hombres_25_29 INTEGER DEFAULT 0,
                mujeres_25_29 INTEGER DEFAULT 0,
                hombres_30_34 INTEGER DEFAULT 0,
                mujeres_30_34 INTEGER DEFAULT 0,
                hombres_35_39 INTEGER DEFAULT 0,
                mujeres_35_39 INTEGER DEFAULT 0,
                hombres_40_44 INTEGER DEFAULT 0,
                mujeres_40_44 INTEGER DEFAULT 0,
                hombres_45_49 INTEGER DEFAULT 0,
                mujeres_45_49 INTEGER DEFAULT 0,
                hombres_50_54 INTEGER DEFAULT 0,
                mujeres_50_54 INTEGER DEFAULT 0,
                hombres_55_59 INTEGER DEFAULT 0,
                mujeres_55_59 INTEGER DEFAULT 0,
                hombres_60_64 INTEGER DEFAULT 0,
                mujeres_60_64 INTEGER DEFAULT 0,
                hombres_65_mas INTEGER DEFAULT 0,
                mujeres_65_mas INTEGER DEFAULT 0
            )`,

            `CREATE TABLE IF NOT EXISTS resultados_electorales (
                id SERIAL PRIMARY KEY,
                anio INTEGER NOT NULL,
                tipo_eleccion VARCHAR(50) NOT NULL,
                distrito_local INTEGER,
                ambito_nombre VARCHAR(255) NOT NULL,
                votos_pan INTEGER DEFAULT 0,
                votos_pri INTEGER DEFAULT 0,
                votos_prd INTEGER DEFAULT 0,
                votos_pvem INTEGER DEFAULT 0,
                votos_pt INTEGER DEFAULT 0,
                votos_mc INTEGER DEFAULT 0,
                votos_na INTEGER DEFAULT 0,
                votos_morena INTEGER DEFAULT 0,
                votos_validos INTEGER DEFAULT 0,
                votos_nulos INTEGER DEFAULT 0,
                total_votos INTEGER DEFAULT 0,
                lista_nominal INTEGER DEFAULT 0
            )`,

            `CREATE INDEX IF NOT EXISTS idx_resultados_anio_tipo ON resultados_electorales(anio, tipo_eleccion)`,
            `CREATE INDEX IF NOT EXISTS idx_resultados_ambito ON resultados_electorales(ambito_nombre)`,
            `CREATE INDEX IF NOT EXISTS idx_electorado_municipio ON electorado_seccional(clave_municipio)`,
            `CREATE INDEX IF NOT EXISTS idx_electorado_seccion ON electorado_seccional(seccion)`
        ];

        for (const query of queries) {
            await this.pool.query(query);
        }
    }

    async importElectoralData() {
        const filePath = path.join(__dirname, '../../INE_limpio.csv');

        if (!fs.existsSync(filePath)) {
            throw new Error(`Archivo INE_limpio.csv no encontrado en ${filePath}`);
        }

        console.log('🚀 Iniciando carga de datos electorales desde INE_limpio.csv...');

        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');

            // Limpiar tabla existente
            await client.query('TRUNCATE TABLE electorado_seccional RESTART IDENTITY CASCADE');

            let processedRows = 0;
            let errorRows = 0;

            await new Promise((resolve, reject) => {
                fs.createReadStream(filePath)
                    .pipe(csv())
                    .on('data', async (row) => {
                        try {
                            if (!row['SECCION'] || row['SECCION'].trim() === '') {
                                console.warn(`⚠️ Fila omitida: sección vacía`);
                                errorRows++;
                                return;
                            }

                            const query = `
                                INSERT INTO electorado_seccional(
                                    distrito_federal, clave_municipio, nombre_municipio, seccion,
                                    lista_nominal_total, hombres_ln, mujeres_ln,
                                    hombres_18, mujeres_18, hombres_19, mujeres_19,
                                    hombres_20_24, mujeres_20_24, hombres_25_29, mujeres_25_29,
                                    hombres_30_34, mujeres_30_34, hombres_35_39, mujeres_35_39,
                                    hombres_40_44, mujeres_40_44, hombres_45_49, mujeres_45_49,
                                    hombres_50_54, mujeres_50_54, hombres_55_59, mujeres_55_59,
                                    hombres_60_64, mujeres_60_64, hombres_65_mas, mujeres_65_mas
                                ) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31)
                            `;

                            const values = [
                                this.safeParseInt(row['DISTRITO FEDERAL']),
                                this.safeParseInt(row['CLAVE MUNICIPIO']),
                                row['NOMBRE MUNICIPIO'] || '',
                                row['SECCION'].trim(),
                                this.safeParseInt(row['LISTA NOMINAL']),
                                this.safeParseInt(row['LISTA HOMBRES']),
                                this.safeParseInt(row['LISTA MUJERES']),
                                this.safeParseInt(row['LISTA_18_HOMBRES']), this.safeParseInt(row['LISTA_18_MUJERES']),
                                this.safeParseInt(row['LISTA_19_HOMBRES']), this.safeParseInt(row['LISTA_19_MUJERES']),
                                this.safeParseInt(row['LISTA_20_24_HOMBRES']), this.safeParseInt(row['LISTA_20_24_MUJERES']),
                                this.safeParseInt(row['LISTA_25_29_HOMBRES']), this.safeParseInt(row['LISTA_25_29_MUJERES']),
                                this.safeParseInt(row['LISTA_30_34_HOMBRES']), this.safeParseInt(row['LISTA_30_34_MUJERES']),
                                this.safeParseInt(row['LISTA_35_39_HOMBRES']), this.safeParseInt(row['LISTA_35_39_MUJERES']),
                                this.safeParseInt(row['LISTA_40_44_HOMBRES']), this.safeParseInt(row['LISTA_40_44_MUJERES']),
                                this.safeParseInt(row['LISTA_45_49_HOMBRES']), this.safeParseInt(row['LISTA_45_49_MUJERES']),
                                this.safeParseInt(row['LISTA_50_54_HOMBRES']), this.safeParseInt(row['LISTA_50_54_MUJERES']),
                                this.safeParseInt(row['LISTA_55_59_HOMBRES']), this.safeParseInt(row['LISTA_55_59_MUJERES']),
                                this.safeParseInt(row['LISTA_60_64_HOMBRES']), this.safeParseInt(row['LISTA_60_64_MUJERES']),
                                this.safeParseInt(row['LISTA_65_Y_MAS_HOMBRES']), this.safeParseInt(row['LISTA_65_Y_MAS_MUJERES'])
                            ];

                            await client.query(query, values);
                            processedRows++;
                        } catch (err) {
                            console.error(`❌ Error procesando fila:`, err.message);
                            errorRows++;
                        }
                    })
                    .on('end', async () => {
                        try {
                            await client.query('COMMIT');
                            console.log(`✅ Carga de electorado completada: ${processedRows} filas procesadas, ${errorRows} errores`);
                            resolve();
                        } catch (err) {
                            await client.query('ROLLBACK');
                            reject(err);
                        }
                    })
                    .on('error', async (err) => {
                        await client.query('ROLLBACK');
                        reject(err);
                    });
            });

        } finally {
            client.release();
        }
    }

    async importHistoricalData() {
        const historicoPath = path.join(__dirname, '../../Historico votaciones');

        if (!fs.existsSync(historicoPath)) {
            throw new Error(`Carpeta 'Historico votaciones' no encontrada en ${historicoPath}`);
        }

        console.log('🚀 Iniciando carga de datos históricos...');

        const archivos = fs.readdirSync(historicoPath).filter(f => f.endsWith('.csv'));

        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');

            // Limpiar tabla existente
            await client.query('TRUNCATE TABLE resultados_electorales RESTART IDENTITY CASCADE');

            let totalProcessed = 0;

            for (const archivo of archivos) {
                console.log(`📄 Procesando archivo: ${archivo}`);
                const filePath = path.join(historicoPath, archivo);

                const anio = parseInt(archivo.match(/\d{4}/)?.[0]);
                if (!anio) {
                    console.warn(`⚠️ No se pudo extraer año de ${archivo}, omitiendo...`);
                    continue;
                }

                let tipoEleccion = 'Desconocido';
                if (archivo.includes('ayuntamiento')) tipoEleccion = 'Ayuntamiento';
                else if (archivo.includes('diputacionlocal')) tipoEleccion = 'Diputación Local';
                else if (archivo.includes('gobernatura')) tipoEleccion = 'Gubernatura';

                await new Promise((resolve, reject) => {
                    const results = {};

                    fs.createReadStream(filePath)
                        .pipe(csv())
                        .on('data', (row) => {
                            try {
                                const municipio = (row['MUNICIPIO'] || row['municipio'] || '').trim().toUpperCase();
                                if (!municipio) return;

                                if (!results[municipio]) {
                                    results[municipio] = {
                                        pan: 0, pri: 0, prd: 0, pvem: 0, pt: 0, mc: 0, na: 0, morena: 0,
                                        validos: 0, nulos: 0, total: 0, lista: 0
                                    };
                                }

                                const p = (val) => this.safeParseInt(val);

                                results[municipio].pan += p(row['PAN'] || row['pan']);
                                results[municipio].pri += p(row['PRI'] || row['pri']);
                                results[municipio].prd += p(row['PRD'] || row['prd']);
                                results[municipio].pvem += p(row['PVEM'] || row['pvem']);
                                results[municipio].pt += p(row['PT'] || row['pt']);
                                results[municipio].mc += p(row['MC'] || row['mc']);
                                results[municipio].na += p(row['NA'] || row['na'] || row['NUEVA ALIANZA']);
                                results[municipio].morena += p(row['MORENA'] || row['morena']);
                                results[municipio].validos += p(row['VOTOS VALIDOS'] || row['VOTOS_VALIDOS']);
                                results[municipio].nulos += p(row['VOTOS NULOS'] || row['VOTOS_NULOS']);
                                results[municipio].total += p(row['TOTAL VOTOS'] || row['TOTAL_VOTOS']);
                                results[municipio].lista += p(row['LISTA NOMINAL'] || row['LISTA_NOMINAL']);
                            } catch (err) {
                                console.error(`❌ Error procesando fila en ${archivo}:`, err.message);
                            }
                        })
                        .on('end', async () => {
                            try {
                                // Insertar datos agregados por municipio
                                for (const [municipio, data] of Object.entries(results)) {
                                    await client.query(`
                                        INSERT INTO resultados_electorales (
                                            anio, tipo_eleccion, ambito_nombre,
                                            votos_pan, votos_pri, votos_prd, votos_pvem, votos_pt, votos_mc, votos_na, votos_morena,
                                            votos_validos, votos_nulos, total_votos, lista_nominal
                                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
                                    `, [
                                        anio, tipoEleccion, municipio,
                                        data.pan, data.pri, data.prd, data.pvem, data.pt, data.mc, data.na, data.morena,
                                        data.validos, data.nulos, data.total, data.lista
                                    ]);
                                }

                                const processed = Object.keys(results).length;
                                console.log(`✅ ${archivo}: ${processed} municipios procesados`);
                                totalProcessed += processed;
                                resolve();
                            } catch (err) {
                                reject(err);
                            }
                        })
                        .on('error', (err) => {
                            reject(err);
                        });
                });
            }

            await client.query('COMMIT');
            console.log(`🎉 Carga histórica completada: ${totalProcessed} registros procesados`);

        } catch (err) {
            await client.query('ROLLBACK');
            console.error('❌ Error en carga histórica:', err);
            throw err;
        } finally {
            client.release();
        }
    }

    safeParseInt(value) {
        const parsed = parseInt(value, 10);
        return isNaN(parsed) ? 0 : parsed;
    }

    async close() {
        await this.pool.end();
    }

    async importAllData() {
        try {
            console.log('🔄 Iniciando importación completa de datos...');

            await this.initialize();
            await this.importElectoralData();
            await this.importHistoricalData();

            console.log('🎉 ¡Importación completa exitosa!');

        } catch (error) {
            console.error('💥 Error en importación completa:', error);
            throw error;
        } finally {
            await this.close();
        }
    }
}

module.exports = DataImporter;