/**
 * public/js/sanitize.js — Módulo de Sanitización XSS Global
 * Estándar de Oro — Guardianes Guerrero
 *
 * Importar en index.html y admin.html con:
 *   <script src="/js/sanitize.js"></script>
 *
 * La función queda disponible como window.sanitizeHTML(str)
 *
 * Mecanismo: convierte el string en textContent de un nodo temporal.
 * El navegador escapa los caracteres HTML peligrosos sin ejecutar ningún script.
 * Resultado: string con entidades HTML seguras para insertar en innerHTML.
 */

(function (global) {
    'use strict';

    /**
     * sanitizeHTML(str)
     * Convierte cualquier string a texto seguro para inyección en innerHTML.
     * Escapa: < > & " ' / y cualquier caracter que el navegador interprete como HTML.
     *
     * @param  {*}      str  - Valor a sanitizar (se convierte a string si no lo es)
     * @returns {string}     - String con entidades HTML escapadas
     *
     * Ejemplos:
     *   sanitizeHTML('<script>alert(1)</script>')  → '&lt;script&gt;alert(1)&lt;/script&gt;'
     *   sanitizeHTML('Juan & María')               → 'Juan &amp; María'
     *   sanitizeHTML(null)                         → ''
     *   sanitizeHTML(42)                           → '42'
     */
    function sanitizeHTML(str) {
        if (str === null || str === undefined) return '';
        const temp = document.createElement('div');
        temp.textContent = String(str);
        return temp.innerHTML;
    }

    /**
     * sanitizeAttr(str)
     * Para uso en atributos HTML (href, src, data-*, etc.)
     * Más restrictivo que sanitizeHTML.
     *
     * @param  {*}      str
     * @returns {string}
     */
    function sanitizeAttr(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g,  '&amp;')
            .replace(/"/g,  '&quot;')
            .replace(/'/g,  '&#x27;')
            .replace(/</g,  '&lt;')
            .replace(/>/g,  '&gt;')
            .replace(/\//g, '&#x2F;');
    }

    // Exponer globalmente
    global.sanitizeHTML = sanitizeHTML;
    global.sanitizeAttr = sanitizeAttr;

})(window);
