# A/B ledger

One test at a time. The row under the buttons flips the page between **A** and **B**; try both, then type `a` or `b` into the Log tab's input (Claude polls `files/page.log`). The winner is locked in (the loser's code deleted, the toggle removed), the next idea becomes the test, and the table below records the verdict.

Ideas, ordered by value: how much it helps "hum it, get a pattern" per line of code. Status: `testing`, `A`/`B` (locked), or blank (not yet).

| # | idea | A | B | status |
|---|------|---|---|--------|
| 1 | count-in before a take | record at once | four clicks first, tempo locked to them | A (no count-in) |
| 5 | solo / mute per track | — | a button per track | B (icons: 🔊/🔇 mute, 🎧 solo) |
| 6 | re-record a track in place | — | long-press × to replace | B (a 🎤 button, not a long-press; × now asks to confirm) |
| 7 | undo last remove | — | an "undo" link in the status line | skipped (× confirms) |
| 8 | session survives relaunch | — | tracks kept in localStorage | B |
| 9 | copy pattern to clipboard | — | a Copy button | B (in the pattern box's corner; selects the text it copies) |
| 10 | open in strudel.cc | — | a Share button with the pattern in the URL | B (strudel.cc ↗ in the pattern box's corner, opens the browser) |
| 11 | waveform strip of the take | — | canvas with onset ticks under the tracks | B |
| 12 | piano-roll strip | — | notes over time, one row per track | B (drawn on the waveform strip) |
| 13 | tempo override box | — | editable bpm next to the tracks | B (in a track's ✎ edit panel, with its waveform) |
| 14 | half / double tempo | — | two buttons | skipped (the tempo box covers it) |
| 15 | snap sung pitches to the key | as sung | nearest scale note | |
| 16 | octave shift per track | — | ± buttons | B (in the ✎ panel) |
| 17 | transpose the stack | — | ± semitone buttons | |
| 18 | instrument picker per track | auto | a select over MELODY_POOL | B (in the ✎ panel) |
| 19 | drum kit picker | auto | a select over the machines | B (in the ✎ panel) |
| 20 | quantise grid picker | 16ths | 8ths / 16ths / triplets | |
| 21 | live mic meter while recording | — | a bar in the status line | B (under the status line, −60..0 dB, red when clipping) |
| 22 | keep screen on while recording | — | wake lock | B (FLAG_KEEP_SCREEN_ON through the bridge) |
| 23 | haptic count-in | audible clicks | vibration (silent for the mic) | skipped (no count-in, #1) |
| 24 | visual beat flash while recording | — | background pulses on the beat | A |
| 25 | record cap setting | 60 s | 15 / 30 / 60 / 120 | A |
| 26 | auto-stop on silence | — | stop after 2 s of quiet | A |
| 27 | play the raw take back | — | a ▶ per track for its wav | B (takes of this launch) |
| 28 | per-note confidence | — | dim the uncertain notes in the pattern | |
| 29 | "heard as" summary per track | head comment only | melody/beat · key · bpm · instrument chips | B |
| 30 | re-transcribe a take with current code | — | a button, for tuning on the phone | skipped (an install relaunches the app, so the raw takes are gone) |
| 31 | pattern history | — | last ten patterns, back/forward | B (this launch) |
| 32 | loop length | 1 bar | 1 / 2 / 4 bars per cycle | |
| 33 | multi-bar takes | one bar | `<bar1 bar2>` for long takes | |
| 34 | fold repeated phrases | — | a repeated bar becomes `*2` | |
| 35 | whistle mode | — | higher fmax, everything pitched | |
| 36 | beatbox mode | — | pitch ignored | |
| 37 | room-noise profile | — | three seconds of silence subtracted | |
| 38 | input gain boost | — | ×2 / ×4 for quiet singers | |
| 39 | clipping / too-quiet warning | — | status line after each take | B |
| 40 | headphone detection | always muted while recording | playback stays on with headphones | A (tested with #41) |
| 41 | overdub with headphones | — | hear the stack while taking the next track | A |
| 42 | big recording indicator | button colour | a red dot and the elapsed bars | B (bars once a track sets the tempo, seconds before; covers #99) |
| 43 | trim silence | onsets only | leading/trailing silence dropped from the take | |
| 44 | master volume slider | — | `.gain` on the stack | A |
| 45 | per-track volume | — | `.gain` per line | A (testing paused after this one) |
| 46 | swing slider | — | `.swing` | |
| 47 | humanize toggle | — | small random timing | |
| 48 | room slider | dry | `.room` | |
| 49 | low-pass slider | — | `.lpf` | |
| 50 | auto-bass | — | root notes of the key under the melody | |
| 51 | auto-hat | — | a steady hh under a melody | |
| 52 | drone chord from the key | — | a held chord line | |
| 53 | play once vs loop | loop | a "once" option | |
| 54 | fade in/out | — | `.gain` envelope | |
| 55 | highlight the playing event | — | strudel's mini-notation highlighter | |
| 56 | syntax colouring | plain textarea | coloured overlay | |
| 57 | textarea font size | fixed | ± buttons | |
| 58 | inline pattern errors | status line | the line marked in the textarea | |
| 59 | tap a track to highlight its lines | — | scroll + select in the textarea | |
| 60 | rename a track | number | tap the name | |
| 61 | reorder tracks | — | ↑↓ | |
| 62 | duplicate a track | — | a ⧉ button | |
| 63 | merge two tracks | — | drag onto another | |
| 64 | preview one track | — | tap plays only it | |
| 65 | export rendered WAV | — | offline render + share sheet | |
| 66 | export the take | adb only | Android share sheet | |
| 67 | import a WAV to transcribe | — | file picker | |
| 68 | named sessions | — | save / load / delete | |
| 69 | remember settings | — | every toggle in localStorage | |
| 70 | light theme | dark | follow the system | |
| 71 | landscape layout | stacked | textarea beside the controls | |
| 72 | one-hand layout | buttons on top | buttons at the bottom | |
| 73 | immersive fullscreen | — | status bar hidden | |
| 74 | status bar colour | default | matches the page | |
| 75 | app icon | default | a drawn one | |
| 76 | splash while strudel loads | "loading strudel…" | a logo | |
| 77 | offline indicator | log only | a chip: packs loaded / synth only | |
| 78 | cache the sample maps | re-fetched | kept across launches | |
| 79 | pre-warm the chosen samples | first bar silent | fetched before play | |
| 80 | hardware volume keys | — | play / stop | |
| 81 | long-press Listen | — | re-record last track | |
| 82 | shake to stop | — | accelerometer | |
| 83 | log filter | all | errors / you / claude | |
| 84 | copy log | — | a button | |
| 85 | clear log | — | a button | |
| 86 | desktop shortcuts | — | space = play/stop, L = listen | |
| 87 | beat grid on the waveform | — | 16th lines | |
| 88 | pitch histogram | — | the key's evidence, drawn | |
| 89 | tempo candidates | one | a list to pick from | |
| 90 | remember the last bpm | — | across sessions | |
| 91 | solfège comment | note names | do-re-mi relative to the key | |
| 92 | polyphony warning | — | "sounds like a chord" when the pitch track is unstable | |
| 93 | mic selection | default | front / back | |
| 94 | strudel docs link | — | for the function under the cursor | |
| 95 | "what changed" toast | — | after each A/B lock-in | |
| 96 | share the A/B verdict in-app | log input | two thumbs on the A/B row | |
| 97 | about screen | — | version + licence | |
| 98 | pattern length in bars shown | — | in the track row | |
| 99 | elapsed bars while recording | seconds | bars at the locked tempo | B (with #42) |
| 100 | notification play/stop | — | media controls while backgrounded | |
| 101 | transcriber (from the transcription session) | old transcriber | new: onset picker, drift-tolerant grid, trained kick/snare/hat, lead-in click removal, legato lengths | B |
