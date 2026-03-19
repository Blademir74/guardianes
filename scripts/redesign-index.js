const fs = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, '../public/index.html');
let html = fs.readFileSync(indexPath, 'utf8');

// 1. Add FingerprintJS (v4 requires different load but v3 works for quick visitorId, let's use v4 CDN as requested if possible, or v3)
html = html.replace('</head>', `
    <!-- FingerprintJS -->
    <script>
      let fpPromise;
      window.onload = function() {
        if (window.requestIdleCallback) {
            requestIdleCallback(function () {
                fpPromise = loadFingerprint();
            })
        } else {
            setTimeout(function () {
                fpPromise = loadFingerprint();
            }, 500)
        }
      };
      async function loadFingerprint() {
          const fp = await import('https://openfpcdn.io/fingerprintjs/v4').then(FingerprintJS => FingerprintJS.load());
          return fp;
      }
    </script>
</head>`);

// 2. Remove tabs navigation
html = html.replace(/<div\s+class="flex overflow-x-auto gap-4 p-2 glass-card[^>]*>[\s\S]*?<\/div>/, '');

// 3. Keep tab-encuestas but remove other tabs
// Let's remove incidentes, historico, predicciones
html = html.replace(/<div id="tab-incidentes"[\s\S]*?<div id="survey-modal"/, '<div id="survey-modal"');

// 4. Remove auth-section
html = html.replace(/<section id="auth-section"[\s\S]*?<!-- PORTAL MAIN -->/, '<!-- PORTAL MAIN -->');

// 5. Remove hidden from portal-section
html = html.replace(/id="portal-section" class="hidden/, 'id="portal-section" class="');

// 6. Remove phone-gate and confidence-gate
html = html.replace(/<!-- CANDADO: TELÉFONO OBLIGATORIO -->[\s\S]*?<!-- LOGIC -->/, '<!-- LOGIC -->');

// 7. Update submitSurvey
const submitSurveyTarget = `async function submitSurvey() {`;
const newSubmitSurvey = `
        async function submitSurvey() {
            if (hasVotedInSession(currentSurveyId)) {
                return Swal.fire({
                    icon: 'warning',
                    title: 'Ya votaste en esta encuesta',
                    text: 'Solo se permite un voto por persona desde este dispositivo.',
                    confirmButtonColor: '#d97706'
                });
            }

            const inputs = document.querySelectorAll('.survey-input');
            const responses = [];

            inputs.forEach(input => {
                const qId = parseInt(input.dataset.questionId);
                const type = input.dataset.type;
                const value = input.value;
                const response = { questionId: qId, answer: value };

                if (type === 'confidence') {
                    response.confidence = parseInt(value);
                }

                responses.push(response);
            });

            Object.entries(surveyResponses).forEach(([qId, val]) => {
                const qIdInt = parseInt(qId);
                if (!responses.find(r => r.questionId === qIdInt)) {
                    responses.push({
                        questionId: qIdInt,
                        answer: val,
                        confidence: gateConfidence || null
                    });
                }
            });

            if (responses.length === 0) return showToast('Error: Responde al menos una pregunta', 'error');

            try {
                // Generar visitorId invisible
                Swal.fire({
                    title: 'Sellando Voto...',
                    text: 'Asegurando el candado de integridad criptográfica',
                    allowOutsideClick: false,
                    didOpen: () => Swal.showLoading()
                });

                let fingerprintId = null;
                if (window.fpPromise) {
                    const fp = await window.fpPromise;
                    const result = await fp.get();
                    fingerprintId = result.visitorId;
                }

                const res = await fetch(\`\${API_URL}/surveys/\${currentSurveyId}/response\`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ responses, fingerprintId })
                });

                const data = await res.json();
                Swal.close();

                if (res.status === 409) {
                    markVotedInSession(currentSurveyId, fingerprintId);
                    return Swal.fire({
                        icon: 'warning',
                        title: 'Ya registraste tu voto',
                        text: data.error || 'Solo se permite un voto por persona en esta encuesta.',
                        confirmButtonColor: '#d97706'
                    });
                }

                if (res.ok) {
                    markVotedInSession(currentSurveyId, fingerprintId);
                    showToast('✅ Sello Digital Verificado: +50 PTS', 'success');

                    if (data.pointsEarned) {
                        const ptsEl = document.getElementById('user-points');
                        if (ptsEl) {
                            const current = parseInt(ptsEl.textContent.replace(/[^\\d]/g, '')) || 0;
                            ptsEl.textContent = \`\${current + data.pointsEarned} PTS de Influencia\`;
                        }
                    }

                    closeSurvey();
                    loadSurveys();
                } else {
                    showToast('❌ Error: ' + (data.error || 'Falla en el envío'), 'error');
                }

            } catch (e) {
                Swal.close();
                console.error('Error en submitSurvey:', e);
                showToast('Fallo de Red: ' + e.message, 'error');
            }
        }
`;
html = html.replace(/async function submitSurvey\(\) \{[\s\S]*?\/\/\/ --- INCIDENTS ---/m, newSubmitSurvey + "\n        // --- INCIDENTS ---");

// Simplify showPortal
const showPortalTarget = `async function showPortal() {`;
const newShowPortal = `
        async function showPortal() {
            document.getElementById('portal-section').classList.remove('hidden');
            document.getElementById('user-info').classList.remove('hidden');
            loadSurveys();
            populateMunicipios();
        }
`;
html = html.replace(/async function showPortal\(\) \{[\s\S]*?\/\/ --- DASHBOARD ---/, newShowPortal + '\n        // --- DASHBOARD ---');

// Replace document.addEventListener DOMContentLoaded
html = html.replace(/document\.addEventListener\('DOMContentLoaded', async function \(\) \{[\s\S]*?\/\/ ============================================/g, 
\`document.addEventListener('DOMContentLoaded', async function () {
            console.log('🚀 Inicializando Sistema Guerrero Guardianes (Prestige Edition)');
            showPortal();
        });
        // ============================================\`);

fs.writeFileSync(indexPath, html);
console.log('index.html redesigned successfully.');
