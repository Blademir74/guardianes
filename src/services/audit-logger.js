const { query } = require('../db');

/**
 * Audit Log Service
 * Registra acciones críticas del sistema para trazabilidad (90 días)
 */
const AuditLogger = {
    /**
     * Registrar una acción de auditoría
     * @param {string} action - Nombre de la acción (ej. 'LOGIN', 'CREATE_PREDICTION')
     * @param {number|null} userId - ID del usuario (si aplica)
     * @param {string} resource - Recurso afectado (ej. 'incident:123')
     * @param {object} details - Detalles adicionales en JSON
     * @param {string} ip - Dirección IP del cliente (será hasheada)
     */
    async log(action, userId, resource, details = {}, ip = '') {
        try {
            // Hash simple de IP para privacidad pero trazabilidad
            const ipHash = ip ? require('crypto').createHash('sha256').update(ip).digest('hex').substring(0, 16) : null;

            await query(`
        INSERT INTO audit_logs (action, user_id, resource, details, ip_hash)
        VALUES ($1, $2, $3, $4, $5)
      `, [action, userId, resource, JSON.stringify(details), ipHash]);

        } catch (error) {
            console.error('❌ Audit Log Failure:', error);
            // Fall silent to not break main flow, but log to stderr
        }
    },

    /**
     * Limpiar logs antiguos (> 90 días)
     * Debe ejecutarse como cron job diario
     */
    async pruneOldLogs() {
        try {
            const result = await query(`
        DELETE FROM audit_logs 
        WHERE timestamp < NOW() - INTERVAL '90 days'
      `);
            console.log(`🧹 Pruned ${result.rowCount} old audit logs.`);
        } catch (error) {
            console.error('❌ Prune Logs Failure:', error);
        }
    }
};

module.exports = AuditLogger;
