import { MML } from './index'
import { noteToFrequency } from './composables/note-to-frequency'
import { PlayNoteTrack } from './types'

const DEFAULT_FADE_DURATION = 0.01
const DEFAULT_VOLUME = 0.8
const RENDER_PADDING_SECONDS = 0.05

/**
 * OfflineAudioContext를 사용해 MML 트랙을 렌더링하고 Object URL을 반환한다.
 * URL은 Blob으로 생성되며, audio 태그나 다운로드 링크에 바로 사용할 수 있다.
 *
 * @param {PlayNoteTrack[]} tracks 렌더링할 파싱된 트랙 컬렉션
 * @returns {Promise<string>} 생성된 WAV Blob의 Object URL
 */
export async function mmlToWavUrl(this: MML, tracks: PlayNoteTrack[]): Promise<string> {
  // 트랙이 비어 있으면 무음을 렌더링해 Object URL을 반환한다.
  if (!Array.isArray(tracks) || tracks.length === 0) {
    const buffer = await renderSilence(this)
    return audioBufferToObjectUrl(buffer)
  }

  const playableTracks = tracks.filter((track) => Array.isArray(track) && track.length > 0)
  // 플레이 가능한 트랙이 하나도 없으면 무음을 렌더링한다.
  if (playableTracks.length === 0) {
    const buffer = await renderSilence(this)
    return audioBufferToObjectUrl(buffer)
  }

  const sampleRate = resolveSampleRate(this.ctx.sampleRate)
  const channelCount = resolveChannelCount(this.masterGain.channelCount)
  const renderDurationSeconds = computeRenderDurationSeconds(playableTracks)
  const frameCount = Math.max(1, Math.ceil((renderDurationSeconds + RENDER_PADDING_SECONDS + DEFAULT_FADE_DURATION) * sampleRate))
  const offlineContext = new OfflineAudioContext(channelCount, frameCount, sampleRate)
  const masterGain = offlineContext.createGain()

  masterGain.gain.value = this.masterGain.gain.value
  masterGain.connect(offlineContext.destination)

  // 각 트랙을 오프라인 컨텍스트에 스케줄한다.
  playableTracks.forEach((track) => {
    scheduleTrack({
      owner: this,
      context: offlineContext,
      masterGain,
      track,
    })
  })

  const renderedBuffer = await offlineContext.startRendering()
  return audioBufferToObjectUrl(renderedBuffer)
}

/**
 * 지정된 컨텍스트 정보로 무음 버퍼를 생성한다.
 *
 * @param {MML} owner OfflineAudioContext 구성을 위해 사용할 MML 인스턴스
 * @returns {Promise<AudioBuffer>} 1 프레임 길이의 무음 버퍼
 */
function renderSilence(owner: MML): Promise<AudioBuffer> {
  const sampleRate = resolveSampleRate(owner.ctx.sampleRate)
  const channelCount = resolveChannelCount(owner.masterGain.channelCount)
  const offlineContext = new OfflineAudioContext(channelCount, 1, sampleRate)
  return offlineContext.startRendering()
}

/**
 * 샘플 레이트 값이 유효한지 검사한 뒤 기본값을 보정한다.
 *
 * @param {number} sampleRate 입력 샘플 레이트
 * @returns {number} 렌더링에 사용할 샘플 레이트
 */
function resolveSampleRate(sampleRate: number): number {
  // 유효한 양수 샘플 레이트면 그대로 사용한다.
  if (Number.isFinite(sampleRate) && sampleRate > 0) {
    return sampleRate
  }
  return 44100
}

/**
 * 채널 수가 유효한지 검사하고 렌더링에 적합하도록 정규화한다.
 *
 * @param {number} channelCount 입력 채널 수
 * @returns {number} OfflineAudioContext에 사용할 채널 수
 */
function resolveChannelCount(channelCount: number): number {
  // 최소 1개 이상의 채널이면 소수점을 제거하고 사용한다.
  if (Number.isFinite(channelCount) && channelCount >= 1) {
    return Math.floor(channelCount)
  }
  return 2
}

/**
 * 주어진 트랙 집합을 재생하는 데 필요한 총 녹음 시간을 계산한다.
 *
 * @param {PlayNoteTrack[]} tracks 시간 계산 대상 트랙 목록
 * @returns {number} 필요한 렌더링 시간(초)
 */
function computeRenderDurationSeconds(tracks: PlayNoteTrack[]): number {
  let longestSeconds = 0

  // 각 트랙에서 누적 재생 시간을 계산한다.
  tracks.forEach((track) => {
    let accumulated = 0

    // 개별 음표 지속 시간을 누적하면서 검증한다.
    track.forEach((note) => {
      const duration = note.duration
      // duration이 유효한 숫자인지 확인한다.
      if (typeof duration !== 'number' || !Number.isFinite(duration)) {
        throw new TypeError('duration은 유한한 숫자여야 합니다.')
      }
      // duration이 양수인지 확인한다.
      if (duration <= 0) {
        throw new RangeError('duration은 0보다 큰 값이어야 합니다.')
      }

      accumulated += duration / 1000
    })

    // 현재 트랙 길이가 최대값인지 비교한다.
    if (accumulated > longestSeconds) {
      longestSeconds = accumulated
    }
  })

  return longestSeconds
}

/**
 * 오프라인 컨텍스트에 단일 트랙을 스케줄한다.
 *
 * @param {{ owner: MML; context: OfflineAudioContext; masterGain: GainNode; track: PlayNoteTrack }} config 스케줄링 설정
 * @returns {void}
 */
function scheduleTrack(config: {
  owner: MML
  context: OfflineAudioContext
  masterGain: GainNode
  track: PlayNoteTrack
}): void {
  const {
    owner,
    context,
    masterGain,
    track,
  } = config
  let accumulatedDelaySeconds = 0

  // 각 음표를 순서대로 스케줄한다.
  track.forEach((note) => {
    const {
      name,
      note: noteName,
      duration = 1000,
      volume,
    } = note

    // 지속 시간이 유효한지 검증한다.
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new RangeError('각 음표는 양수의 duration(ms)을 포함해야 합니다.')
    }

    const durationSeconds = duration / 1000
    const isRest = typeof noteName === 'string' && noteName.trim().toUpperCase() === 'REST'

    // 쉼표가 아니고 이름이 존재하면 샘플 재생을 준비한다.
    if (!isRest && typeof noteName === 'string' && noteName.length > 0) {
      const startTime = accumulatedDelaySeconds
      const resolvedVolume = resolveVolume(volume)
      const gainValue = convertVolumeToGain(resolvedVolume)
      const instrumentKey = typeof name === 'string' ? name.trim().toLowerCase() : '_'
      const instrumentBuffers = owner.buffers[instrumentKey]
      const targetFrequency = noteToFrequency(noteName)

      // 악기 버퍼가 준비돼 있으면 적절한 버퍼를 찾는다.
      if (instrumentBuffers && Object.keys(instrumentBuffers).length > 0) {
        const resolved = resolveBuffer(instrumentBuffers, targetFrequency)
        // 매칭되는 버퍼가 있으면 버퍼 재생을 스케줄한다.
        if (resolved) {
          const bufferSource = context.createBufferSource()
          const gainNode = context.createGain()

          bufferSource.buffer = resolved.buffer
          bufferSource.loop = false
          bufferSource.playbackRate.value = resolved.playbackRate
          gainNode.gain.value = 0

          bufferSource.connect(gainNode)
          gainNode.connect(masterGain)

          scheduleGainEnvelope(gainNode.gain, startTime, durationSeconds, gainValue)
          bufferSource.start(startTime)
          bufferSource.stop(startTime + durationSeconds)
        } else {
          // 매칭되는 버퍼가 없으면 사인파로 대체한다.
          scheduleSineWave(context, masterGain, startTime, durationSeconds, targetFrequency, gainValue)
        }
      } else {
        // 버퍼가 전혀 없으면 사인파로 대체한다.
        scheduleSineWave(context, masterGain, startTime, durationSeconds, targetFrequency, gainValue)
      }
    }

    accumulatedDelaySeconds += durationSeconds
  })
}

/**
 * 볼륨이 유효한지 확인하고 기본값으로 보정한다.
 *
 * @param {number | undefined} volume 사용자가 지정한 볼륨
 * @returns {number} 0~1 범위 내 볼륨
 */
function resolveVolume(volume: number | undefined): number {
  // 숫자로 지정된 볼륨이면 범위를 검증한다.
  if (typeof volume === 'number') {
    // 볼륨 값이 유한한 숫자인지 확인한다.
    if (!Number.isFinite(volume)) {
      throw new TypeError('volume은 유한한 숫자여야 합니다.')
    }
    // 볼륨 값이 허용 범위 0~1을 벗어나는지 검사한다.
    if (volume < 0 || volume > 1) {
      throw new RangeError('volume은 0 이상 1 이하의 값만 허용됩니다.')
    }
    return volume
  }

  return DEFAULT_VOLUME
}

/**
 * 사인파 음원을 생성해 스케줄한다.
 *
 * @param {OfflineAudioContext} context 오프라인 오디오 컨텍스트
 * @param {GainNode} masterGain 최종 마스터 게인 노드
 * @param {number} startTime 시작 시간(초)
 * @param {number} durationSeconds 재생 길이(초)
 * @param {number} frequency 재생할 주파수
 * @param {number} gainValue 설정할 게인 값
 * @returns {void}
 */
function scheduleSineWave(
  context: OfflineAudioContext,
  masterGain: GainNode,
  startTime: number,
  durationSeconds: number,
  frequency: number,
  gainValue: number,
): void {
  const oscillator = context.createOscillator()
  const gainNode = context.createGain()

  oscillator.type = 'sine'
  oscillator.frequency.value = frequency
  gainNode.gain.value = 0

  oscillator.connect(gainNode)
  gainNode.connect(masterGain)

  scheduleGainEnvelope(gainNode.gain, startTime, durationSeconds, gainValue)
  oscillator.start(startTime)
  oscillator.stop(startTime + durationSeconds)
}

/**
 * 0~1 선형 볼륨 값을 dB 변환 후 지수 형태의 게인으로 변환한다.
 *
 * @param {number} volume 입력 볼륨
 * @returns {number} GainNode에 적용할 값
 */
function convertVolumeToGain(volume: number): number {
  // 0 볼륨은 0 게인으로 즉시 반환한다.
  if (volume === 0) {
    return 0
  }

  const minDb = -60
  const maxDb = 0
  const dB = minDb + (maxDb - minDb) * volume

  return Math.pow(10, dB / 20)
}

/**
 * 게인 파라미터에 페이드 인/아웃 엔벨로프를 적용한다.
 *
 * @param {AudioParam} param GainNode의 게인 파라미터
 * @param {number} startTime 시작 시간(초)
 * @param {number} durationSeconds 재생 길이(초)
 * @param {number} targetGain 목표 게인 값
 * @returns {void}
 */
function scheduleGainEnvelope(param: AudioParam, startTime: number, durationSeconds: number, targetGain: number): void {
  const fadeDuration = DEFAULT_FADE_DURATION
  const stopTime = startTime + durationSeconds
  const fadeOutStart = Math.max(startTime, stopTime - fadeDuration)

  param.cancelScheduledValues(startTime)
  param.setValueAtTime(0, startTime)

  // 페이드 인 구간에 따라 선형 램프 또는 즉시 값을 적용한다.
  if (fadeDuration > 0) {
    param.linearRampToValueAtTime(targetGain, startTime + fadeDuration)
  } else {
    param.setValueAtTime(targetGain, startTime)
  }

  // 페이드 아웃 시작 지점을 보정한다.
  if (fadeOutStart > startTime + fadeDuration) {
    param.setValueAtTime(targetGain, fadeOutStart)
  }

  // 페이드 아웃 구간에 따라 선형 램프 또는 즉시 0으로 설정한다.
  if (fadeDuration > 0) {
    param.linearRampToValueAtTime(0, stopTime)
  } else {
    param.setValueAtTime(0, stopTime)
  }
}

/**
 * 주어진 버퍼 집합에서 목표 주파수와 가장 가까운 버퍼를 찾는다.
 *
 * @param {Record<number, AudioBuffer>} buffers 버퍼 맵
 * @param {number} targetFrequency 원하는 주파수
 * @returns {{ buffer: AudioBuffer; playbackRate: number } | null} 선택된 버퍼와 재생 속도 또는 null
 */
function resolveBuffer(buffers: Record<number, AudioBuffer>, targetFrequency: number): {
  buffer: AudioBuffer
  playbackRate: number
} | null {
  const exactBuffer = buffers[targetFrequency]

  // 동일 주파수 버퍼가 있으면 그대로 반환한다.
  if (exactBuffer) {
    return {
      buffer: exactBuffer,
      playbackRate: 1,
    }
  }

  const availableFrequencies = Object.keys(buffers)
    .map((frequencyText) => Number.parseFloat(frequencyText))
    .filter((frequencyValue) => Number.isFinite(frequencyValue))

  // 사용 가능한 주파수가 없으면 폴백할 수 없다.
  if (availableFrequencies.length === 0) {
    return null
  }

  let nearestFrequency = availableFrequencies[0]
  let smallestDiff = Math.abs(nearestFrequency - targetFrequency)

  // 더 가까운 주파수를 탐색한다.
  for (let index = 1; index < availableFrequencies.length; index += 1) {
    const candidate = availableFrequencies[index]
    const diff = Math.abs(candidate - targetFrequency)

    // 차이가 더 작으면 후보를 갱신한다.
    if (diff < smallestDiff) {
      nearestFrequency = candidate
      smallestDiff = diff
    }
  }

  const buffer = buffers[nearestFrequency]
  // 인접 버퍼가 존재하는지 확인한다.
  if (!buffer) {
    return null
  }

  const playbackRate = targetFrequency / nearestFrequency

  // 재생 속도가 유효한지 검사한다.
  if (!Number.isFinite(playbackRate) || playbackRate <= 0) {
    return null
  }

  return {
    buffer,
    playbackRate,
  }
}

/**
 * AudioBuffer를 WAV 형식의 Blob URL로 변환한다.
 *
 * @param {AudioBuffer} buffer 렌더링 결과 버퍼
 * @returns {string} Blob Object URL
 */
function audioBufferToObjectUrl(buffer: AudioBuffer): string {
  // Object URL API를 사용할 수 있는지 검증한다.
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    throw new ReferenceError('URL.createObjectURL을 사용할 수 없습니다.')
  }

  const arrayBuffer = encodeWav(buffer)
  const blob = new Blob([arrayBuffer], { type: 'audio/wav' })

  return URL.createObjectURL(blob)
}

/**
 * AudioBuffer를 순수 WAV 바이트로 인코딩한다.
 *
 * @param {AudioBuffer} buffer 변환할 오디오 버퍼
 * @returns {ArrayBuffer} WAV 데이터
 */
function encodeWav(buffer: AudioBuffer): ArrayBuffer {
  const channelCount = Math.max(1, buffer.numberOfChannels)
  const sampleRate = buffer.sampleRate
  const frameCount = buffer.length
  const bytesPerSample = 2
  const blockAlign = channelCount * bytesPerSample
  const byteRate = sampleRate * blockAlign
  const dataLength = frameCount * blockAlign
  const totalLength = 44 + dataLength
  const arrayBuffer = new ArrayBuffer(totalLength)
  const view = new DataView(arrayBuffer)

  writeString(view, 0, 'RIFF')
  view.setUint32(4, totalLength - 8, true)
  writeString(view, 8, 'WAVE')
  writeString(view, 12, 'fmt ')
  view.setUint32(16, 16, true) // PCM 헤더 크기
  view.setUint16(20, 1, true) // Audio format = PCM
  view.setUint16(22, channelCount, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bytesPerSample * 8, true)
  writeString(view, 36, 'data')
  view.setUint32(40, dataLength, true)

  const channels: Float32Array[] = []
  // 각 채널 데이터를 수집한다.
  for (let channel = 0; channel < channelCount; channel += 1) {
    channels.push(buffer.getChannelData(channel))
  }

  let offset = 44
  // 샘플 데이터를 16비트 PCM으로 변환한다.
  for (let index = 0; index < frameCount; index += 1) {
    for (let channel = 0; channel < channelCount; channel += 1) {
      const sample = clampSample(channels[channel][index])
      const value = sample < 0 ? sample * 0x8000 : sample * 0x7fff
      view.setInt16(offset, Math.round(value), true)
      offset += bytesPerSample
    }
  }

  return arrayBuffer
}

/**
 * DataView에 문자열을 ASCII 바이트로 기록한다.
 *
 * @param {DataView} view 데이터를 기록할 뷰
 * @param {number} offset 시작 오프셋
 * @param {string} text 기록할 문자열
 * @returns {void}
 */
function writeString(view: DataView, offset: number, text: string): void {
  // 각 문자를 순회하며 바이트로 입력한다.
  for (let index = 0; index < text.length; index += 1) {
    view.setUint8(offset + index, text.charCodeAt(index))
  }
}

/**
 * PCM 샘플 값이 허용 범위를 벗어나지 않도록 클램프한다.
 *
 * @param {number} sample 입력 샘플 값
 * @returns {number} -1~1 범위로 제한된 값
 */
function clampSample(sample: number): number {
  // 유한하지 않은 값이면 0으로 보정한다.
  if (!Number.isFinite(sample)) {
    return 0
  }
  // 상한을 초과하면 최대값으로 제한한다.
  if (sample > 1) {
    return 1
  }
  // 하한을 미만이면 최소값으로 제한한다.
  if (sample < -1) {
    return -1
  }
  return sample
}
