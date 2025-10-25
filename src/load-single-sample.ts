import type { MML } from './index.ts'
import type { AudioFilePath } from './types.ts'
import { noteToFrequency } from './composables/note-to-frequency'
import { fetchAudioBuffer } from './fetch-audio-buffer'

/**
 * 개별 오디오 샘플을 로드해 AudioBuffer로 디코딩하고 버퍼에 저장한다.
 * 동일 악기·주파수 조합이 이미 존재할 경우 최신 버퍼로 교체한다.
 *
 * @param {AudioFilePath} file 로드할 오디오 샘플 정보
 * @returns {Promise<boolean>} 로드 성공 여부
 */
export async function loadSingleSample(this: MML, file: AudioFilePath): Promise<boolean> {
  try {
    const instrumentKey = file.name.trim().toLowerCase()
    const frequency = noteToFrequency(file.note)
    const audioBuffer = await fetchAudioBuffer.call(this, file.path)

    // 아직 버퍼 맵이 없다면 악기 키를 초기화한다.
    if (!this.buffers[instrumentKey]) {
      this.buffers[instrumentKey] = {}
    }

    this.buffers[instrumentKey][frequency] = audioBuffer

    return true
  }
  catch {
    return false
  }
}
