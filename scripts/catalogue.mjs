// Build app/src/main/assets/www/sounds.json: every drum-ish sound and every pitched instrument strudel's packs have,
// measured with the transcriber's own hitFeatures / toneFeatures at its own 16 kHz, so a heard hit or note and a
// catalogue sound are compared like with like (strudle's meta files measure at native rate, which makes bright
// sounds look brighter than the phone can hear). The drum voice word comes from strudle's meta (its naming rules).
// Variant 0 is what `s("name")` plays, so it stands for a drum; an instrument is measured on its note nearest C4,
// and the four synth waveforms are generated here so they can be matched too.
// usage: node scripts/catalogue.mjs   (needs ../strudle with its packs downloaded)
import fs from 'node:fs';
import path from 'node:path';
import { readWav } from './wav.mjs';
import { downsample, hitFeatures, toneFeatures, yin, RATE } from '../app/src/main/assets/www/listen.mjs';

const STRUDLE = path.resolve(import.meta.dirname, '../../strudle'), OUT = path.resolve(import.meta.dirname, '../app/src/main/assets/www/sounds.json');
const DRUMS = ['tidal-drum-machines', 'uzu-drumkit', 'Dirt-Samples', 'mridangam'], PITCHED = ['vcsl'];
const cdn = JSON.parse(fs.readFileSync(path.join(STRUDLE, 'lib/packs.json'), 'utf8'));
const dir = path.join(STRUDLE, 'samples/packs');
const out = { _packs: {}, _alias: cdn.alias, sounds: {}, instruments: {} };
const load = (pack, file) => { const { rate, data } = readWav(fs.readFileSync(path.join(dir, pack, decodeURIComponent(file)))); const f = Math.round(rate / RATE); return { rate: rate / f, data: downsample(data, f) }; };
let skipped = 0;
for (const pack of DRUMS) {
  const map = JSON.parse(fs.readFileSync(path.join(dir, `${pack}.json`), 'utf8')), meta = JSON.parse(fs.readFileSync(path.join(dir, `${pack}.meta.json`), 'utf8'));
  if (cdn.packs[pack]) out._packs[pack] = cdn.packs[pack];
  for (const [name, files] of Object.entries(map)) {
    if (name.startsWith('_') || !Array.isArray(files)) continue;
    try {
      const { rate, data } = load(pack, files[0]);
      const h = hitFeatures(data, rate, 0, Math.min(data.length / rate, 2));
      out.sounds[name] = { pack, voice: meta[files[0]]?.voice ?? 'other', centroid: Math.round(h.centroid), low: +h.low.toFixed(3), high: +h.high.toFixed(3), flat: +h.flat.toFixed(3), decay: Math.round(h.decay), n: files.length };
    } catch { skipped++; }
  }
}
const midiOfName = (n) => { const m = /^([A-Ga-g])([#sb]?)(-?\d+)$/.exec(n); if (!m) return null; const base = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }[m[1].toLowerCase()]; return base + (m[2] === '#' || m[2] === 's' ? 1 : m[2] === 'b' ? -1 : 0) + (+m[3] + 1) * 12; };
// A vcsl label is not always the pitch that sounds: most sustained instruments' "C4" file sounds C5. The pitch is read
// off the file (YIN at 300 ms), brightness is measured against that, and the octave offset is kept so a transcription
// can transpose it away (`note("c4").s("organ_full").transpose(-12)` sounds C4).
const tone = (name, pack, data, rate, label) => {
  const o = Math.round(.3 * rate), p = yin(data.subarray(o, o + 1024 + Math.floor(rate / 60)), rate);
  const sounding = p ? 69 + 12 * Math.log2(p.hz / 440) : label, offset = Math.round((sounding - label) / 12) * 12;
  const t = toneFeatures(data, rate, 0, Math.min(data.length / rate, 1.5), 440 * 2 ** ((sounding - 69) / 12));
  out.instruments[name] = { pack, bright: +t.bright.toFixed(2), flat: +t.flat.toFixed(3), attack: Math.round(t.attack), sustain: +t.sustain.toFixed(2), offset };
};
for (const pack of PITCHED) {
  const map = JSON.parse(fs.readFileSync(path.join(dir, `${pack}.json`), 'utf8'));
  if (cdn.packs[pack]) out._packs[pack] = cdn.packs[pack];
  for (const [name, notes] of Object.entries(map)) {
    if (name.startsWith('_') || Array.isArray(notes)) continue;
    const keys = Object.keys(notes).map((k) => [k, midiOfName(k)]).filter(([, m]) => m != null);
    if (!keys.length) continue;
    const [key, midi] = keys.reduce((a, b) => (Math.abs(b[1] - 60) < Math.abs(a[1] - 60) ? b : a));
    try { const { rate, data } = load(pack, notes[key]); tone(name, pack, data, rate, midi); } catch { skipped++; }
  }
}
// the synths superdough has, generated at C4 with a 5 ms ramp: a match can land on them too
const f0 = 261.63, N = RATE;
const WAVES = { sine: (p) => Math.sin(2 * Math.PI * p), triangle: (p) => 4 * Math.abs(p - Math.floor(p + .5)) - 1, square: (p) => (p % 1 < .5 ? 1 : -1), sawtooth: (p) => 2 * (p % 1) - 1 };
for (const [name, fn] of Object.entries(WAVES)) tone(name, 'synth', Float32Array.from({ length: N }, (_, i) => .5 * Math.min(1, i / (RATE * .005)) * fn((i * f0) / RATE)), RATE, 60);
fs.writeFileSync(OUT, JSON.stringify(out));
console.log(`${Object.keys(out.sounds).length} drum sounds from ${DRUMS.join(', ')}, ${Object.keys(out.instruments).length} instruments from ${PITCHED.join(', ')} + synths (${skipped} unreadable skipped) → ${path.relative(process.cwd(), OUT)} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)`);
