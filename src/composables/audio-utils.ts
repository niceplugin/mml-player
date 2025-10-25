export const DEFAULT_FADE_DURATION = 0.01

/**
 * 페이드 인/아웃 엔벨로프를 AudioParam에 적용한다.
 *
 * @param {AudioParam} param 조정할 AudioParam
 * @param {number} startTime 재생 시작 시간(초)
 * @param {number} durationSeconds 재생 길이(초)
 * @param {number} targetGain 목표 게인 값
 * @returns {void} 반환값 없음
 */
export function scheduleGainEnvelope(param: AudioParam, startTime: number, durationSeconds: number, targetGain: number): void {
  const fadeDuration = DEFAULT_FADE_DURATION
  const stopTime = startTime + durationSeconds
  const fadeOutStart = Math.max(startTime, stopTime - fadeDuration)

  param.cancelScheduledValues(startTime)
  param.setValueAtTime(0, startTime)

  // 페이드 인 구간이 존재하는지 확인한다.
  if (fadeDuration > 0) {
    param.linearRampToValueAtTime(targetGain, startTime + fadeDuration)
  } else {
    param.setValueAtTime(targetGain, startTime)
  }

  // 페이드 아웃 시작 시점을 조정한다.
  if (fadeOutStart > startTime + fadeDuration) {
    param.setValueAtTime(targetGain, fadeOutStart)
  }

  // 페이드 아웃 구간이 존재하는지 확인한다.
  if (fadeDuration > 0) {
    param.linearRampToValueAtTime(0, stopTime)
  } else {
    param.setValueAtTime(0, stopTime)
  }
}

/**
 * 목표 주파수와 가장 가까운 버퍼를 선택해 재생 속도를 계산한다.
 *
 * @param {Record<number, AudioBuffer>} buffers 주파수-버퍼 매핑
 * @param {number} targetFrequency 원하는 재생 주파수
 * @returns {{ buffer: AudioBuffer; playbackRate: number } | null} 선택된 버퍼와 속도 또는 null
 */
export function resolveBuffer(buffers: Record<number, AudioBuffer>, targetFrequency: number): {
  buffer: AudioBuffer
  playbackRate: number
} | null {
  const exactBuffer = buffers[targetFrequency]

  // 동일 주파수 버퍼가 있는지 확인한다.
  if (exactBuffer) {
    return {
      buffer: exactBuffer,
      playbackRate: 1,
    }
  }

  const availableFrequencies = Object.keys(buffers)
    .map((frequencyText) => Number.parseFloat(frequencyText))
    .filter((frequencyValue) => Number.isFinite(frequencyValue))

  // 사용 가능한 주파수가 있는지 확인한다.
  if (availableFrequencies.length === 0) {
    return null
  }

  let nearestFrequency = availableFrequencies[0]
  let smallestDiff = Math.abs(nearestFrequency - targetFrequency)

  // 더 가까운 주파수를 찾기 위해 순회한다.
  for (let index = 1; index < availableFrequencies.length; index += 1) {
    const candidate = availableFrequencies[index]
    const diff = Math.abs(candidate - targetFrequency)

    // 차이가 더 작다면 후보를 갱신한다.
    if (diff < smallestDiff) {
      nearestFrequency = candidate
      smallestDiff = diff
    }
  }

  const buffer = buffers[nearestFrequency]
  // 선택된 주파수에 버퍼가 존재하는지 확인한다.
  if (!buffer) {
    return null
  }

  const playbackRate = targetFrequency / nearestFrequency

  // 재생 속도가 유효한지 확인한다.
  if (!Number.isFinite(playbackRate) || playbackRate <= 0) {
    return null
  }

  return {
    buffer,
    playbackRate,
  }
}
