import { MML } from './index'
import { playSample } from './play-sample'
import { PlayNoteOptions, PlaybackTiming } from './types'

/**
 * 파싱된 음표 목록을 AudioContext 타임라인에 순차적으로 스케줄한다.
 * REST 음표는 타이밍만 소비하고 실제 재생 큐에는 포함하지 않는다.
 *
 * @param {PlayNoteOptions[]} notes 재생할 음표 리스트
 */
export function playMml(this: MML, notes: PlayNoteOptions[]): void {
  if (!Array.isArray(notes) || notes.length === 0) {
    return
  }

  const baseContextTime = this.ctx.currentTime + 0.1
  const queue: Array<{ options: PlayNoteOptions; timing: PlaybackTiming }> = []
  let accumulatedDelaySeconds = 0

  for (const note of notes) {
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

    // 모든 노트(REST 포함)는 다음 노트 타이밍을 위해 누적 지연을 증가시킨다.
    accumulatedDelaySeconds += durationMs / 1000
  }

  // 미리 계산된 타이밍으로 큐에 등록하여 한 번에 하나의 노트만 재생되도록 보장한다.
  for (const item of queue) {
    playSample.call(this, item.options, item.timing)
  }
}
