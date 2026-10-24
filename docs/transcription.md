# Transcription: pipeline, diagnosis, measurements

What `listen.mjs` does to a take, what was wrong with it on real recordings, what was changed, and the numbers.
Everything here is reproducible: `node --test test/listen.test.mjs test/roundtrip.test.mjs` (synthetic round trips),
`python scripts/corpus.py` then `node scripts/eval.mjs corpus/beat` / `corpus/hum` (two public corpora of amateur
recordings), `node scripts/transcribe.mjs takes/<name>.wav` (the user's own takes).

## The pipeline

Recording (raw `getUserMedia`, 48 kHz on the Pixel, echo cancellation / noise suppression / AGC off) → box-filter
downsample to 16 kHz → then, in `transcribe`:

| stage | function | method |
|---|---|---|
| onset strength | `onsetStrength` | rectified rise of log RMS, 50 ms window every 5 ms (was 20 ms) |
| tempo candidates | `detectTempo` | autocorrelation of the strength envelope over 60..200 bpm, a mild preference for 80..160 |
| onsets | `detectOnsets` + `onsetTimes` | peaks over a local mean + delta (librosa's picker; was a fixed floor), then backtracked to the start of the attack |
| pitch track | `pitchTrack` → `yin` | YIN every 10 ms, 80 ms frames, 60..1500 Hz, no octave correction (see below) |
| notes | `segments` | runs of frames within ±0.75 semitone of their mean; ended by 6 frames of something else; clarity-filtered |
| merge | `transcribe` | onsets add repeated notes (only after a dip in level) and unpitched hits, and sharpen segment starts; a take more than 40% pitched is a melody |
| melody cleanup | `transcribe` | an unpitched onset is a consonant of the next note, a lost note under a ring, a clap, a breath, or (new) the tap that started the take |
| drum voices | `classifyHits` | logistic regression on 16 hit features, trained on 28 amateur beatboxers; near-identical hits vote together; a catalogue sample is its own kind |
| sounds | `matchSounds`, `matchInstrument` | nearest catalogue sample / instrument by hand-scaled feature distance |
| key | `detectKey` | Krumhansl-Schmuckler on the note histogram |
| bpm | `chooseBpm` → `fitBpm` | autocorrelation and inter-onset candidates ×½ ×1 ×2, grid-fitted ±6%, nearest 113 among the fits |
| quantise | `toParts` | each gap rounded to a count of 16ths and accumulated (beat: any count, a flam collapses; melody: a musical length, dotted included) |
| Strudel | `toParts`, `assemble` | one `note("…")` line with held lengths, one `s("…").struct("…")` line per drum voice, one cycle per bar |

Monophonic by design: one note per 16th, a hit on a note's 16th is lost, one instrument per take, bar 1 at the first
onset, intonation reported as sung (no snapping to the key).

## Diagnosis (before any change)

Ground truth available: 10 synthetic round-trip fixtures (all passed), four of the user's takes (no labels; read
through spectrograms, pyin and a harmonic-product-spectrum check), and two public corpora fetched for this work:

- **AVP** (Amateur Vocal Percussion, QMUL/ROLI, CC BY 4.0): 28 people with no beatbox experience, 280 files, every
  hit annotated with its onset and kick / snare / closed hat / open hat. The 56 improvisations are the end-to-end
  beat test; the 224 single-sound files train the voice classifier.
- **HumTrans** (CC BY-NC 4.0): hummed melodies with MIDI labels; 40 test files pulled out of its 14.7 GB archive by
  range requests. Its labels are score-timed (the singer's tempo and drift are not in them) and for some singers an
  octave off what was sung (verified with pyin, corrected in `scripts/corpus.py`), so only the pitch sequence and
  the ratios between gaps are truth, not onset times.

What the user's takes showed (`takes/last.wav` a beatbox, `run3/run4/scale1.wav` sung):

1. **False onsets on ringing sounds.** A long "pssh" in the beat take decays with amplitude wobble; the rise-of-RMS
   detector with its fixed floor (15% of the loudest rise, or median + 3·MAD, which is ~0 for a sparse take) read
   each wobble as a hit: 29 events where there are 16. The resulting four bars were noise.
2. **Lead-in clicks became drum lines.** `run4` starts with the Listen tap and the phone's click (0.1..0.4 s,
   louder than the singing); they survived as two drum voices and pushed bar 1 ahead of the melody.
3. **Absolute grid on a drifting beat.** The beat take repeats a figure every ~2.25 s, read at 116 bpm (2.07 s a
   bar); the absolute 16th grid shifted every bar by a slot, so no two bars came out alike.
4. **Unreadable held notes.** A slowly sung scale (notes ~0.9 s) came out at the doubled tempo as `e2@7 ~ g2@6 ~ ~`:
   a 16th of breath after each note written as a rest, dotted lengths forbidden.
5. **Pitch was fine.** YIN agreed with pyin and the harmonic product spectrum within half a semitone on every take;
   the "E2" readings were right, the singer's voice is low and goes progressively sharp.

Baseline on the corpora (the numbers to beat): AVP improvisations onset F1 **0.868** (P .794, R .957: false
positives), drum voice as named **.567** (best relabelling .677). HumTrans pitch sequence: edit distance per note
**0.340** (0.329 with octaves folded, so octave errors were ~1%).

## What was changed, and what each change measured

Every change was kept only if the number it targets moved and the 13 round-trip tests stayed green. In order:

1. **Onset picker** (`detectOnsets`): librosa's adaptive picker (local max within 30 ms, above the ±100 ms mean by
   a tenth of the take's loudest rise, 90 ms apart) on the log-RMS rise, with the window widened from 20 to 50 ms.
   A sweep over window / delta / gap / mean width on the 56 improvisations picked these. Onset F1 .872 → **.956**
   (raw detector; librosa's own detector on the same files: .895). A SuperFlux-style per-band spectral flux was tried
   first and lost (F1 .80, onsets 20..30 ms late); it is not in the code.
2. **Onset time** (`onsetTimes`): a 50 ms window reads the attack up to 40 ms early, so each peak backtracks to the
   first 5 ms block at a fifth of the window's loudest. Mean absolute timing error on the corpus 30 → **7 ms**
   (fraction swept: .1 → 8.4 ms, .2 → 6.9, .5 → 10.1). Without this the drum features were measured on the silence
   before the hit, and every synthetic drum fixture failed.
3. **Lead-in** (`transcribe`): in a melody, an unpitched hit before the first note and inside the first half second
   is the tap that started the take. `run4` loses its two phantom drum lines and its four bars of rests.
4. **Repeated notes** (`transcribe`): an onset inside a held note counts as the note struck again only if the level
   fell to half the next attack's in the 100 ms before it. HumTrans extra notes 96 → 86 (edit/note .310 → .303).
5. **Quantisation** (`toParts`): gaps rounded and accumulated for beats too (a flam collapses to the same 16th; a
   bar that ran 6% long no longer shifts every later bar), dotted lengths allowed in a melody. HumTrans rhythm
   agreement (tempo-free gap ratios over aligned notes, ±12%): dotted **.754**, powers of two .733, integer slots
   .738. The beat take now repeats its figure bar to bar.
6. **Note lengths** (`toParts`): a single 16th of silence after a note of three or more is the breath before the
   next note, so `e2@5 ~ g2@5 ~` is written `e2@6 g2@6`.
7. **Drum voices** (`classifyHits`, `HIT_MODEL`): multinomial logistic regression on 16 numbers from `hitFeatures`
   (the five it had, six band shares, zero crossings, attack, temporal centroid, YIN clarity and pitch), fitted by
   `scripts/hitmodel.py` on 9.8k labelled AVP hits, leave-one-person-out accuracy **.804** (.784 on improvisations).
   Measured and rejected: random forest .802, 16-unit MLP .801 (no gain for the weight), per-take cluster voting
   (−2 to −8 points: a centroid cluster holds more than one vocal sound), training with the catalogue's 721 drum
   samples mixed in (a vocal kick is a flat noise burst, a machine kick a tone: a linear model cannot hold both;
   −3 to −9 points on voices for +15 on machines). Kept instead: features clipped to the training range (a synthetic
   burst's flatness is three times any voice's), near-identical hits share one vote, a kit of three exactly repeating
   sounds is bd/sd/hh by brightness, and a hit that *is* a catalogue sample (distance < .01) takes its kind.
   End-to-end voice accuracy on the improvisations (detected onsets, so onset errors count too) .567 → **.724**.

8. **Bar length for beats** (`barBpm`): after the tempo is chosen, the onset envelope's autocorrelation is searched
   within ±8% of a four-beat bar, and a clear peak (normalised ≥ .2) sets the bar: a beatboxer keeps a figure, and
   the beat alone cannot tell a bar of 4 beats from one of 4.3. The user's take (2.21 s figure, read as 2.06 s bars)
   now comes out at 108.8 bpm with bars 1 and 2 identical and the figure visible in every bar. A first version that
   searched 1.2..4 s for the strongest repeat doubled every fixture's tempo (the half-bar repeats best) and is gone.
9. **One kit** (`matchSounds`, `PLAYS`): the machine whose kick, snare and hat together sit nearest the voices' mean
   features plays all three; only real kicks, snares and hats are candidates (a D110 tom, an RM50 cowbell and a
   Minipops hat had been playing the beat take).
10. **Sung syllables** (`yin`, `transcribe`): a take of short sung syllables ("da da da" with hard consonants) came out
    as a beat of cowbells, since the segmenter needs 60 ms of stable pitch and YIN read the consonant an octave up.
    Now YIN takes the double period when its dip is clearly deeper (.1; a vibrato note's two dips differ by .04, so
    the old objection holds), and a take is a melody when more than half its onsets start a stable pitch and the raw
    track is clearly voiced for 38% of the span (that take .42, a hummed tune .48; beatboxers who hum their kicks
    .16..34, two of 56 above). That take: 22 notes and one stray hit, was 16 notes and three drum lines. HumTrans
    edit distance .303 → .290, rhythm .755 → .767; beat corpus unchanged.

11. **Scoops** (`segments`): the user slides into each note (1.5 semitones over 150..300 ms) and the ±.75-semitone
    running-mean rule wrote every note twice, a semitone apart. Two contiguous segments within two semitones are now
    one note when the piece before is short (under 120 ms: a lead-in, not a held note) or the boundary is a slow glide
    (no per-frame step over .25 and under .6 semitones across 80 ms: a legato step is smeared over YIN's frame but
    still adds up to the step); the note's pitch is the median, which the scoop does not pull down. A jump-only
    segmenter was tried first and over-merged legato hums (HumTrans .290 → .313, two fixtures lost notes). Kept
    version: HumTrans .290 → **.283**, rhythm .767 → .792, fixtures 13/13, beat corpus unchanged.

### Numbers, before and after

| measure | before | after |
|---|---|---|
| AVP improvisations: onset F1 (±50 ms, end to end) | .868 | .926 |
| AVP improvisations: drum voice as named | .567 | .724 |
| AVP: onset timing error, mean absolute | 30 ms | 7 ms |
| HumTrans: pitch-sequence edit distance per note | .340 | .283 |
| HumTrans: of 1063 notes right / one semitone off / extra / missed | | 827 / 108 / 86 / 40 (before the syllable and scoop work) |
| HumTrans: rhythm agreement of aligned gaps | (.733 as powers of two) | .792 |
| round-trip fixtures | 13/13 | 13/13 |
| node, 60 s take | | 1.3 s |

What the takes look like now: the beatbox is 18 events (the eye counts 16) in two voices with a repeating figure;
`run4` is ten notes and no drum lines; the slow scale is `[e2@6 g2@6 a2@4] [~ ~ ~ ~ a#2@6 ~ ~ c#3@4] …` at 117
bpm (the doubled tempo is the nearest-113 rule; the sung lengths are right).

## What is still weak, and the way to tune it

The corpora are strangers: smooth hummers and 28 beatboxers. The user sings short syllables with hard consonants
and scoops, and beatboxes with long "pssh" sounds; neither corpus has that, and three of today's fixes came from
reading the user's own takes by spectrogram with no ground truth. The tuning loop that would actually converge:
a take plus one typed line of what it was (a tune name, note names, "boots and cats 4 bars"), saved as
`takes/<name>.json` in the same format as the corpus, and `node scripts/eval.mjs takes` scoring the user's own voice.
Open questions only that loop can answer: whether a repeated pitch across a level dip is two syllables or one
scooped note, where the user feels "one" in a beatbox bar, and whether snare and hat come out right for this voice.
Tempo presentation is a separate, product-level choice: a sung melody often fits both 92 and 185 bpm and the finer
grid wins the fit (`chooseBpm`), which reads as 16ths with rests where 8ths would do; A/B idea 14 (half / double
buttons) is the honest fix.

## Known limits, on purpose

- Intonation is reported as sung: 10% of HumTrans notes are one semitone off the score. Snapping to the key is
  A/B idea 15, a product decision.
- The voice model knows voices. A drum machine played in is named by the catalogue when the sample matches exactly;
  through a mic it will not, and an 808 snare's tonal body reads as a kick. Snare against hat is the model's own
  weak pair (a "k" snare is a hat to it a third of the time).
- Half/double tempo: among candidates that fit, the one nearest 113 bpm wins. A slow hum comes out doubled with
  longer note values, which plays the same.
- Everything monophonic, one onset one thing, bar 1 at the first onset, as before.
- Phone timing was not measured this round (no build went out from this session; the A/B session ships). Node does
  a 60 s take in 1.3 s; the page thread blocks for that long during "transcribing…".

## Reproducing

```
python -m venv venv && venv/Scripts/pip install librosa soundfile pretty_midi numpy scikit-learn pandas
venv/Scripts/python scripts/corpus.py            # ~230 MB download, corpus/ (gitignored)
node scripts/eval.mjs corpus/beat                # onsets + voices
node scripts/eval.mjs corpus/hum                 # pitch sequence + rhythm
node scripts/hitfeatures.mjs corpus/beat-class corpus/beat > corpus/hits.csv
venv/Scripts/python scripts/hitmodel.py corpus/hits.csv   # LOPO accuracy on stderr, HIT_MODEL json on stdout
```
