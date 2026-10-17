import test from 'node:test'
import assert from 'node:assert/strict'
import { activeDashboardQueues, canPresentAllClear } from '../app/utils/dashboardPresentation.ts'

test('all-clear requires successfully confirmed queues, including after a failed zero-count refresh', () => {
  assert.equal(canPresentAllClear(0, false, false), true)
  assert.equal(canPresentAllClear(0, true, false), false)
  assert.equal(canPresentAllClear(0, false, true), false)
  assert.equal(canPresentAllClear(2, false, false), false)
})

test('all-clear presentation excludes zero queues', () => {
  assert.deepEqual(activeDashboardQueues([{ value: 0, priority: 1 }, { value: 0, priority: 2 }]), [])
})

test('pending queues keep their counts and routes while prioritizing work without mutating the source', () => {
  const queues = [
    { label: 'Applications', value: 8, priority: 4, to: '/admin/applications' },
    { label: 'Feedback', value: 0, priority: 5, to: '/admin/feedback' },
    { label: 'Overdue accounts', value: 2, priority: 1, to: '/admin/bills' },
    { label: 'Receipts', value: 3, priority: 2, to: '/admin/bills' }
  ]
  const before = structuredClone(queues)
  assert.deepEqual(activeDashboardQueues(queues).map(queue => [queue.label, queue.value, queue.to]), [
    ['Overdue accounts', 2, '/admin/bills'], ['Receipts', 3, '/admin/bills'], ['Applications', 8, '/admin/applications']
  ])
  assert.deepEqual(queues, before)
})
