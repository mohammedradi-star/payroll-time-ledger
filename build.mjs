// Builds dist/index.html: the UI shell with the calculation engine inlined (one self-contained file).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const ui = readFileSync('src/ui.html', 'utf8');
const core = readFileSync('src/core.js', 'utf8');
if (!ui.includes('/*CORE*/')) throw new Error('src/ui.html is missing the /*CORE*/ placeholder');
mkdirSync('dist', { recursive: true });
writeFileSync('dist/index.html', ui.replace('/*CORE*/', () => core));
writeFileSync('dist/.nojekyll', '');
console.log('Built dist/index.html');
