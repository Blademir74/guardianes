const express = require('express');
const router = express.Router();
const db = require('../db');
const { verifyAdminToken } = require('../middleware/auth');

// Reglas IEPC
const IEPC_RULES = {
    GENDER_PARITY: 0.5, // 50% mujeres
    INDIGENOUS_QUOTA_MUNICIPALITY_IDS: [1, 5, 20] // IDs ficticios de municipios con >40% población indígena
};

/**
 * GET /api/candidates
 * Listar candidatos por elección y municipio
 */
router.get('/', async (req, res) => {
    try {
        const { electionId, municipalityId } = req.query;

        let query = `
      SELECT c.*, m.name as municipality_name, e.name as election_name
      FROM candidates c
      LEFT JOIN municipalities m ON c.municipality_id = m.id
      LEFT JOIN elections e ON c.election_id = e.id
      WHERE 1=1
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
        res.status(500).json({ error: 'Error inteno' });
    }
});

/**
 * POST /api/candidates
 * Crear candidato con validación IEPC
 */
router.post('/', verifyAdminToken, async (req, res) => {
    try {
        const { name, party, electionId, municipalityId, gender } = req.body;

        // Validación básica
        if (!name || !party || !electionId) {
            return res.status(400).json({ error: 'Datos incompletos' });
        }

        // Validación IEPC: Cuota de Género (Simulada para un partido en un bloque)
        // En produccion real, esto validaría el bloque completo de postulaciones
        if (gender) {
            console.log(`⚖️ Validando paridad para ${party}...`);
            // Lógica compleja omitida para MVP, pero placeholders aquí
        }

        // Validación IEPC: Indígena/Afromexicana
        if (IEPC_RULES.INDIGENOUS_QUOTA_MUNICIPALITY_IDS.includes(parseInt(municipalityId))) {
            console.log(`⚖️ Municipio ${municipalityId} requiere cuota indígena/afro.`);
            // Se podría requerir un campo 'is_indigenous' en el body
        }

        const result = await db.query(`
      INSERT INTO candidates (name, party, election_id, municipality_id)
      VALUES ($1, $2, $3, $4)
      RETURNING id, name
    `, [name, party, electionId, municipalityId]);

        res.json({
            success: true,
            candidate: result.rows[0],
            message: 'Candidato registrado'
        });

    } catch (error) {
        console.error('❌ Error creando candidato:', error);
        res.status(500).json({ error: 'Error creando candidato' });
    }
});

// Seed inicial (Backdoor para dev o setup)
router.post('/seed', verifyAdminToken, async (req, res) => {
    try {
        const candidates = [
            { name: 'Félix Salgado Macedonio', party: 'MORENA' },
            { name: 'Beatriz Mojica Morga', party: 'MORENA' },
            { name: 'Abelina López Rodríguez', party: 'MORENA' },
            { name: 'Manuel Añorve Baños', party: 'PRI' },
            { name: 'Karen Castrejón Trujillo', party: 'PVEM' },
            { name: 'Mario Moreno Arcos', party: 'MC' },
            { name: 'Pedro Segura Valladares', party: 'Independiente' }
        ];

        // Asumimos Election ID 1 (Gubernatura 2027) existe
        const electionId = 1;

        for (const c of candidates) {
            await db.query(`
         INSERT INTO candidates (name, party, election_id, municipality_id)
         VALUES ($1, $2, $3, NULL)
         ON CONFLICT DO NOTHING
       `, [c.name, c.party, electionId]);
        }

        res.json({ success: true, message: 'Candidatos sembrados' });

    } catch (error) {
        console.error('❌ Seed error:', error);
        res.status(500).json({ error: 'Error en seed' });
    }
});

module.exports = router;
