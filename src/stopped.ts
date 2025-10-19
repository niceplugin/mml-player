import { MML } from './index'
import type { TrackedPlaybackNode } from './types'

export function stopped(this: MML): boolean {
  if (this.activeNodes.size === 0) {
    return true
  }

  const activeNodes = Array.from(this.activeNodes) as TrackedPlaybackNode[]
  const lastNode = activeNodes[activeNodes.length - 1]

  if (!lastNode) {
    return true
  }

  const gainNodeWithEnded = lastNode.gainNode as GainNode & { ended?: boolean }

  return gainNodeWithEnded.ended === true
}
