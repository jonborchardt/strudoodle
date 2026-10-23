// Ground truth for the round trip: a Strudel pattern, rendered by strudel itself (scripts/fixtures.mjs) for `seconds`,
// must transcribe back to `expect`. `notes` is the note track's mini-notation and `hits` the struct per drum voice,
// bar by bar from the first onset. `.cpm(x)` is relative to the scheduler's default cps (0.5), as in the app.
// A hit never shares a slot with a note or another hit: one onset is one thing (known ceiling).
import { VOICES } from '../../app/src/main/assets/www/listen.mjs';

const drums = Object.entries(VOICES).map(([v, def]) => `const ${v} = ${def}`).join('\n');

export const PATTERNS = [
  {
    name: 'scale', seconds: 4, // a quarter note per beat at 120 bpm, two bars
    code: 'note("<[c4 d4 e4 f4] [g4 a4 b4 c5]>").s("triangle").decay(.3).sustain(0).cpm(30)',
    expect: { bpm: 120, notes: '<[c4 ~ ~ ~ d4 ~ ~ ~ e4 ~ ~ ~ f4 ~ ~ ~] [g4 ~ ~ ~ a4 ~ ~ ~ b4 ~ ~ ~ c5 ~ ~ ~]>', hits: null },
  },
  {
    name: 'bass', seconds: 4.8, // eighth notes down low at 100 bpm, where the octave is easy to get wrong
    code: 'note("<[c2 ~ g2 ~ a#2 ~ g2 ~] [f2 ~ f2 ~ g2 ~ c2 ~]>").s("sawtooth").lpf(600).decay(.25).sustain(0).cpm(25)',
    expect: { bpm: 100, notes: '<[c2 ~ ~ ~ g2 ~ ~ ~ a#2 ~ ~ ~ g2 ~ ~ ~] [f2 ~ ~ ~ f2 ~ ~ ~ g2 ~ ~ ~ c2 ~ ~ ~]>', hits: null },
  },
  {
    name: 'hits', seconds: 4.8, // white noise on every beat at 100 bpm: one kind of hit, no particular drum, so any one voice ('*') on the right slots
    code: 's("white*4").decay(.05).sustain(0).gain(.6).cpm(25)',
    expect: { bpm: 100, notes: null, hits: { '*': '<[x ~ ~ ~ x ~ ~ ~ x ~ ~ ~ x ~ ~ ~] [x ~ ~ ~ x ~ ~ ~ x ~ ~ ~ x ~ ~ ~]>' } },
  },
  {
    name: 'drums', seconds: 4.8, // the transcriber's own kick, snare and hat at 100 bpm, never two on one slot
    code: `${drums}\nstack(bd.struct("[x ~ ~ ~ ~ ~ ~ ~ x ~ ~ ~ ~ ~ ~ ~]"), sd.struct("[~ ~ ~ ~ x ~ ~ ~ ~ ~ ~ ~ x ~ ~ ~]"), hh.struct("[~ ~ x ~ ~ ~ x ~ ~ ~ x ~ ~ ~ x ~]")).cpm(25)`,
    expect: { bpm: 100, notes: null, hits: {
      bd: '<[x ~ ~ ~ ~ ~ ~ ~ x ~ ~ ~ ~ ~ ~ ~] [x ~ ~ ~ ~ ~ ~ ~ x ~ ~ ~ ~ ~ ~ ~]>',
      sd: '<[~ ~ ~ ~ x ~ ~ ~ ~ ~ ~ ~ x ~ ~ ~] [~ ~ ~ ~ x ~ ~ ~ ~ ~ ~ ~ x ~ ~ ~]>',
      hh: '<[~ ~ x ~ ~ ~ x ~ ~ ~ x ~ ~ ~ x ~] [~ ~ x ~ ~ ~ x ~ ~ ~ x ~ ~ ~ x ~]>',
    } },
  },
  {
    name: 'machine', seconds: 4.8, // a real drum machine (tidal-drum-machines, local copies in ../strudle) at 100 bpm: each hit must come back as a sound of its kind
    code: 's("<[RolandTR808_bd ~ ~ ~ RolandTR808_sd ~ RolandTR808_hh ~ RolandTR808_bd ~ RolandTR808_hh ~ RolandTR808_sd ~ ~ ~]>").cpm(25)',
    expect: { bpm: 100, notes: null, hits: {
      bd: '<[x ~ ~ ~ ~ ~ ~ ~ x ~ ~ ~ ~ ~ ~ ~] [x ~ ~ ~ ~ ~ ~ ~ x ~ ~ ~ ~ ~ ~ ~]>',
      sd: '<[~ ~ ~ ~ x ~ ~ ~ ~ ~ ~ ~ x ~ ~ ~] [~ ~ ~ ~ x ~ ~ ~ ~ ~ ~ ~ x ~ ~ ~]>',
      hh: '<[~ ~ ~ ~ ~ ~ x ~ ~ ~ x ~ ~ ~ ~ ~] [~ ~ ~ ~ ~ ~ x ~ ~ ~ x ~ ~ ~ ~ ~]>',
    } },
  },
  {
    name: 'mixed', seconds: 480 / 140, // eighths with rests over bright hits, 140 bpm (two bars exactly: a rounded-up length lets bar three's first event in). The hits are as loud as the notes: in a melody a quieter burst is a breath
    code: 'stack(note("<[e4 ~ g4 a4 ~ b4 ~ e5] [d5 ~ b4 ~ a4 g4 ~ e4]>").s("triangle").decay(.2).sustain(0), s("<[~ white ~ ~ white ~ white ~] [~ white ~ white ~ ~ white ~]>").decay(.05).sustain(0).gain(1.6)).cpm(35)',
    expect: { bpm: 140, notes: '<[e4 ~ ~ ~ g4 ~ a4 ~ ~ ~ b4 ~ ~ ~ e5 ~] [d5 ~ ~ ~ b4 ~ ~ ~ a4 ~ g4 ~ ~ ~ e4 ~]>', hits: { '*': '<[~ ~ x ~ ~ ~ ~ ~ x ~ ~ ~ x ~ ~ ~] [~ ~ x ~ ~ ~ x ~ ~ ~ ~ ~ x ~ ~ ~]>' } },
  },
  {
    name: 'piano', seconds: 4, // a real piano (vcsl steinway): the notes and a piano-like instrument back. clip(1): a sample otherwise rings to its end, under the next notes (a chord the transcriber does not claim to read)
    code: 'note("<[c4 d4 e4 f4] [g4 a4 b4 c5]>").s("steinway").clip(1).cpm(30)',
    expect: { bpm: 120, notes: '<[c4 ~ ~ ~ d4 ~ ~ ~ e4 ~ ~ ~ f4 ~ ~ ~] [g4 ~ ~ ~ a4 ~ ~ ~ b4 ~ ~ ~ c5 ~ ~ ~]>', hits: null, instrument: /steinway|kawai|piano|clavisynth|harp|kalimba|marimba|vibraphone|balafon|xylophone|glockenspiel|psaltery_pluck|dantranh|folkharp|strumstick/ },
  },
  {
    name: 'sax', seconds: 4, // a sustained wind (vcsl sax with vibrato): a sustaining instrument back, never a struck one. vcsl's sax "C4" file sounds C5, hence the transpose; clip(1) as for the piano
    code: 'note("<[c4 d4 e4 f4] [g4 a4 b4 c5]>").s("sax_vib").transpose(-12).clip(1).cpm(30)',
    expect: { bpm: 120, notes: '<[c4 ~ ~ ~ d4 ~ ~ ~ e4 ~ ~ ~ f4 ~ ~ ~] [g4 ~ ~ ~ a4 ~ ~ ~ b4 ~ ~ ~ c5 ~ ~ ~]>', hits: null, instrument: /sax|recorder|harmonica|organ|ocarina|super64|didgeridoo|siren|trainwhistle|wineglass|psaltery_bow|vibraphone_bowed|sine|triangle|square|sawtooth/ },
  },
  {
    name: 'slur', seconds: 4, // a voice: the pitch steps while the level never dips, so there is no onset to find, only a pitch change
    code: 'note("<[c4 d4 e4 f4] [g4 a4 b4 c5]>").s("sawtooth").lpf(1500).attack(0).sustain(1).release(0).cpm(30)',
    expect: { bpm: 120, notes: '<[c4 ~ ~ ~ d4 ~ ~ ~ e4 ~ ~ ~ f4 ~ ~ ~] [g4 ~ ~ ~ a4 ~ ~ ~ b4 ~ ~ ~ c5 ~ ~ ~]>', hits: null },
  },
  {
    name: 'legato', seconds: 4, // one held tone into the next with a short attack each
    code: 'note("<[c4 d4 e4 f4] [g4 a4 b4 c5]>").s("triangle").attack(.05).sustain(1).release(.02).cpm(30)',
    expect: { bpm: 120, notes: '<[c4 ~ ~ ~ d4 ~ ~ ~ e4 ~ ~ ~ f4 ~ ~ ~] [g4 ~ ~ ~ a4 ~ ~ ~ b4 ~ ~ ~ c5 ~ ~ ~]>', hits: null },
  },
];
