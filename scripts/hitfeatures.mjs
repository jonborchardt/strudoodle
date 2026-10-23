// The page's hit features at a corpus's labelled onsets, as csv for scripts/hitmodel.py; with `--machines`, also
// every drum sample of strudel's packs (../strudle, as scripts/catalogue.mjs reads them) under participant "machine",
// so the voice model knows a real snare from a vocal one:
//   node scripts/hitfeatures.mjs corpus/beat-class corpus/beat --machines > corpus/hits.csv
import fs from 'node:fs';
import path from 'node:path';
import { hitFeatures, hitVector, HIT_MODEL, KIND, downsample, RATE } from '../app/src/main/assets/www/listen.mjs';
import { readWav } from './wav.mjs';

let header = false;
const row = (cells) => { if (!header) { console.log(['file', 'part', 'label', 'voice', ...HIT_MODEL.features].join(',')); header = true; } console.log(cells.join(',')); };
if (process.argv.includes('--machines')) {
  const dir = path.resolve(import.meta.dirname, '../../strudle/samples/packs');
  for (const pack of ['tidal-drum-machines', 'uzu-drumkit', 'Dirt-Samples', 'mridangam']) {
    const map = JSON.parse(fs.readFileSync(path.join(dir, `${pack}.json`), 'utf8')), meta = JSON.parse(fs.readFileSync(path.join(dir, `${pack}.meta.json`), 'utf8'));
    for (const [name, files] of Object.entries(map)) {
      if (name.startsWith('_') || !Array.isArray(files)) continue;
      for (const file of files.slice(0, 3)) { // the first variants of each sound
        const word = meta[file]?.voice; if (!KIND[word]) continue;
        try {
          const { rate, data: raw } = readWav(fs.readFileSync(path.join(dir, pack, decodeURIComponent(file)))); const f = Math.round(rate / RATE), data = downsample(raw, f);
          row([`${pack}/${name}`, 'machine', word, KIND[word], ...hitVector(hitFeatures(data, rate / f, 0, Math.min(data.length / (rate / f), .6)))]);
        } catch {}
      }
    }
  }
}
for (const dir of process.argv.slice(2).filter((a) => !a.startsWith('--'))) for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.wav'))) {
  const name = f.slice(0, -4), truth = JSON.parse(fs.readFileSync(path.join(dir, name + '.json'), 'utf8')).events.sort((a, b) => a.t - b.t);
  const { rate, data } = readWav(fs.readFileSync(path.join(dir, f)));
  const part = name.match(/^P(\d+)_/)?.[1] ?? '0';
  truth.forEach((e, i) => {
    if (e.midi != null) return;
    row([name, part, e.label ?? e.voice, e.voice, ...hitVector(hitFeatures(data, rate, e.t, Math.min(e.t + .6, truth[i + 1]?.t ?? Infinity, data.length / rate)))]);
  });
}
