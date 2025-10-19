import type { MML } from './index.ts'

const MASTER_FADE_DURATION_SECONDS = 0.01

export function stopMml(this: MML): void {
  const now = this.ctx.currentTime
  const fadeEnd = now + MASTER_FADE_DURATION_SECONDS
  const activeNodes = Array.from(this.activeNodes)

  for (const node of activeNodes) {
    try {
      node.gainNode.gain.cancelScheduledValues(now)
      node.gainNode.gain.setValueAtTime(node.gainNode.gain.value, now)
      node.gainNode.gain.linearRampToValueAtTime(0, fadeEnd)
    } catch {
      // 이미 해제된 노드일 수 있으므로 무시한다.
    }

    try {
      node.source.stop(fadeEnd)
    } catch {
      // stopMml 호출이 실패해도 강제로 dispose 하여 리소스를 해제한다.
    }
    const cleanupDelay = MASTER_FADE_DURATION_SECONDS * 1000
    globalThis.setTimeout(() => {
      node.dispose()
    }, cleanupDelay)

    this.activeNodes.delete(node)
  }

  const previousMasterGain = this.masterGain
  const gainParam = previousMasterGain.gain
  gainParam.cancelScheduledValues(now)
  gainParam.setValueAtTime(gainParam.value, now)
  gainParam.linearRampToValueAtTime(0, fadeEnd)

  const disconnectDelayMs = MASTER_FADE_DURATION_SECONDS * 1000

  globalThis.setTimeout(() => {
    try {
      previousMasterGain.disconnect()
    } catch {
      // 이미 연결이 끊겼을 수 있음
    }

    const nextMasterGain = this.ctx.createGain()
    nextMasterGain.gain.value = 1
    nextMasterGain.connect(this.ctx.destination)
    this.masterGain = nextMasterGain
  }, disconnectDelayMs)
}
