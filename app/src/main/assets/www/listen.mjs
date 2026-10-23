// Microphone buffer in, Strudel pattern out. Pure functions, no DOM, so node runs test/listen.test.mjs on the same code.
//
// Pipeline: downsample to 16 kHz → onset strength (rectified rise of log RMS per 5 ms hop, lifted from strudle's
// web/sampler.mjs detectTempo) → tempo by autocorrelation → onsets by peak picking → pitch per onset by YIN → key by
// Krumhansl-Schmuckler profiles → quantise onsets to a 16th grid from the first onset → mini-notation.

export const RATE = 16000;

/** Box-filter downsample by an integer factor. Fine for pitch under 2 kHz and for onsets. */
export function downsample(data, f) {
  if (f <= 1) return data;
  const out = new Float32Array(Math.floor(data.length / f));
  for (let i = 0; i < out.length; i++) { let s = 0; for (let j = 0; j < f; j++) s += data[i * f + j]; out[i] = s / f; }
  return out;
}

/**
 * Rectified rise of log RMS, a 20 ms window every 5 ms: a quiet hat and a loud kick count comparably. The window is
 * longer than a bass note's period (16 ms at 60 Hz); per-hop RMS read the waveform itself as three rises per note.
 */
export function onsetStrength(data, rate) {
  const hop = Math.max(1, Math.round(rate / 200)), win = 4 * hop, n = Math.floor(data.length / hop);
  const env = new Float32Array(n), rms = new Float32Array(n), lg = (e) => Math.log1p(100 * e);
  let prev = 0;
  for (let i = 0; i < n; i++) {
    let e = 0; const o = i * hop, end = Math.min(data.length, o + win);
    for (let j = o; j < end; j++) e += data[j] * data[j];
    e = Math.sqrt(e / (end - o)); rms[i] = e; env[i] = Math.max(0, lg(e) - lg(prev)); prev = e;
  }
  return { env, rms, hop, hps: rate / hop };
}

/** Tempo of the onset-strength envelope: autocorrelation over 60..200 bpm with a mild preference for 80..160. bpm 0 when nothing periodic stands out. */
export function detectTempo(env, hps) {
  const n = env.length;
  if (n < 400) return { bpm: 0, confidence: 0 };
  let total = 0; for (let i = 0; i < n; i++) total += env[i];
  if (!total) return { bpm: 0, confidence: 0 };
  const e = Float32Array.from(env, (v) => v - total / n);
  const lagMin = Math.floor((60 / 200) * hps), lagMax = Math.min(n - 1, Math.ceil(hps));
  const r = new Float32Array(lagMax + 1);
  let best = -Infinity, bestLag = 0, sum = 0;
  for (let lag = lagMin; lag <= lagMax; lag++) {
    let acc = 0; for (let i = 0; i + lag < n; i++) acc += e[i] * e[i + lag];
    r[lag] = acc / (n - lag); sum += Math.max(0, r[lag]);
    const bpm = (60 * hps) / lag, w = Math.max(.5, 1 - .25 * Math.abs(Math.log2(bpm / 113)));
    if (r[lag] * w > best) { best = r[lag] * w; bestLag = lag; }
  }
  if (bestLag <= 0 || r[bestLag] <= 0) return { bpm: 0, confidence: 0 };
  const a = bestLag - 1 >= lagMin ? r[bestLag - 1] : r[bestLag], b = r[bestLag], c = bestLag + 1 <= lagMax ? r[bestLag + 1] : r[bestLag];
  const den = a - 2 * b + c;
  const lag = bestLag + (den < 0 ? Math.max(-.5, Math.min(.5, (a - c) / (2 * den))) : 0);
  const avg = sum / (lagMax - lagMin + 1);
  return { bpm: Math.round(((60 * hps) / lag) * 10) / 10, confidence: Math.max(0, Math.min(1, avg ? (r[bestLag] / avg - 1) / 4 : 0)) };
}

/** Onset hop indices: peaks of the smoothed envelope above a floor, at least `gapMs` apart. */
export function detectOnsets(env, hps, { gapMs = 60, floor = .15 } = {}) {
  const n = env.length, s = new Float32Array(n);
  for (let i = 0; i < n; i++) s[i] = (env[i - 1] || 0) + env[i] + (env[i + 1] || 0) + (env[i + 2] || 0); // 20 ms: a soft attack is one peak, not four
  const sorted = Float32Array.from(s).sort(), peak = sorted[n - 1], median = sorted[n >> 1];
  if (!peak) return [];
  const mad = Float32Array.from(s, (v) => Math.abs(v - median)).sort()[n >> 1]; // robust noise floor: zero for a sparse signal, the hiss level for a noisy one
  const thr = Math.max(floor * peak, median + 3 * mad), gap = Math.round((gapMs / 1000) * hps); // ponytail: fixed thresholds, tune on real recordings
  const out = [];
  for (let i = 1; i < n - 1; i++) {
    if (s[i] < thr || s[i] < s[i - 1] || s[i] < s[i + 1]) continue;
    if (out.length && i - out[out.length - 1] < gap) { if (s[i] > s[out[out.length - 1]]) out[out.length - 1] = i; continue; }
    out.push(i);
  }
  return out;
}

/** YIN pitch of one frame (frame.length = window + rate/fmin). null when the frame is not periodic enough (the threshold is loose enough for a vibrato to pass). */
export function yin(frame, rate, { fmin = 60, fmax = 1500, threshold = .25 } = {}) {
  const tauMax = Math.floor(rate / fmin), tauMin = Math.max(2, Math.floor(rate / fmax)), W = frame.length - tauMax;
  if (W < tauMax) return null;
  const d = new Float32Array(tauMax + 1), cmnd = new Float32Array(tauMax + 1);
  let run = 0; cmnd[0] = 1;
  for (let tau = 1; tau <= tauMax; tau++) {
    let s = 0; for (let i = 0; i < W; i++) { const x = frame[i] - frame[i + tau]; s += x * x; }
    d[tau] = s; run += s; cmnd[tau] = (s * tau) / (run || 1e-12);
  }
  if (run < 1e-6) return null; // silence is not a pitch
  let tau = -1;
  for (let t = tauMin; t <= tauMax; t++) if (cmnd[t] < threshold) { while (t + 1 <= tauMax && cmnd[t + 1] < cmnd[t]) t++; tau = t; break; }
  if (tau < 0) return null;
  // no "prefer the double period when its dip is deeper" step: on a vibrato note the first dip sits at .04 and the
  // double period at .00 and it reads an octave low. A sung scale, a sax and a piano all read true without it.
  const a = cmnd[tau - 1], b = cmnd[tau], c = tau + 1 <= tauMax ? cmnd[tau + 1] : b, den = a - 2 * b + c;
  return { hz: rate / (tau + (den ? (a - c) / (2 * den) : 0)), clarity: 1 - b };
}

function fft(re, im) { // in-place radix-2 (strudle's lib/analyze.mjs)
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2, vr = re[b] * cr - im[b] * ci, vi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - vr; im[b] = im[a] - vi; re[a] += vr; im[a] += vi;
        [cr, ci] = [cr * wr - ci * wi, cr * wi + ci * wr];
      }
    }
  }
}

/** Spectral centroid in Hz of the 40 ms from `t`. */
export const centroidAt = (data, rate, t) => hitFeatures(data, rate, t, t + .04).centroid;

/**
 * What a hit is made of, the way strudle measures its packs (lib/hitwords.mjs): centroid, the shares of energy under
 * 150 Hz and over 5 kHz, spectral flatness, and decay in ms from the peak to -30 dB. Spectrum over the first 100 ms
 * (or up to the next onset), decay followed up to 600 ms.
 */
export function hitFeatures(data, rate, t, until = t + .6) {
  const o = Math.round(t * rate), n = 2048, w = Math.min(n, Math.round(Math.min(.1, until - t) * rate)), re = new Float64Array(n), im = new Float64Array(n);
  for (let k = 0; k < w && o + k < data.length; k++) re[k] = data[o + k] * (.5 - .5 * Math.cos((2 * Math.PI * k) / w));
  fft(re, im);
  let tot = 0, cen = 0, low = 0, high = 0, logSum = 0, bins = 0;
  for (let k = 1; k < n / 2; k++) {
    const hz = (k * rate) / n, m = re[k] * re[k] + im[k] * im[k];
    tot += m; cen += hz * m; if (hz < 150) low += m; if (hz > 5000) high += m; logSum += Math.log(m + 1e-20); bins++;
  }
  const flat = tot ? Math.exp(logSum / bins) / (tot / bins) : 0;
  // decay: peak of a 5 ms max-envelope, then the first block under -30 dB
  const blk = Math.max(1, Math.round(rate * .005)), end = Math.min(data.length, Math.round(until * rate));
  let peak = 0, at = o;
  for (let i = o; i + blk <= end; i += blk) { let m = 0; for (let j = i; j < i + blk; j++) m = Math.max(m, Math.abs(data[j])); if (m > peak) { peak = m; at = i; } }
  let dec = end;
  for (let i = at; i + blk <= end; i += blk) { let m = 0; for (let j = i; j < i + blk; j++) m = Math.max(m, Math.abs(data[j])); if (m < peak * 10 ** (-30 / 20)) { dec = i; break; } }
  return { centroid: tot ? cen / tot : 0, low: tot ? low / tot : 0, high: tot ? high / tot : 0, flat, decay: ((dec - at) / rate) * 1000 };
}

/** strudle's voice words (from a sample's name) folded to the three kinds the clusters have; absent: the name says nothing. */
export const KIND = { bd: 'bd', lt: 'bd', sd: 'sd', cp: 'sd', rim: 'sd', mt: 'sd', ht: 'sd', cb: 'sd', hh: 'hh', oh: 'hh', rd: 'hh', cr: 'hh' };

/** The catalogue sound nearest a set of features (weighted distance in the units strudle's words use); with a `kind`, only sounds whose name says that kind. ponytail: hand-set scales */
export function nearestSound(f, catalogue, kind) {
  const d = (g) => ((Math.log2(Math.max(50, f.centroid) / Math.max(50, g.centroid)) / .5) ** 2 + ((f.low - g.low) / .25) ** 2 + ((f.high - g.high) / .2) ** 2 + (Math.log2(Math.max(10, f.decay) / Math.max(10, g.decay)) / .8) ** 2 + ((f.flat - g.flat) / .15) ** 2);
  let best = null, bestD = Infinity;
  for (const [name, g] of Object.entries(catalogue)) { if (kind && KIND[g.voice] !== kind) continue; const x = d(g); if (x < bestD) { bestD = x; best = name; } }
  return best ?? (kind ? nearestSound(f, catalogue, null) : null);
}

/** Give each drum cluster a real sound: the catalogue entry nearest the mean features of the cluster's hits. With two or more clusters their order says which is the kick and which the hat, and the match keeps to that kind; one cluster alone is whatever sound it is nearest. */
export function matchSounds(events, data, rate, catalogue) {
  const byVoice = {};
  events.forEach((e, i) => { if (e.midi == null && e.voice) (byVoice[e.voice] ??= []).push(hitFeatures(data, rate, e.t, Math.min(e.t + .6, events[i + 1]?.t ?? Infinity))); });
  const several = Object.keys(byVoice).length > 1;
  for (const [voice, fs] of Object.entries(byVoice)) {
    const mean = {};
    for (const k of ['centroid', 'low', 'high', 'flat', 'decay']) mean[k] = k === 'centroid' || k === 'decay' ? 2 ** (fs.reduce((s, f) => s + Math.log2(Math.max(1, f[k])), 0) / fs.length) : fs.reduce((s, f) => s + f[k], 0) / fs.length;
    const sound = nearestSound(mean, catalogue, several ? voice : null);
    for (const e of events) if (e.voice === voice) e.sound = sound;
  }
}

/**
 * A drum voice per unpitched event: their log centroids clustered into up to three groups (k-means, near centres
 * merged), named low to high bd, sd, hh. Relative on purpose: a beatbox through a phone mic has no energy above 5 kHz,
 * so "a hat is bright" only holds within the take; the absolute hints only name a take with one or two kinds of hit.
 */
export function classifyHits(events, data, rate) {
  const hits = events.filter((e) => e.midi == null);
  if (!hits.length) return;
  const x = hits.map((e) => Math.log2(Math.max(50, centroidAt(data, rate, e.t))));
  const sorted = [...x].sort((a, b) => a - b), at = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  let centers = [at(1 / 6), at(1 / 2), at(5 / 6)];
  const nearest = (v) => centers.reduce((best, c, i) => (Math.abs(v - c) < Math.abs(v - centers[best]) ? i : best), 0);
  let members;
  for (let it = 0; it < 10; it++) {
    members = centers.map(() => []);
    x.forEach((v) => members[nearest(v)].push(v));
    centers = centers.map((c, i) => (members[i].length ? members[i].reduce((a, b) => a + b, 0) / members[i].length : c));
  }
  centers = centers.filter((_, i) => members[i].length).sort((a, b) => a - b);
  for (let i = 1; i < centers.length;) if (centers[i] - centers[i - 1] < .4) centers.splice(i - 1, 2, (centers[i - 1] + centers[i]) / 2); else i++; // ponytail: a fixed 1.3x merge distance
  const LOW = Math.log2(1200), HIGH = Math.log2(3000);
  let names = centers.length === 3 ? ['bd', 'sd', 'hh']
    : centers.length === 2 ? [centers[0] < LOW ? 'bd' : 'sd', centers[1] > HIGH ? 'hh' : 'sd']
    : [centers[0] < LOW ? 'bd' : centers[0] > HIGH ? 'hh' : 'sd'];
  if (names.length === 2 && names[0] === names[1]) names = names[0] === 'bd' ? ['bd', 'sd'] : ['sd', 'hh'];
  hits.forEach((e, i) => { e.voice = names[nearest(x[i])]; });
}

/**
 * What a sustained note is made of, for telling a piano from a sax from a voice: brightness (centroid over the
 * fundamental, so a high note is not "brighter" than a low one), flatness, attack in ms (to 90% of the note's peak)
 * and sustain (level late in the note over level early in it: a piano decays, an organ holds). Spectrum over up to
 * 256 ms from 30 ms in; the late level is read at 250..350 ms or the note's last 100 ms when it is shorter.
 */
export function toneFeatures(data, rate, t, end, f0) {
  const o = Math.round((t + .03) * rate), stop = Math.min(data.length, Math.round(end * rate)), n = 4096;
  const w = Math.max(64, Math.min(n, stop - o)), re = new Float64Array(n), im = new Float64Array(n);
  for (let k = 0; k < w && o + k < data.length; k++) re[k] = data[o + k] * (.5 - .5 * Math.cos((2 * Math.PI * k) / w));
  fft(re, im);
  let tot = 0, cen = 0, logSum = 0, bins = 0;
  for (let k = 1; k < n / 2; k++) { const m = re[k] * re[k] + im[k] * im[k]; tot += m; cen += ((k * rate) / n) * m; logSum += Math.log(m + 1e-20); bins++; }
  const centroid = tot ? cen / tot : 0, flat = tot ? Math.exp(logSum / bins) / (tot / bins) : 0;
  const blk = Math.max(1, Math.round(rate * .005)), from = Math.round(t * rate);
  const env = []; for (let i = from; i + blk <= stop; i += blk) { let m = 0; for (let j = i; j < i + blk; j++) m = Math.max(m, Math.abs(data[j])); env.push(m); }
  const peak = Math.max(0, ...env), attack = (env.findIndex((v) => v >= .9 * peak) * blk * 1000) / rate;
  const rms = (a, b) => { let s = 0, c = 0; for (let i = Math.max(from, Math.round(a * rate)); i < Math.min(stop, Math.round(b * rate)); i++) { s += data[i] * data[i]; c++; } return c ? Math.sqrt(s / c) : 0; };
  const early = rms(t + .03, t + .13), late = end - t > .35 ? rms(t + .25, t + .35) : rms(end - .1, end);
  return { bright: centroid / Math.max(20, f0), flat, attack: Math.max(1, attack), sustain: early ? late / early : 0 };
}

/** The catalogue instrument nearest a tone's features. ponytail: hand-set scales */
export function nearestInstrument(f, instruments) {
  const d = (g) => (Math.log2(Math.max(.1, f.bright) / Math.max(.1, g.bright)) / .5) ** 2 + ((f.flat - g.flat) / .1) ** 2 + (Math.log2(f.attack / g.attack) / 1) ** 2 + ((f.sustain - g.sustain) / .3) ** 2;
  let best = null, bestD = Infinity;
  for (const [name, g] of Object.entries(instruments)) { const x = d(g); if (x < bestD) { bestD = x; best = name; } }
  return best;
}

/**
 * The instruments a melody may land on: plain articulations a hummed or played line sounds right on. Four tone
 * features cannot tell a voice from a tremolo zither or a tubular bell, and those won; the pool keeps the match honest.
 * ponytail: a hand list; widen it when the features can carry more
 */
export const MELODY_POOL = ['steinway', 'kawai', 'piano1', 'harp', 'folkharp', 'kalimba', 'marimba', 'vibraphone', 'glockenspiel', 'organ_full', 'pipeorgan_quiet', 'recorder_alto_sus', 'recorder_tenor_sus', 'sax', 'saxello', 'harmonica_soft', 'super64', 'ocarina', 'sine', 'triangle', 'sawtooth', 'square'];

/** The instrument a melody's notes sound most like: mean tone features over its notes, nearest in the pool. */
export function matchInstrument(events, data, rate, instruments) {
  const fs = events.filter((e) => e.midi != null && e.end - e.t > .08).map((e) => toneFeatures(data, rate, e.t, e.end, 440 * 2 ** ((e.midi - 69) / 12)));
  if (!fs.length) return null;
  const mean = { bright: 2 ** (fs.reduce((s, f) => s + Math.log2(Math.max(.1, f.bright)), 0) / fs.length), flat: fs.reduce((s, f) => s + f.flat, 0) / fs.length, attack: 2 ** (fs.reduce((s, f) => s + Math.log2(f.attack), 0) / fs.length), sustain: fs.reduce((s, f) => s + f.sustain, 0) / fs.length };
  const pool = Object.fromEntries(Object.entries(instruments).filter(([n]) => MELODY_POOL.includes(n)));
  return nearestInstrument(mean, Object.keys(pool).length ? pool : instruments);
}

/** The synth drums a transcription plays (no sample packs: offline). The round-trip fixtures use the same ones. */
export const VOICES = {
  bd: 'note("c1").s("sine").penv(24).pdecay(.06).decay(.18).sustain(0)',
  sd: 's("white").hpf(300).lpf(5000).decay(.1).sustain(0).gain(.5)',
  hh: 's("white").hpf(7000).decay(.03).sustain(0).gain(.35)',
};

export const NAMES = ['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b'];
export const midiOf = (hz) => Math.round(69 + 12 * Math.log2(hz / 440));
export const nameOf = (midi) => NAMES[midi % 12] + (Math.floor(midi / 12) - 1);

// Krumhansl-Kessler key profiles
const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
function corr(x, y) {
  const n = x.length, mx = x.reduce((a, b) => a + b) / n, my = y.reduce((a, b) => a + b) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0;
}
/** Key of a 12-bin pitch-class histogram: the best-correlating rotation of the major and minor profiles. */
export function detectKey(hist) {
  let best = { score: -Infinity };
  for (let t = 0; t < 12; t++) {
    const rot = (p) => hist.map((_, i) => p[(i - t + 12) % 12]);
    for (const [mode, p] of [['major', MAJOR], ['minor', MINOR]]) { const score = corr(hist, rot(p)); if (score > best.score) best = { tonic: NAMES[t], mode, score }; }
  }
  return best;
}

/** Pitch every `hopMs`: float midi per frame, null where the frame is too quiet or not periodic. */
export function pitchTrack(data, rate, { hopMs = 10, floor = .005 } = {}) {
  const hop = Math.round((rate * hopMs) / 1000), frameLen = 1024 + Math.floor(rate / 60);
  const n = Math.max(0, Math.floor((data.length - frameLen) / hop)), track = new Array(n).fill(null), clarity = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const frame = data.subarray(i * hop, i * hop + frameLen);
    let e = 0; for (let j = 0; j < frame.length; j++) e += frame[j] * frame[j];
    if (Math.sqrt(e / frame.length) < floor) continue;
    const p = yin(frame, rate);
    if (p) { track[i] = 69 + 12 * Math.log2(p.hz / 440); clarity[i] = p.clarity; }
  }
  return { track, clarity, hop, frameLen };
}

/**
 * Notes in a pitch track: a segment runs while the pitch stays within ±0.75 semitone of its mean; it ends when
 * `minFrames` in a row sit elsewhere (a new note) or are silent. Shorter excursions (vibrato, a blip at a boundary)
 * are absorbed. Times in seconds: `t` the segment's first frame plus a quarter frame (a frame straddling two notes
 * already reads the new one once it is half in), `end` where it stopped.
 */
export function segments(track, secPerFrame, frameSec, { minFrames = 6, tol = .75, clarity = null, minClarity = .8 } = {}) {
  const out = [];
  let cur = null, pending = [];
  const close = (i) => { if (cur) { cur.end = i * secPerFrame; cur.clarity = clarity ? Array.from({ length: i - cur.start }, (_, k) => clarity[cur.start + k] || 0).reduce((a, b) => a + b, 0) / (i - cur.start) : 1; out.push(cur); } cur = null; };
  const open = (i, vals) => { cur = { start: i, sum: vals.reduce((a, b) => a + b, 0), n: vals.length }; };
  for (let i = 0; i <= track.length; i++) {
    const v = track[i] ?? null;
    if (v != null && cur && Math.abs(v - cur.sum / cur.n) <= tol) { cur.sum += v; cur.n++; pending = []; continue; }
    pending.push(v);
    if (pending.length < minFrames && i < track.length) continue;
    // minFrames of something else: silence, a new note, or noise (frames that do not agree with each other)
    const vals = pending.filter((x) => x != null), mean = vals.reduce((a, b) => a + b, 0) / (vals.length || 1);
    const agree = vals.length === pending.length && vals.every((x) => Math.abs(x - mean) <= tol);
    const at = i - pending.length + 1;
    close(at);
    if (agree && vals.length) open(at, vals);
    pending = [];
  }
  // a real note's frames agree with their own period (clarity .9 and up); a ringing chord tail or two overlapping
  // notes score .7 to .85. ponytail: fixed floors, from the fixtures and two sung takes
  return out
    .map((s) => ({ t: s.start * secPerFrame + frameSec / 4, end: s.end, midi: Math.round(s.sum / s.n), clarity: s.clarity }))
    .filter((s) => s.clarity >= minClarity && (s.clarity >= minClarity + .1 || s.end - s.t >= .15));
}

/** The bpm the events agree with best: autocorrelation and median inter-onset candidates (×½, ×1, ×2 within 60..200), each grid-fitted; among those that fit, the one nearest 113 (80..160 is where a listener puts the beat). */
export function chooseBpm(events, tempo, fallback = 120) {
  const cands = new Set();
  const add = (b) => { for (const m of [.5, 1, 2]) if (b * m >= 60 && b * m <= 200) cands.add(Math.round(b * m * 10) / 10); };
  if (tempo.bpm) add(tempo.bpm);
  const ioi = events.slice(1).map((e, i) => e.t - events[i].t).filter((d) => d > .1).sort((a, b) => a - b);
  if (ioi.length) add(60 / ioi[ioi.length >> 1]);
  if (!cands.size) return { bpm: fallback, guessed: true };
  const scored = [...cands].map((b) => { const f = fitBpm(events, b); return { bpm: f.bpm, err: f.err, pref: Math.abs(Math.log2(f.bpm / 113)) }; });
  const ok = scored.filter((s) => s.err <= .15);
  const pick = (ok.length ? ok : scored).reduce((a, b) => (ok.length ? b.pref < a.pref : b.err < a.err) ? b : a);
  return { bpm: pick.bpm, guessed: false };
}

/** The pattern a 16 kHz buffer sounds like. `events` are the notes and hits (seconds, midi or null); `code` is Strudel. With a `catalogue` (sounds.json's sounds) each drum voice plays the nearest real sample instead of a synth; with `instruments` (sounds.json's instruments) the notes play the nearest instrument instead of a triangle. */
export function transcribe(data, rate = RATE, { fallbackBpm = 120, catalogue = null, instruments = null, bpm: fixedBpm = null } = {}) {
  const { env, rms, hop, hps } = onsetStrength(data, rate);
  const tempo = detectTempo(env, hps);
  const onsets = detectOnsets(env, hps).map((i) => (i * hop) / rate);
  const { track, clarity, hop: phop, frameLen } = pitchTrack(data, rate);
  const segs = segments(track, phop / rate, frameLen / rate, { clarity });
  // notes come from the pitch track (a voice slurs: no onset, just a new pitch); onsets add what it cannot see:
  // the same note struck again, and unpitched hits. An onset near a segment start also fixes its time (it is sharper).
  let events = segs.map((s) => ({ t: s.t, end: s.end, midi: s.midi }));
  for (const t of onsets) {
    const near = events.find((e) => e.midi != null && Math.abs(e.t - t) < .08);
    if (near) { near.t = t; continue; }
    const inside = segs.find((s) => t >= s.t - .05 && t < s.end);
    events.push({ t, end: inside ? inside.end : t, midi: inside ? inside.midi : null });
  }
  events.sort((a, b) => a.t - b.t);
  // a transient reads as the wrong pitch for a few frames before the note settles: the settled one is the note
  events = events.filter((e, i) => { const next = events[i + 1]; if (next?.midi != null && next.t - e.t < .12) { next.t = e.t; return false; } return true; });
  // a melody is a take whose time is mostly pitched. Counting onsets misjudged a singer with hard consonants (two
  // bursts per note, and the take became a "beat" with drum lines made of consonants and a rigid grid)
  const span = events.length > 1 ? events[events.length - 1].t - events[0].t : 0;
  const melodic = span > 0 && segs.reduce((s, x) => s + (x.end - x.t), 0) / span > .4;
  const level = (t) => { const i = Math.round((t * rate) / hop); let m = 0; for (let k = i; k < Math.min(rms.length, i + 20); k++) m = Math.max(m, rms[k]); return m; };
  if (melodic) {
    // an unpitched onset in a melody is one of: the consonant of the note that follows within .4 s (the last burst
    // of a run-up is the note's start, the earlier ones go), a note the segmenter lost under the previous note's
    // ring (the pitch track right after the attack is stable: a piano), a hit as loud as the singing (a clap), or a
    // breath, which is a third to half as loud as the notes and goes
    const sung = events.filter((e) => e.midi != null).map((e) => level(e.t)).sort((a, b) => a - b), noteLevel = sung[sung.length >> 1] ?? 0;
    const fixed = [];
    for (let i = 0; i < events.length; i++) {
      const e = events[i];
      if (e.midi != null) { fixed.push(e); continue; }
      const next = events.slice(i + 1).find((s) => s.midi != null);
      // a consonant runs into its vowel (the level between them stays at 4..74% of the burst on two singers' takes); a hit before a note decays to nothing first
      const continuous = (a, b) => { let min = Infinity; for (let k = Math.round(((a + .02) * rate) / hop); k < Math.round((b * rate) / hop); k++) min = Math.min(min, rms[k]); return min >= .03 * level(a); };
      if (next && next.t - e.t < .4 && continuous(e.t, next.t)) { if (!events.slice(i + 1).some((x) => x.midi == null && x.t < next.t)) next.t = e.t; continue; }
      const i0 = Math.round(((e.t + .03) * rate) / phop), vals = track.slice(i0, i0 + 15).filter((v) => v != null).sort((a, b) => a - b);
      if (vals.length >= 8 && vals[vals.length - 1] - vals[0] <= 1.5) { fixed.push({ t: e.t, end: e.t + .15, midi: Math.round(vals[vals.length >> 1]) }); continue; }
      if (level(e.t) >= .8 * noteLevel) fixed.push(e);
    }
    events = fixed;
  } else {
    // a beat's short tonal blip (an 808 snare's body rings 50 ms) is a hit, and so is a pitched one-off among many
    // hits (a whistle in a beatbox): a note line needs more than a sixth of the take's events
    const pitched = events.filter((e) => e.midi != null);
    for (const e of events) if (e.midi != null && (e.end - e.t < .12 || pitched.length * 6 < events.length)) e.midi = null;
  }
  classifyHits(events, data, rate);
  if (catalogue) matchSounds(events, data, rate, catalogue);
  const hist = new Array(12).fill(0);
  for (const e of events) if (e.midi != null) hist[e.midi % 12]++;
  const key = hist.some(Boolean) ? detectKey(hist) : null;
  const { bpm, guessed } = fixedBpm ? { bpm: fixedBpm, guessed: false } : chooseBpm(events, tempo, fallbackBpm); // a later track keeps the first one's tempo so the grids line up
  const instrument = instruments ? matchInstrument(events, data, rate, instruments) : null;
  const parts = toParts(events, bpm, key, guessed ? ' (no steady beat heard, assumed)' : '', melodic, instrument && { name: instrument, offset: instruments[instrument].offset || 0 });
  return { bpm, tempo, key, events, melodic, instrument, parts, code: assemble([parts], bpm) };
}

/** Several tracks' parts as one program: the voice definitions once, every line in one stack, one tempo. */
export function assemble(parts, bpm) {
  const defs = [...new Set(parts.flatMap((p) => p.defs))], lines = parts.flatMap((p) => p.lines);
  if (!lines.length) return `// heard nothing\nsilence`;
  return `${parts.map((p) => p.head).join('\n')}\n${defs.join('')}stack(\n${lines.join(',\n')}\n).cpm(${+(bpm / 4).toFixed(2)})`;
}

/** Quantise and write the Strudel for one take: see toParts. */
export function toCode(events, bpm, key, bpmNote = '', melodic = false, instrument = null) {
  return assemble([toParts(events, bpm, key, bpmNote, melodic, instrument)], bpm);
}

/** The bpm within ±6% of `bpm` whose 16th grid (from the first event) the events sit closest to, with the mean distance in steps: the autocorrelation is a few percent coarse, and a few percent shifts a late note by a slot. */
export function fitBpm(events, bpm) {
  if (events.length < 3) return { bpm, err: 0 };
  const t0 = events[0].t;
  let best = { bpm, err: Infinity };
  for (let b = bpm * .94; b <= bpm * 1.06; b += bpm / 400) {
    const step = 60 / b / 4;
    let err = 0;
    for (const e of events) { const x = (e.t - t0) / step; err += Math.abs(x - Math.round(x)); }
    err /= events.length;
    if (err < best.err - 1e-9) best = { bpm: Math.round(b * 10) / 10, err };
  }
  return best;
}

/**
 * Quantise events to 16ths and write a cycle-per-bar Strudel stack. Each gap between events is rounded to a musical
 * length and the positions accumulate, so a singer's drift is absorbed instead of scattered over the bar. A voice is
 * only good to about a quarter of a beat, so a melody gets powers of two (dotted values are indistinguishable from
 * their neighbours at that precision); a hit pattern keeps dotted lengths. A note holds for its length (`c4@3`).
 */
export function toParts(events, bpm, key, bpmNote = '', melodic = false, instrument = null) {
  if (!events.length) return { head: '// heard nothing', defs: [], lines: [] };
  const div = 16, step = (60 / bpm) / 4;
  const allowed = melodic ? [1, 2, 4, 8, 16] : [1, 2, 3, 4, 6, 8, 12, 16];
  const q = (x) => allowed.reduce((a, b) => (Math.abs(Math.log2(b / x)) < Math.abs(Math.log2(a / x)) ? b : a));
  const notes = [], hits = { bd: [], sd: [], hh: [] };
  let k = 0;
  events.forEach((e, i) => {
    // a melody drifts (rubato), so gaps are rounded and accumulated; a beat keeps a clock, so the grid is absolute and
    // a flam inside one 16th collapses into it instead of pushing everything after it a step late
    k = melodic ? (i ? k + q(Math.max(.5, (e.t - events[i - 1].t) / step)) : 0) : Math.round((e.t - events[0].t) / step);
    const slots = e.midi != null ? notes : hits[e.voice ?? 'sd'];
    slots[k] ??= { name: e.midi != null ? nameOf(e.midi) : 'x', len: Math.max(1, Math.round(((e.end ?? e.t) - e.t) / step)) };
  });
  const bars = Math.max(1, Math.ceil(Math.max(notes.length, ...Object.values(hits).map((h) => h.length)) / div));
  const track = (slots) => {
    if (!slots.some(Boolean)) return null;
    const out = [];
    for (let b = 0; b < bars; b++) {
      const tokens = [];
      for (let i = 0; i < div;) {
        const s = slots[b * div + i];
        if (!s) { tokens.push('~'); i++; continue; }
        let room = 1; while (i + room < div && !slots[b * div + i + room]) room++; // a note ends at the next note, or the bar
        const len = Math.min(s.len, room);
        tokens.push(len > 1 ? `${s.name}@${len}` : s.name); i += len;
      }
      out.push('[' + tokens.join(' ') + ']');
    }
    return bars === 1 ? out[0] : `<${out.join(' ')}>`;
  };
  const defs = [], lines = [];
  for (const v of Object.keys(VOICES)) {
    const p = track(hits[v]);
    if (!p) continue;
    const sound = events.find((e) => e.voice === v)?.sound;
    if (sound) lines.push(`  s("${sound}").struct("${p}")`); // a real sample from the packs (online)
    else { defs.push(`const ${v} = ${VOICES[v]}\n`); lines.push(`  ${v}.struct("${p}")`); }
  }
  const n = track(notes);
  if (n) lines.push(`  note("${n}").s("${instrument?.name ?? 'triangle'}")${instrument?.offset ? `.transpose(${-instrument.offset})` : ''}.clip(1).release(.1)`); // clip: a sample stops at its note's end instead of ringing into the next
  const head = `// ${bpm} bpm${bpmNote} · ${key ? `${key.tonic.toUpperCase()} ${key.mode}` : 'no pitched notes'} · ${bars} bar${bars > 1 ? 's' : ''} · ${events.length} ${melodic ? 'notes' : 'events'}${instrument ? ` · ${instrument.name}` : ''}`;
  return { head, defs, lines };
}
