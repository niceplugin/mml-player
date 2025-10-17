import type { AudioBufferStore, AudioFilePath } from './types'
import { loadSamples } from './load-samples'

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

  play(note: string, duration: number = 1000, volume: number = 1): void {
    // TODO: 로드된 버퍼를 참조해 재생 로직을 구현한다.
  }
}
