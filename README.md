# Strudoodle

An Android app that plays [Strudel](https://strudel.cc) patterns and writes them by ear: press **Listen**, play or hum something for eight seconds, and it comes back as a pattern (tempo, notes on a 16th grid, noise hits, a key guess) and plays. Signal processing only, no model.

## Build

Needs a JDK 17 and an Android SDK (platform 35, build-tools 36.0.0); paths in `gradle.properties` and `local.properties`.

```
.\gradlew.bat assembleDebug
.\gradlew.bat installDebug
.\adb.cmd logcat -s Strudoodle
```

## How it works

One `WebView` serves `app/src/main/assets/www` through `WebViewAssetLoader`, so the page gets a secure origin and Strudel's audio worklets load. The page bundles `@strudel/web` (AGPL-3.0, licence beside it) and exposes `play(code)` / `stop()`, which Kotlin can call too. See `CLAUDE.md` for the details and the gotchas.

The page is plain HTML, so `cd web && npm run serve` runs the same thing in a desktop browser, laptop mic included. `node --test test/listen.test.mjs` checks the transcriber on a synthetic phrase.
