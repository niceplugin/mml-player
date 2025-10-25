import { MML } from './index'
import type { TrackedPlaybackNode } from './types'

/**
 * 현재 활성 노드가 존재하는지, 그리고 마지막 노드가 종료되었는지 판별한다.
 *
 * @returns {boolean} 모든 노드가 정지되었으면 true
 */
export function stopped(this: MML): boolean {
  // 활성 노드가 하나라도 있는지 확인한다.
  if (this.activeNodes.size === 0) {
    return true
  }

  const activeNodes = Array.from(this.activeNodes) as TrackedPlaybackNode[]
  const lastNode = activeNodes[activeNodes.length - 1]

  // 마지막 노드가 없으면 정지 상태로 간주한다.
  if (!lastNode) {
    return true
  }

  const gainNodeWithEnded = lastNode.gainNode as GainNode & { ended?: boolean }

  return gainNodeWithEnded.ended === true
}
