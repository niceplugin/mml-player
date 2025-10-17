import type { MML } from './index.ts'

/**
 * 오디오 파일을 가져와 AudioBuffer로 디코딩한다.
 *
 * @param {string} path 오디오 파일 경로
 * @returns {Promise<AudioBuffer>} 디코딩된 오디오 버퍼
 * @throws {Error} 네트워크 응답이 실패한 경우
 */
export async function fetchAudioBuffer(this: MML, path: string): Promise<AudioBuffer> {
  const response = await fetch(path)

  if (!response.ok) {
    throw new Error(`오디오 파일을 가져오지 못했습니다: ${ path }`)
  }

  const arrayBuffer = await response.arrayBuffer()

  return this.ctx.decodeAudioData(arrayBuffer)
}
