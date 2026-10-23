// Copy the installed @strudel/web bundle into the app's assets (index.js + its clock worker + licence).
import fs from 'node:fs';
import path from 'node:path';
const src = path.join(import.meta.dirname, 'node_modules/@strudel/web');
const dst = path.join(import.meta.dirname, '../app/src/main/assets/www/strudel');
fs.rmSync(dst, { recursive: true, force: true });
fs.cpSync(path.join(src, 'dist/index.js'), path.join(dst, 'index.js'));
fs.cpSync(path.join(src, 'dist/assets'), path.join(dst, 'assets'), { recursive: true });
fs.cpSync(path.join(src, 'LICENSE'), path.join(dst, 'LICENSE'));
console.log('synced @strudel/web', JSON.parse(fs.readFileSync(path.join(src, 'package.json'))).version);
