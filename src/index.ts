import { AudioBufferStore, AudioFilePath, InstrumentName, PlaybackTiming, PlayNoteOptions, TrackedPlaybackNode } from './types'
import { loadSamples } from './load-samples'
import { playSample } from './play-sample'
import { mmlToNote } from './composables/mms-to-note'
import { stopMml } from './stop-mml'
import { stopped } from './stopped'
import { playMml } from './play-mml'
import { mmlToWavUrl } from './mml-to-wav-url'

export class MML {
  public ctx: AudioContext
  public readonly buffers: AudioBufferStore = {}
  public masterGain: GainNode
  public readonly activeNodes: Set<TrackedPlaybackNode> = new Set()

  /**
   * Creates a new MML player.
   * Sets up the AudioContext and the master gain node.
   */
  constructor() {
    this.ctx = new AudioContext()
    this.masterGain = this.ctx.createGain()
    this.masterGain.gain.value = 1
    this.masterGain.connect(this.ctx.destination)
  }

  /**
   * Tells if the MML playback is currently stopped.
   *
   * @returns {boolean} True when there are no active nodes
   */
  get stopped(): boolean {
    return stopped.call(this)
  }

  /**
   * Loads audio samples and stores them per instrument and pitch.
   *
   * @param {AudioFilePath | AudioFilePath[]} source Sample path or list of paths to load
   * @returns {Promise<boolean | boolean[]>} Returns a boolean for one path, or an array for many paths
   */
  async loadSamples(source: AudioFilePath): Promise<boolean>

  async loadSamples(source: AudioFilePath[]): Promise<boolean[]>

  async loadSamples(source: AudioFilePath | AudioFilePath[]): Promise<boolean | boolean[]>

  async loadSamples(source: AudioFilePath | AudioFilePath[]): Promise<boolean | boolean[]> {
    return await loadSamples.call(this, source)
  }

  /**
   * Plays a loaded sample or falls back to a sine wave.
   *
   * @param {PlayNoteOptions} options Playback options to use
   * @param {PlaybackTiming} [timing] Captured context time and delay; uses current time with zero delay when omitted
   * @returns {void}
   */
  playSample(options: PlayNoteOptions, timing?: PlaybackTiming): void {
    const resolvedTiming: PlaybackTiming = timing ?? {
      contextTime: this.ctx.currentTime,
      delay: 0,
    }

    playSample.call(this, options, resolvedTiming)
  }

  /**
   * Plays an MML string as audio.
   *
   * @param {string} mml The MML string to play
   * @param {InstrumentName} [name] Instrument name to use
   * @returns {void}
   */
  play(mml: string, name: InstrumentName = '_'): void {
    const tracks = mmlToNote(mml, name)

    playMml.call(this, tracks)
  }

  /**
   * Stops any MML audio that is playing.
   *
   * @returns {void}
   */
  stop(): void {
    stopMml.call(this)
  }

  /**
   * Creates a WAV audio URL that can be played or downloaded right away.
   *
   * @param {string} mml The MML string to render
   * @param {InstrumentName} [name] Instrument name to use
   * @returns {Promise<string>} The created WAV object URL
   */
  async mmlToWavUrl(mml: string, name: InstrumentName = '_'): Promise<string> {
    const tracks = mmlToNote(mml, name)

    return mmlToWavUrl.call(this, tracks)
  }
}
