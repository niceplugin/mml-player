import { AudioBufferStore, AudioFilePath, InstrumentName, PlaybackTiming, PlayNoteOptions, TrackedPlaybackNode } from './types'
import { loadSamples } from './load-samples'
import { playSample } from './play-sample'
import { mmlToNote } from './composables/mms-to-note'
import { stopMml } from './stop-mml'
import { stopped } from './stopped'
import { playMml } from './play-mml'

export class MML {
  public ctx: AudioContext
  public readonly buffers: AudioBufferStore = {}
  public masterGain: GainNode
  public readonly activeNodes: Set<TrackedPlaybackNode> = new Set()

  /**
   * MML 플레이어 인스턴스를 초기화한다.
   * AudioContext와 기본 마스터 게인을 구성한다.
   */
  constructor() {
    this.ctx = new AudioContext()
    this.masterGain = this.ctx.createGain()
    this.masterGain.gain.value = 1
    this.masterGain.connect(this.ctx.destination)
  }

  /**
   * 현재 MML을 재생 중인지 여부를 반환한다.
   *
   * @returns {boolean} 재생 중인 노드가 없으면 true
   */
  get stopped() {
    return stopped.call(this)
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

  /**
   * MML 문자열을 오디오로 재생한다.
   *
   * @param {string} mml 재생할 MML 문자열
   * @param {InstrumentName} [name] 사용할 악기 이름
   */
  play(mml: string, name: InstrumentName = '_'): void {
    const tracks = mmlToNote(mml, name)

    playMml.call(this, tracks)
  }

  /**
   * 재생중인 MML 오디오를 중지한다.
   */
  stop() {
    stopMml.call(this)
  }
}
