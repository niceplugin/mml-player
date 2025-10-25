# mml-player

TypeScript library for interpreting “music make language” (MML) strings and scheduling them with the Web Audio API. The player prefers decoded audio samples and falls back to a synthesized sine wave whenever nothing else is available.

## Features
- Parse canonical `MML@ … ;` scores (tempo, octave, volume, length, dotted notes, rests) into per-instrument tracks
- Support multi-staff scores separated by commas; tracks share the same start time while preserving their individual timing
- Load instrument samples from URLs, `File`, or `Blob` objects and index them by instrument/frequency
- Resolve the nearest recorded frequency, adjust playback rate automatically, or synthesize a sine wave fallback
- Track every active source/gain pair for reliable `stop()` fades and `stopped` state checks
- Render scores offline via `mmlToWavUrl` to obtain a downloadable WAV `ObjectURL`

## Installation
Install the package once it is published to npm:

```bash
npm install mml-player
```

## Quick Start
```ts
import { MML } from 'mml-player'

const player = new MML()

// Optionally preload samples (returns a boolean or boolean[])
await player.loadSamples([
  { name: 'piano', note: 'C4', path: '/audio/piano-c4.wav' },
  { name: 'piano', note: 'E4', path: '/audio/piano-e4.wav' },
])

// Basic “music make language” string
const score = 'MML@ T120 O4 V12 L4 cdefgab>c;'

// Passing an instrument name links the parsed notes to the loaded buffers.
player.play(score, 'piano')
```

Most browsers require a user gesture before starting audio playback. Create the `MML` instance (or resume the context) inside a click/tap handler.

## Working with MML Strings
- Prefix scores with `MML@` and terminate them with `;`.
- Separate simultaneous staffs with commas: `MML@ T96 cdef, O3 V10 g4e4c4;`.
- Tempo (`T`), octave (`O`), volume (`V`), and default length (`L`) directives stay in effect until they are changed.
- Use `+`/`-` for sharps/flats, `.` for dotted notes, `R` for rests, and `<`/`>` to shift octaves.
- `N(0~96)` syntax is not supported.

The parser returns a track per staff. Each entry contains the instrument name you passed to `play`, the resolved note, duration in milliseconds, and a normalized volume value.

## Sample Loading
- `player.loadSamples(source)` accepts either a single `AudioFilePath` or an array.
- Each entry must provide `name`, `note`, and `path`.
- Successful loads return `true`; failures return `false` and playback falls back to a generated sine wave.
- Samples are stored per instrument and frequency (Hz). If the requested pitch is missing, the closest available buffer is reused with an adjusted playback rate.

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
- `player.stop()`: Fade out all active nodes, dispose them, and rebuild the master gain.
- `player.stopped`: Read-only getter that reports whether every active node has finished.

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

## Exporting to WAV
Use `mmlToWavUrl` to render the same score offline and get a downloadable WAV blob URL. The method reuses loaded samples when they exist and otherwise mirrors the sine-wave fallback.

```ts
const url = await player.mmlToWavUrl(score, 'piano')

const link = document.createElement('a')
link.href = url
link.download = 'score.wav'
link.click()

URL.revokeObjectURL(url)
```

The returned URL should be revoked when you no longer need it to release the associated memory.

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

type PlaybackTiming = {
  contextTime: number // Captured AudioContext time
  delay: number       // Seconds to wait before starting
}

type PlayNoteTrack = PlayNoteOptions[]
```

`mmlToNote` supports the usual MML directives (`T`, `O`, `V`, `L`, `R`, `<`, `>`, `.`, and accidentals with `+`/`-`). Multi-track scores simply combine several parsed `PlayNoteTrack` arrays.
