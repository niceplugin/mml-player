import type { MML } from './index.ts'
import type { PlayNoteOptions, PlaybackTiming } from './types.ts'
import { noteToFrequency } from './composables/note-to-frequency'

const DEFAULT_FADE_DURATION = 0.01

/**
 * 로드된 샘플을 재생하거나 사인파로 폴백해 재생한다.
 */
export function playSample(this: MML, options: PlayNoteOptions, timing: PlaybackTiming): void {
  const {
    name,
    note,
    duration = 1000,
    volume = 0.5,
  } = options
  const { contextTime, delay } = timing

  if (!Number.isFinite(duration)) {
    throw new TypeError('duration은 유한한 숫자여야 합니다.')
  }

  if (duration <= 0) {
    throw new RangeError('duration은 0보다 큰 값이어야 합니다.')
  }

  if (!Number.isFinite(volume)) {
    throw new TypeError('volume은 유한한 숫자여야 합니다.')
  }

  if (volume < 0 || volume > 1) {
    throw new RangeError('volume은 0 이상 1 이하의 값만 허용됩니다.')
  }

  if (!Number.isFinite(contextTime) || !Number.isFinite(delay)) {
    throw new TypeError('재생 타이밍 정보(contextTime, delay)는 유한한 숫자여야 합니다.')
  }

  if (contextTime < 0) {
    throw new RangeError('contextTime은 0 이상이어야 합니다.')
  }

  if (delay < 0) {
    throw new RangeError('delay는 0 이상이어야 합니다.')
  }

  const instrumentKey = name.trim().toLowerCase()
  const targetFrequency = noteToFrequency(note)
  const instrumentBuffers = this.buffers[instrumentKey]

  if (this.ctx.state === 'suspended') {
    // AudioContext가 일시 정지된 경우 재생 전에 재개한다.
    void this.ctx.resume().catch((error) => {
      const reason = error instanceof Error ? error.message : String(error)
      throw new Error(`AudioContext를 재개할 수 없습니다: ${ reason }`)
    })
  }

  if (!instrumentBuffers || Object.keys(instrumentBuffers).length === 0) {
    // 등록된 샘플이 없으면 사인파 폴백을 사용한다.
    playSineWave(this, targetFrequency, duration, volume, timing)
    return
  }

  const resolvedBuffer = resolveBuffer(instrumentBuffers, targetFrequency)

  if (!resolvedBuffer) {
    playSineWave(this, targetFrequency, duration, volume, timing)
    return
  }

  const {
    buffer,
    playbackRate,
  } = resolvedBuffer
  const source = this.ctx.createBufferSource()
  const gainNode = this.ctx.createGain()
  const gainValue = convertVolumeToGain(volume)
  const startTime = contextTime + delay
  const durationSeconds = duration / 1000
  const stopTime = startTime + durationSeconds

  if (!Number.isFinite(startTime) || startTime < 0) {
    throw new RangeError('재생 시작 시간은 0 이상이어야 합니다.')
  }

  source.buffer = buffer
  source.loop = false
  source.playbackRate.value = playbackRate
  gainNode.gain.value = 0

  source.connect(gainNode)
  gainNode.connect(this.masterGain)

  scheduleGainEnvelope(gainNode, startTime, durationSeconds, gainValue)

  source.addEventListener('ended', () => {
    source.disconnect()
    gainNode.disconnect()
  }, { once: true })
  source.start(startTime)
  source.stop(stopTime)
}

/**
 * 준비된 버퍼 집합에서 목표 주파수와 가장 가까운 버퍼를 골라 재생 속도를 계산한다.
 *
 * @param buffers 주파수-버퍼 매핑
 * @param targetFrequency 재생하고자 하는 목표 주파수
 */
function resolveBuffer(buffers: Record<number, AudioBuffer>, targetFrequency: number): {
  buffer: AudioBuffer;
  playbackRate: number
} | null {
  const exactBuffer = buffers[targetFrequency]

  if (exactBuffer) {
    return {
      buffer: exactBuffer,
      playbackRate: 1,
    }
  }

  const availableFrequencies = Object.keys(buffers)
    .map((frequencyText) => Number.parseFloat(frequencyText))
    .filter((frequencyValue) => Number.isFinite(frequencyValue))

  if (availableFrequencies.length === 0) {
    return null
  }

  let nearestFrequency = availableFrequencies[0]
  let smallestDiff = Math.abs(nearestFrequency - targetFrequency)

  for (let index = 1; index < availableFrequencies.length; index += 1) {
    const candidate = availableFrequencies[index]
    const diff = Math.abs(candidate - targetFrequency)

    if (diff < smallestDiff) {
      nearestFrequency = candidate
      smallestDiff = diff
    }
  }

  const buffer = buffers[nearestFrequency]
  if (!buffer) {
    return null
  }

  const playbackRate = targetFrequency / nearestFrequency

  if (!Number.isFinite(playbackRate) || playbackRate <= 0) {
    return null
  }

  // 가장 가까운 샘플 버퍼를 찾아 재생 속도로 보정한다.
  return {
    buffer,
    playbackRate,
  }
}

/**
 * 샘플 폴백이 실패한 경우 사인파 음원을 생성해 동일한 구성으로 재생한다.
 *
 * @param contextOwner AudioContext를 소유한 MML 인스턴스
 * @param frequency 재생할 주파수(Hz)
 * @param duration 재생 시간(ms)
 * @param volume 입력 볼륨(0~1)
 */
function playSineWave(contextOwner: MML, frequency: number, duration: number, volume: number, timing: PlaybackTiming): void {
  const oscillator = contextOwner.ctx.createOscillator()
  const gainNode = contextOwner.ctx.createGain()
  const gainValue = convertVolumeToGain(volume)
  const startTime = timing.contextTime + timing.delay
  const durationSeconds = duration / 1000
  const stopTime = startTime + durationSeconds

  oscillator.type = 'sine'
  oscillator.frequency.value = frequency
  gainNode.gain.value = 0

  oscillator.connect(gainNode)
  gainNode.connect(contextOwner.masterGain)

  scheduleGainEnvelope(gainNode, startTime, durationSeconds, gainValue)

  oscillator.addEventListener('ended', () => {
    oscillator.disconnect()
    gainNode.disconnect()
  }, { once: true })

  oscillator.start(startTime)
  oscillator.stop(stopTime)
}

/**
 * 선형 볼륨 값을 지각상 자연스러운 Gain 값으로 변환한다.
 *
 * @param volume 입력 볼륨(0~1)
 * @returns Gain 노드에 설정할 값
 */
function convertVolumeToGain(volume: number): number {
  if (volume === 0) {
    return 0
  }

  const minDb = -60
  const maxDb = 0
  const dB = minDb + (maxDb - minDb) * volume

  return Math.pow(10, dB / 20)
}

/**
 * 재생 시 클릭음을 줄이기 위한 간단한 페이드 인/아웃 엔벨로프를 설정한다.
 */
function scheduleGainEnvelope(gainNode: GainNode, startTime: number, durationSeconds: number, targetGain: number): void {
  const gainParam = gainNode.gain
  const fadeDuration = Math.min(DEFAULT_FADE_DURATION, durationSeconds / 2)
  const stopTime = startTime + durationSeconds
  const fadeOutStart = Math.max(startTime, stopTime - fadeDuration)

  gainParam.cancelScheduledValues(startTime)
  gainParam.setValueAtTime(0, startTime)

  if (fadeDuration > 0) {
    gainParam.linearRampToValueAtTime(targetGain, startTime + fadeDuration)
  } else {
    gainParam.setValueAtTime(targetGain, startTime)
  }

  if (fadeOutStart > startTime + fadeDuration) {
    gainParam.setValueAtTime(targetGain, fadeOutStart)
  }

  if (fadeDuration > 0) {
    gainParam.linearRampToValueAtTime(0, stopTime)
  } else {
    gainParam.setValueAtTime(0, stopTime)
  }
}
