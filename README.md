# mml-player

TypeScript library for interpreting “music make language” (MML) strings and playing them through the Web Audio API. The player can stream decoded audio samples when they are available and falls back to synthesized sine waves when they are not.

## Features
- Parse canonical `MML@ ... ;` strings into note, timing, and velocity information
- Load instrument samples from URLs, `File`, or `Blob` objects via `fetch`
- Choose the closest matching sample by frequency and adjust playback rate automatically
- Fallback to an `OscillatorNode` sine wave whenever a sample is missing or fails to load
- Track active nodes so you can stop playback with a gentle fade-out

## Installation
Install the package once it is published to npm:

```bash
npm install mml-player
```

## Quick Start
```ts
import { MML } from 'mml-player'

const player = new MML()

// Optionally preload some samples (returns a boolean or boolean[])
await player.loadSamples([
  { name: 'piano', note: 'C4', path: '/audio/piano-c4.wav' },
  { name: 'piano', note: 'E4', path: '/audio/piano-e4.wav' },
])

// Basic “music make language” string
const score = 'MML@ T120 O4 V12 L4 cdefgab>c;'

// If the instrument name is omitted, it will be played as a sine wave.
player.play(score, 'piano')
```

Audio playback must be triggered by a user gesture in most browsers; create the `MML` instance after a click/tap handler has fired.

## Sample Loading
- `player.loadSamples(source)` accepts either a single `AudioFilePath` or an array.
- Each entry must include `name`, `note`, and `path`.
- Successful loads return `true`; failures return `false` and fall back to generated audio at runtime.
- Samples are stored per instrument and per frequency (Hz). If the requested note is not available, the closest frequency is reused and playback rate is adjusted.

```ts
const success = await player.loadSamples({
  name: 'lead',
  note: 'A4',
  path: new URL('./lead-a4.ogg', import.meta.url).href,
})

if (!success) {
  console.warn('Sample could not be loaded. The sine fallback will be used.')
}
```

## Playback API
- `player.play(mml, instrument?)`: Parse and schedule an entire MML string. REST tokens consume timing without creating nodes.
- `player.playSample(options, timing?)`: Manually schedule a single note. Useful when you need tight integration with your own sequencer.
- `player.stop()`: Fade out all active nodes and reset the master gain.
- `player.stopped`: Read-only getter that returns `true` when no nodes are active.

`playSample` accepts:

```ts
player.playSample(
  {
    name: 'pad',
    note: 'C#5',
    duration: 800, // milliseconds
    volume: 0.6,   // linear 0~1
  },
  {
    contextTime: player.ctx.currentTime,
    delay: 0.25,   // seconds
  },
)
```

All Web Audio nodes are connected through an internal master gain. You can modify `player.masterGain` (or connect it to downstream effects) after instantiation.

## Types
```ts
type AudioFilePath = {
  name: string        // Instrument identifier
  note: string        // e.g., "C4", "A#3"
  path: string        // URL or browser-resolvable location
}

type PlayNoteOptions = {
  name: string
  note: string
  duration?: number   // defaults to 1000 ms
  volume?: number     // 0~1, converted to an equal-power gain curve
}
```

`mmlToNote` supports the usual MML directives (`T`, `O`, `V`, `L`, `R`, `<`, `>`, `.`, and accidentals with `+`/`-`).
