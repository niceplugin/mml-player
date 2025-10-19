import {
  AudioBufferStore,
  AudioFilePath,
  InstrumentName,
  PlayNoteOptions,
  PlaybackTiming,
  TrackedPlaybackNode,
} from './types'
import { loadSamples } from './load-samples'
import { playSample } from './play-sample'
import { mmlToNote } from './composables/mms-to-note'
import { stop } from './stop'

export class MML {
  public ctx: AudioContext
  public readonly buffers: AudioBufferStore = {}
  public masterGain: GainNode
  public readonly activeNodes: Set<TrackedPlaybackNode> = new Set()

  constructor() {
    this.ctx = new AudioContext()
    this.masterGain = this.ctx.createGain()
    this.masterGain.gain.value = 1
    this.masterGain.connect(this.ctx.destination)
  }

  /**
   * 오디오 샘플을 로드하여 악기별/주파수별 버퍼에 적재한다.
   *
   * @param {AudioFilePath | AudioFilePath[]} source 로드할 오디오 샘플 경로
   * @returns {Promise<boolean | boolean[]>} 단일 입력 시 boolean, 배열 입력 시 boolean[] 결과
   */
  async loadSamples(source: AudioFilePath): Promise<boolean>
  async loadSamples(source: AudioFilePath[]): Promise<boolean[]>
  async loadSamples(source: AudioFilePath | AudioFilePath[]): Promise<boolean | boolean[]>
  async loadSamples(source: AudioFilePath | AudioFilePath[]): Promise<boolean | boolean[]> {
    return await loadSamples.call(this, source)
  }

  /**
   * 로드된 샘플을 재생하거나 필요 시 사인파로 재생한다.
   *
   * @param {PlayNoteOptions} options 재생 옵션
   * @param {PlaybackTiming} [timing] 캡처한 컨텍스트 시간(contextTime)과 재생 지연(delay), 생략 시 현재 컨텍스트 시간과 지연 0 사용
   */
  playSample(options: PlayNoteOptions, timing?: PlaybackTiming): void {
    const resolvedTiming: PlaybackTiming = timing ?? {
      contextTime: this.ctx.currentTime,
      delay: 0,
    }

    playSample.call(this, options, resolvedTiming)
  }

  play(mml: string, name: InstrumentName = '_') {
    const notes = mmlToNote(mml, name)
  }

  stop() {
    stop.call(this)
  }
}
