import type { MML } from './index.ts'
import type { PlaybackTiming, PlayNoteOptions, TrackedPlaybackNode } from './types.ts'
import { noteToFrequency } from './composables/note-to-frequency'
import { resolveBuffer, scheduleGainEnvelope } from './composables/audio-utils'

/**
 * 로드된 샘플을 재생하거나 사인파로 폴백해 재생한다.
 *
 * @param {PlayNoteOptions} options 재생할 음표 옵션
 * @param {PlaybackTiming} timing AudioContext 시간과 지연 정보
 * @returns {void} 반환값 없음
 */
export function playSample(this: MML, options: PlayNoteOptions, timing: PlaybackTiming): void {
  const {
    name,
    note,
    duration = 1000,
    volume = 0.8,
  } = options
  const {
    contextTime,
    delay,
  } = timing

  // duration이 유한한 숫자인지 확인한다.
  if (!Number.isFinite(duration)) {
    throw new TypeError('duration은 유한한 숫자여야 합니다.')
  }

  // duration이 양수인지 확인한다.
  if (duration <= 0) {
    throw new RangeError('duration은 0보다 큰 값이어야 합니다.')
  }

  // volume이 유한한 숫자인지 확인한다.
  if (!Number.isFinite(volume)) {
    throw new TypeError('volume은 유한한 숫자여야 합니다.')
  }

  // volume이 허용 범위인지 확인한다.
  if (volume < 0 || volume > 1) {
    throw new RangeError('volume은 0 이상 1 이하의 값만 허용됩니다.')
  }

  // 재생 타이밍 정보가 유효한지 확인한다.
  if (!Number.isFinite(contextTime) || !Number.isFinite(delay)) {
    throw new TypeError('재생 타이밍 정보(contextTime, delay)는 유한한 숫자여야 합니다.')
  }

  // contextTime이 음수가 아닌지 확인한다.
  if (contextTime < 0) {
    throw new RangeError('contextTime은 0 이상이어야 합니다.')
  }

  // delay가 음수가 아닌지 확인한다.
  if (delay < 0) {
    throw new RangeError('delay는 0 이상이어야 합니다.')
  }

  const instrumentKey = name.trim().toLowerCase()
  const targetFrequency = noteToFrequency(note)
  const instrumentBuffers = this.buffers[instrumentKey]

  // AudioContext가 일시 정지된 경우 재생 전에 재개한다.
  if (this.ctx.state === 'suspended') {
    void this.ctx.resume().catch((error) => {
      const reason = error instanceof Error ? error.message : String(error)
      throw new Error(`AudioContext를 재개할 수 없습니다: ${ reason }`)
    })
  }

  // 등록된 샘플이 없으면 사인파 폴백을 사용한다.
  if (!instrumentBuffers || Object.keys(instrumentBuffers).length === 0) {
    playSineWave(this, targetFrequency, duration, volume, timing)
    return
  }

  const resolvedBuffer = resolveBuffer(instrumentBuffers, targetFrequency)

  // 적절한 버퍼가 없으면 사인파로 대체한다.
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
  const startTime = contextTime + delay
  const durationSeconds = duration / 1000
  const stopTime = startTime + durationSeconds

  // 재생 시작 시간이 유효한지 확인한다.
  if (!Number.isFinite(startTime) || startTime < 0) {
    throw new RangeError('재생 시작 시간은 0 이상이어야 합니다.')
  }

  source.buffer = buffer
  source.loop = false
  source.playbackRate.value = playbackRate
  gainNode.gain.value = 0

  source.connect(gainNode)
  gainNode.connect(this.masterGain)

  scheduleGainEnvelope(gainNode.gain, startTime, durationSeconds, volume)

  registerPlaybackNode(this, source, gainNode)

  source.start(startTime)
  source.stop(stopTime)
}

/**
 * 샘플 폴백이 실패한 경우 사인파 음원을 생성해 동일한 구성으로 재생한다.
 *
 * @param contextOwner AudioContext를 소유한 MML 인스턴스
 * @param frequency 재생할 주파수(Hz)
 * @param duration 재생 시간(ms)
 * @param volume 입력 볼륨(0~1)
 * @param timing 재생 타이밍 정보
 * @returns {void} 반환값 없음
 */
function playSineWave(contextOwner: MML, frequency: number, duration: number, volume: number, timing: PlaybackTiming): void {
  const oscillator = contextOwner.ctx.createOscillator()
  const gainNode = contextOwner.ctx.createGain()
  const startTime = timing.contextTime + timing.delay
  const durationSeconds = duration / 1000
  const stopTime = startTime + durationSeconds

  oscillator.type = 'sine'
  oscillator.frequency.value = frequency
  gainNode.gain.value = 0

  oscillator.connect(gainNode)
  gainNode.connect(contextOwner.masterGain)

  scheduleGainEnvelope(gainNode.gain, startTime, durationSeconds, volume)

  registerPlaybackNode(contextOwner, oscillator, gainNode)

  oscillator.start(startTime)
  oscillator.stop(stopTime)
}

/**
 * 재생에 사용된 노드를 추적하여 해제 시 정리한다.
 *
 * @param {MML} owner 노드를 관리할 MML 인스턴스
 * @param {AudioScheduledSourceNode} source 재생 소스 노드
 * @param {GainNode} gainNode 게인 노드
 * @returns {void} 반환값 없음
 */
function registerPlaybackNode(owner: MML, source: AudioScheduledSourceNode, gainNode: GainNode): void {
  let disposed = false

  const trackedNode: TrackedPlaybackNode = {
    source,
    gainNode,
    /**
     * 재생 노드와 게인을 정리하고 추적 목록에서 제거한다.
     *
     * @returns {void} 반환값 없음
     */
    dispose: () => {
      // 이미 해제되었는지 확인한다.
      if (disposed) {
        return
      }
      disposed = true

      source.removeEventListener('ended', handleEnded)

      try {
        source.stop()
      }
      catch {
        // 이미 정지된 노드일 수 있다.
      }

      try {
        source.disconnect()
      }
      catch {
        // 이미 해제된 노드일 수 있다.
      }

      try {
        gainNode.disconnect()
      }
      catch {
        // 이미 해제된 노드일 수 있다.
      }

      owner.activeNodes.delete(trackedNode)
    },
  }

  /**
   * 소스 재생이 종료되면 자동으로 정리한다.
   *
   * @returns {void} 반환값 없음
   */
  function handleEnded(): void {
    trackedNode.dispose()
  }

  owner.activeNodes.add(trackedNode)
  source.addEventListener('ended', handleEnded, { once: true })
}
