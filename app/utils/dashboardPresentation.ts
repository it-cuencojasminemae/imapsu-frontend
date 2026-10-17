// Presentation ordering only. Callers retain their existing record calculations.
export function canPresentAllClear(actionableCount: number, refreshing: boolean, failed: boolean) {
  return actionableCount === 0 && !refreshing && !failed
}

export function activeDashboardQueues<T extends { value: number; priority: number }>(queues: readonly T[]): T[] {
  return queues.filter(queue => queue.value > 0).sort((left, right) => left.priority - right.priority)
}
