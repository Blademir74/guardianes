// src/routes/candidates.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const { verifyAdminToken } = require('../middleware/auth');
const iepcValidator = require('../services/iepc-validator');

// Reglas IEPC Locales (Para validaciones rápidas)
const IEPC_RULES = {
    GENDER_PARITY: 0.5,
    INDIGENOUS_QUOTA_MUNICIPALITY_IDS: [1, 5, 20]
};

/**
 * GET /api/candidates
 * Listar candidatos por elección y municipio
 */
router.get('/', async (req, res) => {
    try {
        const { electionId, municipalityId } = req.query;

        let query = `
            SELECT
                c.id,
                c.name,
                c.party,
                c.election_type,
                c.gender,
                c.photo_url,
                c.bio,
                c.is_indigenous,
                c.is_afromexican,
                m.name as municipality_name,
                e.name as election_name
            FROM candidates c
            LEFT JOIN municipalities m ON c.municipality_id = m.id
            LEFT JOIN elections e ON c.election_id = e.id
            WHERE c.is_active = true
        `;

        const params = [];
        let pIdx = 1;

        if (electionId) {
            query += ` AND c.election_id = $${pIdx++}`;
            params.push(electionId);
        }

        if (municipalityId) {
            query += ` AND c.municipality_id = $${pIdx++}`;
            params.push(municipalityId);
        }

        query += ` ORDER BY c.name ASC`;

        const result = await db.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error('❌ Error obteniendo candidatos:', error);
        res.status(500).json({ error: 'Error interno' });
    }
});

/**
 * POST /api/candidates
 * Crear candidato con validación IEPC integrada
 */
router.post('/', verifyAdminToken, async (req, res) => {
    try {
        // 1. Bloque de Validación IEPC
        const validationResult = await iepcValidator.validateCandidate(req.body);

        if (!validationResult.isValid) {
            return res.status(400).json({
                error: 'Error de validación IEPC',
                details: validationResult.errors
            });
        }

        // 2. Extraer datos del cuerpo de la petición
        const { name, party, electionId, municipalityId, gender, is_indigenous } = req.body;

        // Validación básica de nulidad
        if (!name || !party || !electionId) {
            return res.status(400).json({ error: 'Datos obligatorios faltantes: name, party o electionId' });
        }

        // 3. Lógica de Negocio Adicional (Logging de reglas)
        if (gender) {
            console.log(`⚖️ Verificando paridad para el partido ${party}...`);
        }

        if (IEPC_RULES.INDIGENOUS_QUOTA_MUNICIPALITY_IDS.includes(parseInt(municipalityId))) {
            console.log(`⚖️ El municipio ${municipalityId} está marcado con cuota indígena.`);
            if (!is_indigenous) {
                return res.status(400).json({ error: 'Este municipio requiere acreditación de cuota indígena/afro' });
            }
        }

        // 4. Inserción en Base de Datos (Neon)
        const result = await db.query(`
            INSERT INTO candidates (name, party, election_id, municipality_id)
            VALUES ($1, $2, $3, $4)
            RETURNING id, name
        `, [name, party, electionId, municipalityId]);

        res.json({
            success: true,
            candidate: result.rows[0],
            message: 'Candidato registrado exitosamente bajo normatividad IEPC'
        });

    } catch (error) {
        console.error('❌ Error en el proceso de registro de candidato:', error);
        res.status(500).json({ error: 'Error interno al procesar el registro' });
    }
});

/**
 * Seed inicial (Backdoor para dev o setup)
 */
router.post('/seed', verifyAdminToken, async (req, res) => {
    try {
        const candidates = [
            { name: 'Félix Salgado Macedonio', party: 'MORENA' },
            { name: 'Beatriz Mojica Morga', party: 'MORENA' },
            { name: 'Esthela Damian Peralta', party: 'MORENA' },
            { name: 'Abelina López Rodríguez', party: 'MORENA' },
            { name: 'Manuel Añorve Baños', party: 'PRI' },
            { name: 'Karen Castrejón Trujillo', party: 'PVEM' },
            { name: 'Mario Moreno Arcos', party: 'MC' },
            { name: 'Pedro Segura Valladares', party: 'Independiente' }
        ];

        const electionId = 1;

        for (const c of candidates) {
            await db.query(`
                INSERT INTO candidates (name, party, election_id, municipality_id)
                VALUES ($1, $2, $3, NULL)
                ON CONFLICT DO NOTHING
            `, [c.name, c.party, electionId]);
        }

        res.json({ success: true, message: 'Candidatos base sembrados correctamente' });

    } catch (error) {
        console.error('❌ Error en Seed:', error);
        res.status(500).json({ error: 'Error ejecutando el sembrado de datos' });
    }
});

module.exports = router;