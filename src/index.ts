import type { AudioBufferStore, AudioFilePath, PlayNoteOptions } from './types'
import { loadSamples } from './load-samples'
import { playSample } from './play-sample'

export class MML {
  public ctx: AudioContext
  public readonly buffers: AudioBufferStore = {}

  constructor() {
    this.ctx = new AudioContext()
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
   */
  playSample(options: PlayNoteOptions): void {
    playSample.call(this, options)
  }
}
