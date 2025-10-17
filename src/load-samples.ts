import type { MML } from './index.ts'
import type { AudioFilePath } from './types.ts'
import { loadSingleSample } from './load-single-sample'

export async function loadSamples(this: MML, source: AudioFilePath): Promise<boolean>
export async function loadSamples(this: MML, source: AudioFilePath[]): Promise<boolean[]>
export async function loadSamples(this: MML, source: AudioFilePath | AudioFilePath[]): Promise<boolean | boolean[]>
export async function loadSamples(this: MML, source: AudioFilePath | AudioFilePath[]): Promise<boolean | boolean[]> {
  // 단일/다중 샘플 모두를 처리할 수 있도록 입력을 배열로 정규화한다.
  const files = Array.isArray(source) ? source : [ source ]
  const results: boolean[] = []

  for (const file of files) {
    results.push(await loadSingleSample.call(this, file))
  }

  return Array.isArray(source) ? results : results[0] || false
}
