// Say something into the phone's Log tab: node scripts/say.mjs "your text"
// An Android broadcast the app forwards to the page (MainActivity's receiver). `adb shell` hands its argument to the
// phone's shell as one string, which re-splits on spaces, so the text is quoted for that shell here.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const text = process.argv.slice(2).join(' ');
if (!text) { console.error('usage: node scripts/say.mjs "text"'); process.exit(1); }
const adb = /"([^"]+adb\.exe)"/.exec(fs.readFileSync(path.resolve(import.meta.dirname, '../adb.cmd'), 'utf8'))?.[1] ?? 'adb';
const quoted = "'" + text.replace(/'/g, `'\\''`) + "'"; // single-quoted for /system/bin/sh, embedded quotes closed-escaped-reopened
const r = spawnSync(adb, ['shell', `am broadcast -a com.bunnypuddlegames.strudoodle.SAY -p com.bunnypuddlegames.strudoodle --es text ${quoted}`], { encoding: 'utf8' });
if (r.status !== 0 || !/Broadcast completed/.test(r.stdout)) { console.error(r.stdout, r.stderr); process.exit(1); }
console.log('said:', text);
