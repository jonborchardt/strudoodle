# Strudoodle — Android Strudel player, headed for "listen and transcribe"

Kotlin + one WebView running [Strudel](https://strudel.cc). **No IDE**: gradle build, adb deploy, logcat debug (same toolchain as `../earth`). App label "Strudoodle", package `com.bunnypuddlegames.strudoodle`.

Goal: listen to the microphone and turn what it hears into a Strudel pattern (key/notes, tempo/beat), with signal processing, no AI. The page has Play/Stop and **Listen 8s**, which records, transcribes in `listen.mjs` and plays the result.

## Build / run / debug

```
.\gradlew.bat assembleDebug          # compile check + APK (app/build/outputs/apk/debug/app-debug.apk)
.\gradlew.bat installDebug           # deploy to the connected phone
.\adb.cmd shell am start -n com.bunnypuddlegames.strudoodle/.MainActivity
.\adb.cmd logcat -s Strudoodle       # app + page console (strudel's own errors included)
.\adb.cmd shell run-as com.bunnypuddlegames.strudoodle cat files/page.log   # the page's Log tab, this launch, after the fact
```

**Round trip (ground truth without singing).** `test/fixtures/patterns.mjs` lists Strudel patterns with the mini-notation they must transcribe back to. `cd web && npm install && npm run fixtures` renders them to `test/fixtures/*.wav` with strudel itself (a headless Chromium opens `assets/www/render.html`, an offline-render helper after strudle's, served from a local port; strudle's local packs are served under `/samples/packs/` so a fixture can play real samples, and the renderer also evaluates each transcription to prove the output is Strudel that plays). `node --test test/roundtrip.test.mjs` then transcribes each wav and compares bpm (±3%), the note track and the hit track exactly. Add a pattern there before tuning for a new kind of input; the wavs are committed so the test runs without a browser.

**Tuning loop for real takes.** Every Listen also saves the raw recording as `files/take.wav` on the phone. Pull it (binary-safe through the Bash tool, not PowerShell `>`), run the transcriber on it, compare with what was sung:

```
./adb.cmd exec-out run-as com.bunnypuddlegames.strudoodle cat files/take.wav > takes/<name>.wav
node scripts/transcribe.mjs takes/<name>.wav
```

`takes/` is gitignored (the user's voice). Iterate on `listen.mjs` against the take in node, then `installDebug`.

**Talking through the Log tab.** The user types into the input under the log; each line is logged as `you: …` (read `files/page.log`, newest at the end). To say something or ask a question, broadcast it to the app; it shows up in the Log tab at once as `claude: …` (a file inbox did not work: a run-as shell may read the app's files but SELinux lets it create none):

```
node scripts/say.mjs "Was that take a hum or a whistle?"        # quotes the text for the phone's shell; a bare `am broadcast --es text` keeps only the first word
./adb.cmd shell run-as com.bunnypuddlegames.strudoodle cat files/page.log | grep 'you:'
```

Poll the log (every 20..30 s is plenty) while waiting for an answer; the user said to assume Claude is polling.

**A/B tests.** `AB.md` is the ledger: 100 ideas by value, one under test at a time. The `AB` const in `index.html` names the test; `variant()` ('a' | 'b', the row under the buttons, kept in localStorage) is read wherever the two differ. The user types `a` or `b` into the log input; lock the winner in (delete the loser's code and the branch), fill the status column, put the next idea in `AB`, `installDebug`, and say what the new test is with a SAY broadcast.

**Takes and tracks.** Listen toggles: press to start, press again (or Stop) to finish; 60 s cap. Each take becomes a track in the list under the buttons (× removes it); the textarea shows every track in one stack at the first track's tempo (a later take is transcribed with that tempo fixed so the grids line up; playback is muted while recording, so the user keeps time by ear). `files/take.wav` is always the last take.

The page has a **Log** tab (a `<details>` under the status line). `log(line, isError)` writes there, to the console and to the android bridge, so one line is readable three ways: on the phone's screen, in logcat, and in `files/page.log`. Errors open the tab. Listen logs the mic settings, the recording's length and peak, the tempo and key objects and every event, so a wrong transcription can be read without a debugger. On desktop, `getLog()` in the console returns it all.

Toolchain is Unity 6000.3.5f2's bundled JDK 17 + Android SDK: `gradle.properties` (java home) and `local.properties` (sdk.dir, gitignored). Phone access always goes through `.\adb.cmd`; only app-scoped operations are pre-allowed in `.claude/settings.json`.

### Wireless debugging (no cable)

ADB has no Bluetooth transport; Android 11+ "Wireless debugging" runs over Wi-Fi, phone and PC on the same network.

1. Phone: Settings → Developer options → Wireless debugging → on. Once per PC, tap **Pair device with pairing code** and run `.\adb.cmd pair <ip:port> <code>` with what that dialog shows.
2. Every session: `.\adb.cmd connect <ip:port>` with the port on the Wireless debugging screen itself (not the pairing one; it changes per boot). `adb mdns services` is supposed to list the phone but finds nothing on this PC (multicast blocked), so when the port is unknown: `node scripts\findport.mjs <phone-ip> 30000 50000` prints the open one.
3. Then `installDebug` / `logcat` as usual.

Gotchas seen: an app launched by `am start` while the phone's screen is off is a *background* app in doze: Android blocks its network (DNS fails, sockets abort with "Software caused connection abort"), so the sample packs do not load and the page falls back to synth drums. `dumpsys deviceidle | grep mState` says IDLE and `dumpsys connectivity` lists the uid with blockedReasons. Not a bug; the page retries the packs before each Listen. The pairing dialog can print its address as `localhost:<port>`; use the phone's real IP. A pair attempt with a stale code fails as `protocol fault (couldn't read status message)`, not "wrong password": reopen the dialog and use the fresh code and port together.

The page also runs in a desktop browser (`cd web && npm run serve`, then open the URL): same code, faster loop for anything that is not Android-specific. Debug builds are inspectable from desktop Chrome at `chrome://inspect`.

## Layout

- `app/src/main/java/.../MainActivity.kt` — the WebView, served from assets by `WebViewAssetLoader` on `https://appassets.androidplatform.net` (a secure origin: strudel's AudioWorklets refuse `file://`). `play(code)` / `stop()` / `listen()` are the Kotlin → page seam; `android.log(line)` the page → Kotlin one (logcat tag `Strudoodle` + `files/page.log`). Mic needs both `RECORD_AUDIO` (runtime prompt) and `MODIFY_AUDIO_SETTINGS`, or getUserMedia fails with "Could not start audio source".
- `app/src/main/assets/www/index.html` — the page: textarea + Play/Stop/Listen, `initStrudel()`, `window.play(code)` / `stop()` / `listen(seconds)`. Recording is raw `getUserMedia` (echo cancellation, noise suppression and AGC off: they eat transients) through a ScriptProcessor.
- `app/src/main/assets/www/listen.mjs` — the transcriber, pure functions, no DOM: downsample to 16 kHz → onset strength (rise of log RMS, 20 ms window every 5 ms) → tempo candidates by autocorrelation (lifted from strudle's `web/sampler.mjs`) → onsets by peak picking (median + 3·MAD floor) → a pitch track (YIN every 10 ms) segmented into notes where the pitch moves (a voice slurs: no onset, only a new pitch) → merged with the onsets (a repeated note, an unpitched hit, a sharper time for a segment start) → a take whose time is more than 40% pitched is a *melody* (counting onsets misjudged a singer with hard consonants) → in a melody an unpitched onset is the consonant of the note within .4 s after it when the level between them never falls away (a hit decays to nothing first), else a note the segmenter lost when the pitch track right after it is stable (a piano under its own ring), else a hit if as loud as the singing (a clap), else a breath (dropped); in a beat a pitched blip under 120 ms or a pitched one-off among many hits is a hit → key by Krumhansl-Schmuckler → bpm chosen among autocorrelation and inter-onset candidates by grid fit, nearest 113 among the fits → quantisation: a melody drifts, so each gap is rounded to a musical length (powers of two in 16ths) and positions accumulate; a beat keeps a clock, so its grid is absolute and a flam collapses into its 16th → a beat's hits get a drum voice by clustering their spectral centroids (k-means on log centroid, up to three groups, named low to high bd / sd / hh; relative because a phone-mic beatbox has nothing above 5 kHz; a pitched blip under 120 ms in a beat is a hit, an 808 snare's body) → with a catalogue, each cluster plays the real sample nearest its mean features (centroid, shares under 150 Hz and over 5 kHz, flatness, decay to −30 dB; with two or more clusters only samples of the cluster's kind by name) → one `note(...)` track with held lengths (`c4@3`) and one `s("RolandTR808_bd").struct("x ~ ...")` line per drum voice, or the three synth voices (`VOICES`: sine kick with a pitch envelope, filtered-noise snare and hat) as `const`s at the top of the pattern when the packs are not loaded, one cycle per bar.
- `app/src/main/assets/www/sounds.json` — the catalogue: 721 drum-ish sounds of strudel's packs (tidal-drum-machines, uzu-drumkit, Dirt-Samples, mridangam) with features measured by `hitFeatures` itself at 16 kHz, 77 pitched instruments (vcsl's 73 plus the four synth waveforms) measured by `toneFeatures` on their note nearest C4 (brightness over the fundamental, flatness, attack, sustain late over early), each with its octave `offset` (most sustained vcsl instruments' "C4" file sounds C5; the transcription writes `.transpose(-12)` for them), plus the CDN urls of the packs. A melody's notes play the instrument nearest the mean tone features of its notes, chosen from `MELODY_POOL` (plain articulations: pianos, harps, mallets, organs, sustained winds, the synths); the full 77 are measured, but four features cannot keep a hummed line off a tremolo zither or a tubular bell, and those sounded wrong. Rebuilt by `node scripts/catalogue.mjs` from `../strudle/samples/packs` (strudle's downloaded packs and its `.meta.json` voice words). The page registers the packs from the Strudel CDN at init (`sounds.json._packs`, `aliasBank` for the machine aliases) and passes the catalogue to `transcribe`; without network it logs why and the synth voices stand in. `node --test test/listen.test.mjs test/roundtrip.test.mjs` pins it.
- `app/src/main/assets/www/strudel/` — the `@strudel/web` bundle, committed. Refresh with `cd web && npm install && npm run sync` (version pinned in `web/package.json`).
- Single module, single activity, one page. Keep it that way until it hurts.

## Hard-won facts

- Strudel's `sync: true` scheduler clocks via `SharedWorker`, which Android WebView does not implement. Leave `initStrudel()` at the default (`setInterval` cyclist on the page thread). It stops when the app is backgrounded; `onPause` hushes explicitly so it does not stutter back to life.
- `mediaPlaybackRequiresUserGesture = false` so a `play()` driven from Kotlin can start the AudioContext without a tap.
- Sample packs (`samples(...)`, `s("bd sd")`) stream from the Strudel CDN and need network; the hello-world pattern is synth-only so it works offline.

## Conventions

- Minimal deps: `androidx.webkit` only (load-bearing, see above). Platform APIs over libraries.
- Keys never committed; `local.properties` is gitignored.
- Analysis lives in JS in the page, by choice: it is the runtime already there, the mic comes with Web Audio, and the desktop browser runs the identical code. Python on device (Chaquopy) was considered and skipped (no librosa, and it did not support the PC's Python 3.14 as build host). Kotlin DSP (TarsosDSP) is the fallback if JS is ever too slow.
- Transcription limits, by design: monophonic pitch (one note per 16th, the first wins; a sample that rings under the next note is a chord it does not read, so its own output uses `.clip(1)`), one onset is one thing (a hit on a note's 16th is lost), a melody (more than two thirds pitched) drops its unpitched onsets (breaths, but also a clap), drum voices are three and relative to the take, one instrument per take (the mean of its notes), bar 1 starts at the first onset (no downbeat detection), tempo assumed 120 when nothing periodic is heard, sung intonation is reported as sung (no snapping to the key). YIN has no octave correction on purpose: a "prefer the deeper double-period dip" step misread vibrato notes an octave low, and every octave "error" seen so far was a sample labelled an octave off. Thresholds in `listen.mjs` are marked `ponytail:` for tuning on real recordings.
