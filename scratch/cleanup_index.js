const fs = require('fs');
const path = 'public/index.html';
let content = fs.readFileSync(path, 'utf8');

// Find the duplicate block and remove it
// It starts after the first Case 1 block which ends with "        }" (at line 1141)
// And ends before "// ✅ CASO 2" (at line 1183)

const lines = content.split('\n');
const startIdx = 1141; // index 0-based is 1140, but view_file used 1-based
const targetStart = 1141; // The line after the first closing brace

// We want to keep until line 1141. And remove until line 1182.
// Line 1183 is "// ✅ CASO 2"

let newLines = [];
for (let i = 0; i < lines.length; i++) {
    // lines[i] is line (i+1)
    if (i + 1 > 1141 && i + 1 < 1183) {
        continue;
    }
    newLines.push(lines[i]);
}

fs.writeFileSync(path, newLines.join('\n'));
console.log('File index.html cleaned up successfully.');
