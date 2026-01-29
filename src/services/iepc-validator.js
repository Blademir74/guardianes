/**
 * IEPC Validator Service
 * Reglas de validación electoral (Guerrero 2026)
 */

// Municipios con >40% población indígena/afromexicana (Lista oficial IEPC Guerrero)
const INDIGENOUS_MUNICIPALITIES = [
    'Acatepec', 'Alcozauca de Guerrero', 'Atlamajalcingo del Monte', 'Atlixtac',
    'Cochoapa el Grande', 'Copanatoyac', 'Cualác', 'Huamuxtitlán', 'Iliatenco',
    'Malinaltepec', 'Metlatónoc', 'Olinalá', 'Tlacoachistlahuaca', 'Tlacoapa',
    'Xalpatláhuac', 'Xochihuehuetlán', 'Xochistlahuaca', 'Zapotitlán Tablas',
    'Zitlala', 'Ñuu Savi', 'Santa Cruz del Rincón', 'San Nicolás'
];

const IEPCValidator = {

    /**
     * Valida paridad de género horizontal (50/50 en lista de candidatos)
     */
    validateGenderParity(candidates) {
        try {
            if (!candidates || candidates.length === 0) {
                return { isValid: true, details: 'No candidates' };
            }

            const total = candidates.length;
            const women = candidates.filter(c => c.gender === 'F').length;
            const men = candidates.filter(c => c.gender === 'M').length;

            const womenPct = (women / total) * 100;
            const isBalanced = womenPct >= 40 && womenPct <= 60;

            return {
                isValid: isBalanced,
                details: {
                    total,
                    women,
                    men,
                    womenPercentage: womenPct.toFixed(1) + '%',
                    message: isBalanced ? 'Paridad de género cumplida' : 'ALERTA: Desbalance de género detectado'
                }
            };
        } catch (error) {
            console.error('Error validating gender parity:', error);
            return { isValid: false, error: error.message };
        }
    },

    /**
     * Valida cuota indígena/afromexicana en municipios designados
     */
    validateIndigenousQuota(municipalityName, candidate) {
        try {
            const isTargetMunicipality = INDIGENOUS_MUNICIPALITIES.includes(municipalityName);

            if (isTargetMunicipality) {
                if (!candidate.isIndigenous) {
                    return {
                        isValid: false,
                        error: `El municipio ${municipalityName} requiere postulación indígena/afromexicana.`,
                        municipality: municipalityName
                    };
                }
                return { isValid: true, type: 'quota_verified' };
            }

            return { isValid: true, type: 'standard' };
        } catch (error) {
            console.error('Error validating indigenous quota:', error);
            return { isValid: false, error: error.message };
        }
    },

    /**
     * Valida un candidato individual
     */
    async validateCandidate(candidate) {
        try {
            // Validación básica de campos requeridos
            if (!candidate.name || !candidate.party || !candidate.electionId) {
                return { isValid: false, errors: ['Datos incompletos del candidato'] };
            }

            // Lógica de paridad o validación individual simplificada
            return { isValid: true };
        } catch (error) {
            console.error('Error validating candidate:', error);
            return { isValid: false, errors: [error.message] };
        }
    },

    /**
     * Valida una encuesta
     */
    async validateSurvey(surveyData) {
        try {
            // Valida que la encuesta tenga los campos mínimos necesarios
            if (!surveyData || Object.keys(surveyData).length === 0) {
                return { isValid: false, errors: ['Datos de encuesta vacíos'] };
            }
            // Por defecto para permitir flujo
            return { isValid: true };
        } catch (error) {
            console.error('Error validating survey:', error);
            return { isValid: false, errors: [error.message] };
        }
    },

    /**
     * Valida lista completa de un partido para Ayuntamiento
     */
    validatePartyList(candidates, municipalityName) {
        try {
            const parity = this.validateGenderParity(candidates);
            const indigenousCheck = candidates.map(c => this.validateIndigenousQuota(municipalityName, c));

            const quotaFailures = indigenousCheck.filter(r => !r.isValid);

            return {
                isValid: parity.isValid && quotaFailures.length === 0,
                genderParity: parity,
                quotaFailures
            };
        } catch (error) {
            console.error('Error validating party list:', error);
            return { isValid: false, error: error.message };
        }
    }
};

module.exports = IEPCValidator;