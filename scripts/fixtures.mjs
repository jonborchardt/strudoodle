// Render test/fixtures/patterns.mjs to test/fixtures/<name>.wav (16 kHz mono) with strudel itself: a headless Chromium
// opens the app's render.html (served from assets/www on a local port) and renders each pattern offline.
// usage: cd web && npm install && npm run fixtures [-- name ...]
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { PATTERNS } from '../test/fixtures/patterns.mjs';
import { writeWav } from './wav.mjs';
import { RATE, transcribe } from '../app/src/main/assets/www/listen.mjs';

const { chromium } = await import('../web/node_modules/playwright-core/index.mjs');
const WWW = path.resolve(import.meta.dirname, '../app/src/main/assets/www'), OUT = path.resolve(import.meta.dirname, '../test/fixtures');
const STRUDLE_PACKS = path.resolve(import.meta.dirname, '../../strudle/samples/packs'); // the pack jsons there say `_base: /samples/packs/<pack>/`
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.wav': 'audio/wav', '.mp3': 'audio/mpeg' };
const server = http.createServer((q, r) => {
  const u = decodeURIComponent(q.url.split('?')[0]);
  const f = u.startsWith('/samples/packs/') ? path.join(STRUDLE_PACKS, u.slice('/samples/packs/'.length)) : path.join(WWW, u);
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': MIME[path.extname(f)] ?? 'application/octet-stream' }); r.end(d); });
});
const catalogue = JSON.parse(fs.readFileSync(path.join(WWW, 'sounds.json'), 'utf8'));
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
try {
  const page = await browser.newPage();
  page.on('console', (m) => { if (m.type() === 'error') console.error('[page]', m.text()); });
  page.on('pageerror', (e) => console.error('[page]', e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/render.html`);
  await page.waitForFunction(() => window.isReady, null, { timeout: 60000 });
  await page.evaluate(([urls, alias]) => load(urls, alias), [Object.keys(catalogue._packs).map((p) => `/samples/packs/${p}.json`), '/samples/packs/tidal-drum-machines-alias.json']);
  const only = process.argv.slice(2);
  for (const p of PATTERNS.filter((p) => !only.length || only.includes(p.name))) {
    const samples = await page.evaluate(([code, seconds]) => render(code, seconds), [p.code, p.seconds]);
    const out = path.join(OUT, `${p.name}.wav`);
    fs.writeFileSync(out, writeWav(Float32Array.from(samples), RATE));
    let peak = 0; for (const v of samples) peak = Math.max(peak, Math.abs(v));
    // the transcriber's output must itself be Strudel that evaluates: the test compares strings, this proves they play
    const code = transcribe(Float32Array.from(samples), RATE, { catalogue: catalogue.sounds, instruments: catalogue.instruments }).code;
    const evals = await page.evaluate(async (c) => { try { return !!(await strudel.evaluate(c, false)); } catch (e) { return e.message; } }, code);
    console.log(`${p.name}: ${(samples.length / RATE).toFixed(2)}s, peak ${peak.toFixed(3)} → ${path.relative(process.cwd(), out)}; transcription ${evals === true ? 'evaluates' : 'FAILS: ' + evals}`);
  }
} finally { await browser.close(); server.close(); }
