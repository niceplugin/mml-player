import { MML } from './index'
import { playSample } from './play-sample'
import { PlayNoteOptions, PlaybackTiming, PlayNoteTrack } from './types'

/**
 * 파싱된 음표 트랙을 AudioContext 타임라인에 순차적으로 스케줄하되, 트랙 간에는 동일한 시작 시간을 공유해 병렬 재생한다.
 * REST 음표는 타이밍만 소비하고 실제 재생 큐에는 포함하지 않는다.
 *
 * @param {PlayNoteTrack[]} tracks 재생할 음표 트랙 목록
 */
export function playMml(this: MML, tracks: PlayNoteTrack[]): void {
  if (!Array.isArray(tracks) || tracks.length === 0) {
    return
  }

  const baseContextTime = this.ctx.currentTime + 0.1

  tracks.forEach((track) => {
    if (!Array.isArray(track) || track.length === 0) {
      return
    }

    const queue = buildPlaybackQueue(track, baseContextTime)
    queue.forEach((item) => {
      playSample.call(this, item.options, item.timing)
    })
  })
}

function buildPlaybackQueue(
  track: PlayNoteTrack,
  baseContextTime: number,
): Array<{ options: PlayNoteOptions; timing: PlaybackTiming }> {
  const queue: Array<{ options: PlayNoteOptions; timing: PlaybackTiming }> = []
  let accumulatedDelaySeconds = 0

  for (const note of track) {
    const durationMs = note.duration
    if (typeof durationMs !== 'number' || !Number.isFinite(durationMs) || durationMs <= 0) {
      throw new RangeError('각 음표는 양수의 duration(ms)을 포함해야 합니다.')
    }
    const isRest = typeof note.note === 'string' && note.note.trim().toUpperCase() === 'REST'

    if (!isRest) {
      queue.push({
        options: note,
        timing: {
          contextTime: baseContextTime,
          delay: accumulatedDelaySeconds,
        },
      })
    }

    accumulatedDelaySeconds += durationMs / 1000
  }

  return queue
}
