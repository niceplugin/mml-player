import type { MML } from './index.ts'
import type { AudioFilePath } from './types.ts'
import { loadSingleSample } from './load-single-sample'

/**
 * 단일 또는 복수의 오디오 샘플 경로를 받아 AudioBuffer로 로드한다.
 *
 * @param {AudioFilePath | AudioFilePath[]} source 로드할 샘플 경로 혹은 경로 배열
 * @returns {Promise<boolean | boolean[]>} 입력 형태에 맞게 로드 성공 여부 또는 성공 여부 배열 반환
 */

export async function loadSamples(this: MML, source: AudioFilePath): Promise<boolean>
export async function loadSamples(this: MML, source: AudioFilePath[]): Promise<boolean[]>
export async function loadSamples(this: MML, source: AudioFilePath | AudioFilePath[]): Promise<boolean | boolean[]>
export async function loadSamples(this: MML, source: AudioFilePath | AudioFilePath[]): Promise<boolean | boolean[]> {
  // 단일/다중 샘플 모두를 처리할 수 있도록 입력을 배열로 정규화한다.
  const files = Array.isArray(source) ? source : [ source ]
  const results: boolean[] = []

  // 모든 샘플을 순차적으로 로드해 결과를 누적한다.
  for (const file of files) {
    results.push(await loadSingleSample.call(this, file))
  }

  return Array.isArray(source) ? results : results[0] || false
}
