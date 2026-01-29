const app = require('./api/index.js');
const listEndpoints = require('express-list-endpoints');

console.log('🔍 Inspecting Registered Routes...\n');

try {
    const endpoints = listEndpoints(app);

    // Agrupar por path base
    const groups = {};
    endpoints.forEach(e => {
        const base = e.path.split('/')[2] || 'root';
        if (!groups[base]) groups[base] = [];
        groups[base].push(`${e.methods.join(',')} ${e.path}`);
    });

    console.log('✅ Routes by Module:');
    Object.keys(groups).sort().forEach(base => {
        console.log(`\n📦 ${base.toUpperCase()}`);
        groups[base].forEach(r => console.log(`  - ${r}`));
    });

} catch (err) {
    console.error('❌ Error inspecting routes. Ensure dependencies are installed (express-list-endpoints).');
    console.log('Run: npm install express-list-endpoints');
}
