// public/js/portal.js
// ... (función apiCall de la versión anterior) ...

async function loadSurveys() {
    const container = document.getElementById('surveys-container');
    try {
        const surveys = await apiCall('/public/surveys');
        container.innerHTML = '';
        if (surveys.length === 0) { container.innerHTML = '<p class="text-center">No hay encuestas activas.</p>'; return; }

        surveys.forEach(survey => {
            const surveyEl = document.createElement('div');
            surveyEl.className = 'bg-white p-6 rounded-lg shadow-lg mb-8';
            surveyEl.innerHTML = `
                <h2 class="text-2xl font-bold mb-2">${survey.title}</h2>
                <p class="text-gray-600 mb-4">${survey.description}</p>
                <div id="options-${survey.id}" class="space-y-3"></div>
                <div class="mt-4">
                    <label for="confidence-${survey.id}" class="block text-sm font-medium text-gray-700">¿Qué tan seguro estás de tu elección?</label>
                    <input type="range" id="confidence-${survey.id}" name="confidence" min="50" max="100" step="25" value="75" class="w-full" oninput="updateConfidenceLabel(this.value, ${survey.id})">
                    <div class="flex justify-between text-xs text-gray-500">
                        <span>Dudoso (50%)</span>
                        <span id="confidence-label-${survey.id}">Probable (75%)</span>
                        <span>Seguro (100%)</span>
                    </div>
                </div>
                <button onclick="submitVote(${survey.id})" class="mt-6 w-full bg-gold-accent text-guardian-blue font-bold py-3 px-4 rounded-md hover:bg-yellow-400">Enviar Voto</button>
                <div class="mt-6">
                    <h3 class="text-lg font-semibold mb-2">Resultados en Vivo</h3>
                    <canvas id="results-chart-${survey.id}" width="400" height="200"></canvas>
                </div>
            `;
            container.appendChild(surveyEl);
            loadSurveyOptions(survey.id);
            loadSurveyResults(survey.id);
        });
    } catch (error) { /* ... manejo de errores ... */ }
}

function updateConfidenceLabel(value, surveyId) {
    const label = document.getElementById(`confidence-label-${surveyId}`);
    if (value == 50) label.textContent = 'Dudoso (50%)';
    else if (value == 75) label.textContent = 'Probable (75%)';
    else if (value == 100) label.textContent = 'Seguro (100%)';
}

async function loadSurveyResults(surveyId) {
    try {
        const results = await apiCall(`/public/surveys/${surveyId}/results`);
        const ctx = document.getElementById(`results-chart-${surveyId}`).getContext('2d');
        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: results.map(r => r.option_text),
                datasets: [{
                    label: 'Votos',
                    data: results.map(r => r.vote_count),
                    backgroundColor: 'rgba(10, 46, 90, 0.6)',
                    borderColor: 'rgba(10, 46, 90, 1)',
                    borderWidth: 1
                }]
            },
            options: { scales: { y: { beginAtZero: true } } }
        });
    } catch (error) { /* ... manejo de errores ... */ }
}

async function submitVote(surveyId) {
    // ... (lógica para enviar el voto, incluyendo el valor del slider de confianza) ...
}