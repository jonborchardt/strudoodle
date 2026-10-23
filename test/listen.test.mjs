// The one check: a synthetic 120 bpm phrase comes back as the right notes on the right 16ths, with the right key.
import test from 'node:test';
import assert from 'node:assert/strict';
import { transcribe, detectKey, RATE } from '../app/src/main/assets/www/listen.mjs';

const BPM = 120, beat = 60 / BPM;
const midi = { a3: 57, c4: 60, e4: 64, a4: 69, g4: 67 };
const hz = (m) => 440 * 2 ** ((m - 69) / 12);

// two bars: a note on every beat, a noise hit on the "and" of beats 2 and 4
const notes = ['a3', 'c4', 'e4', 'a4', 'g4', 'e4', 'c4', 'a3'];
const data = new Float32Array(Math.round((8 * beat + 1) * RATE));
let seed = 1; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
const place = (t, secs, f) => { const o = Math.round(t * RATE); for (let i = 0; i < secs * RATE; i++) data[o + i] += f(i / RATE, i); };
notes.forEach((n, b) => place(.2 + b * beat, .3, (t) => .5 * Math.exp(-6 * t) * Math.sin(2 * Math.PI * hz(midi[n]) * t)));
[1.5, 3.5, 5.5, 7.5].forEach((b) => place(.2 + b * beat, .05, (t) => .8 * Math.exp(-40 * t) * rnd())); // as loud as the notes: a quieter burst in a melody is a breath

const flat = (s) => s.replace(/(\S+)@(\d+)/g, (_, n, k) => n + ' ~'.repeat(k - 1)); // a held note as its start slot plus rests

test('transcribe: tempo, notes on the grid, hits, key', () => {
  const r = transcribe(data, RATE);
  assert.ok(Math.abs(r.bpm - BPM) < 3, `bpm ${r.bpm} (autocorrelation ${r.tempo.bpm})`); // the autocorrelation may say 60 or 240: it is a candidate, chooseBpm decides
  assert.equal(r.events.length, 12);
  assert.deepEqual(r.events.filter((e) => e.midi != null).map((e) => e.midi), notes.map((n) => midi[n]));
  assert.match(flat(r.code), /note\("<\[a3 ~ ~ ~ c4 ~ ~ ~ e4 ~ ~ ~ a4 ~ ~ ~\] \[g4 ~ ~ ~ e4 ~ ~ ~ c4 ~ ~ ~ a3 ~ ~ ~\]>"\)/);
  assert.match(flat(r.code), /hh\.struct\("<\[~ ~ ~ ~ ~ ~ x ~ ~ ~ ~ ~ ~ ~ x ~\] \[~ ~ ~ ~ ~ ~ x ~ ~ ~ ~ ~ ~ ~ x ~\]>"\)/); // white noise bursts, one kind: bright, a hat
  assert.match(r.code, /cpm\(30\)/);
});

test('detectKey: an A-heavy natural minor histogram is A minor', () => {
  const h = new Array(12).fill(0);
  for (const [pc, w] of [[9, 6], [11, 2], [0, 4], [2, 3], [4, 5], [5, 2], [7, 3]]) h[pc] = w;
  const k = detectKey(h);
  assert.equal(`${k.tonic} ${k.mode}`, 'a minor');
});

test('transcribe: silence is silence', () => {
  assert.equal(transcribe(new Float32Array(RATE * 3), RATE).code, '// heard nothing\nsilence');
});
