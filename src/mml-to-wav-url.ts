import { MML } from './index'
import { noteToFrequency } from './composables/note-to-frequency'
import { PlayNoteTrack } from './types'

const DEFAULT_FADE_DURATION = 0.01
const DEFAULT_VOLUME = 0.8
const RENDER_PADDING_SECONDS = 0.05

/**
 * OfflineAudioContext를 사용해 MML 트랙을 렌더링하고 Object URL을 반환한다.
 * URL은 Blob으로 생성되며, audio 태그나 다운로드 링크에 바로 사용할 수 있다.
 */
export async function mmlToWavUrl(this: MML, tracks: PlayNoteTrack[]): Promise<string> {
  if (!Array.isArray(tracks) || tracks.length === 0) {
    const buffer = await renderSilence(this)
    return audioBufferToObjectUrl(buffer)
  }

  const playableTracks = tracks.filter((track) => Array.isArray(track) && track.length > 0)
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

function renderSilence(owner: MML): Promise<AudioBuffer> {
  const sampleRate = resolveSampleRate(owner.ctx.sampleRate)
  const channelCount = resolveChannelCount(owner.masterGain.channelCount)
  const offlineContext = new OfflineAudioContext(channelCount, 1, sampleRate)
  return offlineContext.startRendering()
}

function resolveSampleRate(sampleRate: number): number {
  if (Number.isFinite(sampleRate) && sampleRate > 0) {
    return sampleRate
  }
  return 44100
}

function resolveChannelCount(channelCount: number): number {
  if (Number.isFinite(channelCount) && channelCount >= 1) {
    return Math.floor(channelCount)
  }
  return 2
}

function computeRenderDurationSeconds(tracks: PlayNoteTrack[]): number {
  let longestSeconds = 0

  tracks.forEach((track) => {
    let accumulated = 0

    track.forEach((note) => {
      const duration = note.duration
      if (typeof duration !== 'number' || !Number.isFinite(duration)) {
        throw new TypeError('duration은 유한한 숫자여야 합니다.')
      }
      if (duration <= 0) {
        throw new RangeError('duration은 0보다 큰 값이어야 합니다.')
      }

      accumulated += duration / 1000
    })

    if (accumulated > longestSeconds) {
      longestSeconds = accumulated
    }
  })

  return longestSeconds
}

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

  track.forEach((note) => {
    const {
      name,
      note: noteName,
      duration = 1000,
      volume,
    } = note

    if (!Number.isFinite(duration) || duration <= 0) {
      throw new RangeError('각 음표는 양수의 duration(ms)을 포함해야 합니다.')
    }

    const durationSeconds = duration / 1000
    const isRest = typeof noteName === 'string' && noteName.trim().toUpperCase() === 'REST'

    if (!isRest && typeof noteName === 'string' && noteName.length > 0) {
      const startTime = accumulatedDelaySeconds
      const resolvedVolume = resolveVolume(volume)
      const gainValue = convertVolumeToGain(resolvedVolume)
      const instrumentKey = typeof name === 'string' ? name.trim().toLowerCase() : '_'
      const instrumentBuffers = owner.buffers[instrumentKey]
      const targetFrequency = noteToFrequency(noteName)

      if (instrumentBuffers && Object.keys(instrumentBuffers).length > 0) {
        const resolved = resolveBuffer(instrumentBuffers, targetFrequency)
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
          scheduleSineWave(context, masterGain, startTime, durationSeconds, targetFrequency, gainValue)
        }
      } else {
        scheduleSineWave(context, masterGain, startTime, durationSeconds, targetFrequency, gainValue)
      }
    }

    accumulatedDelaySeconds += durationSeconds
  })
}

function resolveVolume(volume: number | undefined): number {
  if (typeof volume === 'number') {
    if (!Number.isFinite(volume)) {
      throw new TypeError('volume은 유한한 숫자여야 합니다.')
    }
    if (volume < 0 || volume > 1) {
      throw new RangeError('volume은 0 이상 1 이하의 값만 허용됩니다.')
    }
    return volume
  }

  return DEFAULT_VOLUME
}

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

function convertVolumeToGain(volume: number): number {
  if (volume === 0) {
    return 0
  }

  const minDb = -60
  const maxDb = 0
  const dB = minDb + (maxDb - minDb) * volume

  return Math.pow(10, dB / 20)
}

function scheduleGainEnvelope(param: AudioParam, startTime: number, durationSeconds: number, targetGain: number): void {
  const fadeDuration = DEFAULT_FADE_DURATION
  const stopTime = startTime + durationSeconds
  const fadeOutStart = Math.max(startTime, stopTime - fadeDuration)

  param.cancelScheduledValues(startTime)
  param.setValueAtTime(0, startTime)

  if (fadeDuration > 0) {
    param.linearRampToValueAtTime(targetGain, startTime + fadeDuration)
  } else {
    param.setValueAtTime(targetGain, startTime)
  }

  if (fadeOutStart > startTime + fadeDuration) {
    param.setValueAtTime(targetGain, fadeOutStart)
  }

  if (fadeDuration > 0) {
    param.linearRampToValueAtTime(0, stopTime)
  } else {
    param.setValueAtTime(0, stopTime)
  }
}

function resolveBuffer(buffers: Record<number, AudioBuffer>, targetFrequency: number): {
  buffer: AudioBuffer
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

  return {
    buffer,
    playbackRate,
  }
}

function audioBufferToObjectUrl(buffer: AudioBuffer): string {
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    throw new ReferenceError('URL.createObjectURL을 사용할 수 없습니다.')
  }

  const arrayBuffer = encodeWav(buffer)
  const blob = new Blob([arrayBuffer], { type: 'audio/wav' })

  return URL.createObjectURL(blob)
}

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
  for (let channel = 0; channel < channelCount; channel += 1) {
    channels.push(buffer.getChannelData(channel))
  }

  let offset = 44
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

function writeString(view: DataView, offset: number, text: string): void {
  for (let index = 0; index < text.length; index += 1) {
    view.setUint8(offset + index, text.charCodeAt(index))
  }
}

function clampSample(sample: number): number {
  if (!Number.isFinite(sample)) {
    return 0
  }
  if (sample > 1) {
    return 1
  }
  if (sample < -1) {
    return -1
  }
  return sample
}
