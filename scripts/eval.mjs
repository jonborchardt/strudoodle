// Score the transcriber against a corpus: node scripts/eval.mjs <dir> [-v]
// Each <name>.wav (any rate; downsampled to 16 kHz) has a <name>.json: { events: [{ t, end?, midi|null, voice? }] }
// in seconds, voice one of bd/sd/hh. Prints per file and in total: onset precision/recall/F1 (±50 ms), the drum
// voice agreement of matched hits (as named, and under the best relabelling: the clusters are relative), and for
// notes the matched-pitch rate (±100 ms, exact / octave-free) plus the pitch sequence's edit distance per note (exact,
// and with octaves folded: the difference is the octave errors). A score-timed corpus (HumTrans) only means the latter.
import fs from 'node:fs';
import path from 'node:path';
import { transcribe, downsample, RATE } from '../app/src/main/assets/www/listen.mjs';
import { readWav } from './wav.mjs';

const dir = process.argv[2], verbose = process.argv.includes('-v');
if (!dir) { console.error('usage: node scripts/eval.mjs <dir> [-v]'); process.exit(1); }
const sounds = JSON.parse(fs.readFileSync(new URL('../app/src/main/assets/www/sounds.json', import.meta.url), 'utf8'));

/** Greedy nearest matching within `tol` seconds: pairs of [truth index, found index]. */
export function match(truth, found, tol) {
  const pairs = [], used = new Set();
  for (let i = 0; i < truth.length; i++) {
    let best = -1, bestD = tol;
    found.forEach((f, j) => { const d = Math.abs(f.t - truth[i].t); if (!used.has(j) && d <= bestD) { bestD = d; best = j; } });
    if (best >= 0) { used.add(best); pairs.push([i, best]); }
  }
  return pairs;
}
const edit = (a, b) => { // Levenshtein
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
};
const perms = (xs) => xs.length <= 1 ? [xs] : xs.flatMap((x, i) => perms([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]));
/** Pairs [i, j] of equal pitches on the Levenshtein alignment of two pitch sequences. */
function align(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  const pairs = []; let i = a.length, j = b.length;
  while (i && j) { if (d[i][j] === d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)) { if (a[i - 1] === b[j - 1]) pairs.push([i - 1, j - 1]); i--; j--; } else if (d[i][j] === d[i - 1][j] + 1) i--; else j--; }
  return pairs.reverse();
}
/**
 * Rhythm of the notes against a score-timed truth, tempo-free: over aligned neighbouring notes, the truth's gap over
 * its median gap against the found slots' gap over their median; a pair agrees within 12%. (A singer's tempo is not
 * the score's, so only ratios compare.) Returns [agreeing, compared].
 */
function rhythm(truth, found) {
  const pairs = align(truth.map((e) => e.midi), found.map((e) => e.midi)).filter(([, j]) => found[j].slot != null);
  const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[s.length >> 1] || 1; };
  const gT = truth.slice(1).map((e, i) => e.t - truth[i].t), gF = found.slice(1).map((e, i) => e.slot - found[i].slot).filter((g) => g > 0);
  const mT = med(gT), mF = med(gF);
  let ok = 0, n = 0;
  for (let p = 1; p < pairs.length; p++) {
    const [i0, j0] = pairs[p - 1], [i1, j1] = pairs[p];
    if (i1 !== i0 + 1 || j1 !== j0 + 1) continue;
    const rT = (truth[i1].t - truth[i0].t) / mT, rF = (found[j1].slot - found[j0].slot) / mF;
    n++; if (rF > 0 && Math.abs(Math.log2(rF / rT)) <= Math.log2(1.12)) ok++;
  }
  return [ok, n];
}

const tot = { files: 0, truth: 0, found: 0, hit: 0, voiceOk: 0, voiceBest: 0, hits: 0, notes: 0, noteHit: 0, pitchOk: 0, octOk: 0, edits: 0, edits12: 0, rOk: 0, rN: 0, ms: 0 };
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.wav') && fs.existsSync(path.join(dir, f.slice(0, -4) + '.json'))).sort();
for (const f of files) {
  const name = f.slice(0, -4), truth = JSON.parse(fs.readFileSync(path.join(dir, name + '.json'), 'utf8')).events.sort((a, b) => a.t - b.t);
  const { rate, data } = readWav(fs.readFileSync(path.join(dir, f)));
  const fac = Math.round(rate / RATE), t0 = performance.now();
  const r = transcribe(downsample(data, fac), rate / fac, { catalogue: sounds.sounds, instruments: sounds.instruments });
  const ms = performance.now() - t0, found = r.events;
  const pairs = match(truth, found, .05);
  const hitPairs = pairs.filter(([i]) => truth[i].midi == null);
  const voiceOk = hitPairs.filter(([i, j]) => found[j].midi == null && found[j].voice === truth[i].voice).length;
  const voiceBest = Math.max(...perms(['bd', 'sd', 'hh']).map((p) => { const m = { bd: p[0], sd: p[1], hh: p[2] }; return hitPairs.filter(([i, j]) => found[j].midi == null && m[found[j].voice] === truth[i].voice).length; }));
  const notesT = truth.filter((e) => e.midi != null), notesF = found.filter((e) => e.midi != null);
  const notePairs = match(notesT, notesF, .1);
  const pitchOk = notePairs.filter(([i, j]) => notesT[i].midi === notesF[j].midi).length, octOk = notePairs.filter(([i, j]) => (notesT[i].midi - notesF[j].midi) % 12 === 0).length;
  const edits = notesT.length ? edit(notesT.map((e) => e.midi), notesF.map((e) => e.midi)) : 0, edits12 = notesT.length ? edit(notesT.map((e) => e.midi % 12), notesF.map((e) => e.midi % 12)) : 0;
  const [rOk, rN] = notesT.length ? rhythm(notesT, notesF) : [0, 0];
  const p = found.length ? pairs.length / found.length : 0, rc = truth.length ? pairs.length / truth.length : 0, f1 = p + rc ? (2 * p * rc) / (p + rc) : 0;
  console.log(`${name.padEnd(28)} on ${truth.length}/${found.length} F1 ${f1.toFixed(2)}${hitPairs.length ? ` voice ${(voiceOk / hitPairs.length).toFixed(2)} best ${(voiceBest / hitPairs.length).toFixed(2)}` : ''}${notesT.length ? ` notes ${notesT.length}/${notesF.length} pitch ${(pitchOk / notesT.length).toFixed(2)} oct ${(octOk / notesT.length).toFixed(2)} edit ${(edits / notesT.length).toFixed(2)} edit12 ${(edits12 / notesT.length).toFixed(2)} rhythm ${rN ? (rOk / rN).toFixed(2) : '-'}` : ''} ${r.bpm}bpm ${r.melodic ? 'melody' : 'beat'} ${ms.toFixed(0)}ms`);
  if (verbose) { console.log('  truth ' + truth.map((e) => `${e.t.toFixed(2)}:${e.midi ?? e.voice}`).join(' ')); console.log('  found ' + found.map((e) => `${e.t.toFixed(2)}:${e.midi ?? e.voice}`).join(' ')); console.log(r.code.split('\n').map((l) => '  ' + l).join('\n')); }
  tot.files++; tot.truth += truth.length; tot.found += found.length; tot.hit += pairs.length; tot.hits += hitPairs.length; tot.voiceOk += voiceOk; tot.voiceBest += voiceBest;
  tot.notes += notesT.length; tot.noteHit += notePairs.length; tot.pitchOk += pitchOk; tot.octOk += octOk; tot.edits += edits; tot.edits12 += edits12; tot.rOk += rOk; tot.rN += rN; tot.ms += ms;
}
const P = tot.hit / (tot.found || 1), R = tot.hit / (tot.truth || 1);
console.log(`TOTAL ${tot.files} files: onsets P ${P.toFixed(3)} R ${R.toFixed(3)} F1 ${((2 * P * R) / (P + R || 1)).toFixed(3)}` + (tot.hits ? ` · voice ${(tot.voiceOk / tot.hits).toFixed(3)} best ${(tot.voiceBest / tot.hits).toFixed(3)}` : '') + (tot.notes ? ` · notes matched ${(tot.noteHit / tot.notes).toFixed(3)} pitch ${(tot.pitchOk / tot.notes).toFixed(3)} oct ${(tot.octOk / tot.notes).toFixed(3)} edit/note ${(tot.edits / tot.notes).toFixed(3)} edit12/note ${(tot.edits12 / tot.notes).toFixed(3)} rhythm ${(tot.rOk / (tot.rN || 1)).toFixed(3)} (${tot.rN} gaps)` : '') + ` · ${(tot.ms / tot.files).toFixed(0)} ms/file`);
