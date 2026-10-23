// Run the page's transcriber on a WAV from the laptop: node scripts/transcribe.mjs takes/take.wav
// Prints what the phone's Log tab would, then the Strudel code. The take comes from the phone with
//   ./adb.cmd exec-out run-as com.bunnypuddlegames.strudoodle cat files/take.wav > takes/take.wav
import fs from 'node:fs';
import { transcribe, downsample, RATE } from '../app/src/main/assets/www/listen.mjs';
import { readWav } from './wav.mjs';

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  const file = process.argv[2];
  if (!file) { console.error('usage: node scripts/transcribe.mjs <take.wav>'); process.exit(1); }
  const { rate, data } = readWav(fs.readFileSync(file));
  const sounds = JSON.parse(fs.readFileSync(new URL('../app/src/main/assets/www/sounds.json', import.meta.url), 'utf8'));
  const f = Math.round(rate / RATE), r = transcribe(downsample(data, f), rate / f, { catalogue: sounds.sounds, instruments: sounds.instruments });
  let peak = 0; for (const v of data) peak = Math.max(peak, Math.abs(v));
  console.log(`${file}: ${(data.length / rate).toFixed(2)}s at ${rate} Hz, peak ${peak.toFixed(3)}`);
  console.log(`tempo ${JSON.stringify(r.tempo)} key ${JSON.stringify(r.key)} ${r.melodic ? 'melody' : 'beat'}${r.instrument ? ' on ' + r.instrument : ''}`);
  console.log(`events ${r.events.map((e) => `${e.t.toFixed(2)}:${e.midi ?? e.sound ?? e.voice ?? 'x'}`).join(' ')}`);
  console.log(r.code);
}
