// Round trip: strudel renders a known pattern (scripts/fixtures.mjs → test/fixtures/*.wav), the transcriber must write it back.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PATTERNS } from './fixtures/patterns.mjs';
import { readWav } from '../scripts/wav.mjs';
import { transcribe, KIND } from '../app/src/main/assets/www/listen.mjs';

// a held note (`c4@3`) compared as its start slot plus rests, so expectations state where notes are, not how long a synth rings
const flat = (s) => s?.replace(/(\S+)@(\d+)/g, (_, n, k) => n + ' ~'.repeat(k - 1)) ?? null;
const notesOf = (code) => flat(code.match(/^\s*note\("([^"]*)"\)/m)?.[1]);
// a drum line is `bd.struct(...)` (synth voice) or `s("RolandTR808_bd").struct(...)` (a catalogue sample): the sample counts as the voice strudle's words give it
const sounds = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '../app/src/main/assets/www/sounds.json'), 'utf8')), catalogue = sounds.sounds;
const instrumentOf = (code) => code.match(/^\s*note\("[^"]*"\)\.s\("([^"]+)"\)/m)?.[1] ?? null;
const hitsOf = (code) => {
  const o = {};
  for (const m of code.matchAll(/^\s*(?:(bd|sd|hh)|s\("([^"]+)"\))\.struct\("([^"]*)"\)/gm)) {
    const v = m[1] ?? KIND[catalogue[m[2]]?.voice] ?? `?${m[2]}`;
    o[v] = m[3];
  }
  return Object.keys(o).length ? o : null;
};
const show = (r) => `events ${r.events.map((e) => `${e.t.toFixed(2)}:${e.midi ?? e.sound ?? e.voice ?? 'x'}`).join(' ')}`;

for (const p of PATTERNS) {
  const file = path.join(import.meta.dirname, 'fixtures', `${p.name}.wav`);
  test(`roundtrip: ${p.name}`, { skip: !fs.existsSync(file) && 'no fixture wav: cd web && npm run fixtures' }, () => {
    const { rate, data } = readWav(fs.readFileSync(file));
    const r = transcribe(data, rate, { catalogue, instruments: sounds.instruments });
    assert.ok(Math.abs(r.bpm - p.expect.bpm) <= p.expect.bpm * .03, `bpm ${r.bpm}, wanted ${p.expect.bpm} (${JSON.stringify(r.tempo)})`);
    assert.equal(notesOf(r.code), p.expect.notes, `notes\n  ${show(r)}`);
    if (p.expect.instrument) assert.match(instrumentOf(r.code) ?? '', p.expect.instrument, `instrument ${instrumentOf(r.code)} (${JSON.stringify(sounds.instruments[instrumentOf(r.code)])})`);
    let hits = hitsOf(r.code);
    if (p.expect.hits?.['*'] && hits && Object.keys(hits).length === 1) hits = { '*': Object.values(hits)[0] }; // "one voice, whichever": the fixture's hit is no particular drum
    assert.deepEqual(hits, p.expect.hits, `hits\n  ${show(r)}`);
  });
}
