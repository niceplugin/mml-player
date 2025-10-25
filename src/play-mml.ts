import { MML } from './index'
import { playSample } from './play-sample'
import { PlayNoteOptions, PlaybackTiming, PlayNoteTrack } from './types'

/**
 * 파싱된 음표 트랙을 AudioContext 타임라인에 순차적으로 스케줄하되,
 * 트랙 간에는 동일한 시작 시간을 공유해 병렬 재생한다.
 * REST 음표는 타이밍만 소비하고 실제 재생 큐에는 포함하지 않는다.
 *
 * @param {PlayNoteTrack[]} tracks 재생할 음표 트랙 목록
 * @returns {void} 반환값 없음
 */
export function playMml(this: MML, tracks: PlayNoteTrack[]): void {
  // 트랙 배열이 비었는지 확인한다.
  if (!Array.isArray(tracks) || tracks.length === 0) {
    return
  }

  const baseContextTime = this.ctx.currentTime + 0.1

  // 각 트랙을 순차적으로 순회한다.
  tracks.forEach((track) => {
    // 현재 트랙이 비어 있는지 확인한다.
    if (!Array.isArray(track) || track.length === 0) {
      return
    }

    const queue = buildPlaybackQueue(track, baseContextTime)
    // 큐에 담긴 음표를 스케줄한다.
    queue.forEach((item) => {
      playSample.call(this, item.options, item.timing)
    })
  })
}

/**
 * 단일 트랙을 기반으로 재생 큐를 구성한다.
 *
 * @param {PlayNoteTrack} track 재생할 트랙
 * @param {number} baseContextTime 공통 컨텍스트 시작 시간
 * @returns {Array<{ options: PlayNoteOptions; timing: PlaybackTiming }>} 스케줄링 정보 배열
 */
function buildPlaybackQueue(
  track: PlayNoteTrack,
  baseContextTime: number,
): Array<{ options: PlayNoteOptions; timing: PlaybackTiming }> {
  const queue: Array<{ options: PlayNoteOptions; timing: PlaybackTiming }> = []
  let accumulatedDelaySeconds = 0

  // 트랙 내 각 음표를 순회한다.
  for (const note of track) {
    const durationMs = note.duration
    // duration이 유효한 숫자인지 확인한다.
    if (typeof durationMs !== 'number' || !Number.isFinite(durationMs) || durationMs <= 0) {
      throw new RangeError('각 음표는 양수의 duration(ms)을 포함해야 합니다.')
    }
    const isRest = typeof note.note === 'string' && note.note.trim().toUpperCase() === 'REST'

    // 쉼표가 아니라면 재생 큐에 추가한다.
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
