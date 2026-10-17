import test from 'node:test'
import assert from 'node:assert/strict'
import { retainResponse, requestPresentation } from '../app/utils/requestPresentation.ts'
import { revealTransition } from '../app/utils/appMotion.ts'

test('pending and failed refreshes retain the last successful response', () => {
  const previous = { data: [{ id: 1 }] }
  assert.equal(retainResponse(previous, undefined, 'pending'), previous)
  assert.equal(retainResponse(previous, { data: [] }, 'error'), previous)
  const next = { data: [] }
  assert.equal(retainResponse(previous, next, 'success'), next)
})

test('a successful empty response counts as loaded and stays visible during refresh', () => {
  assert.deepEqual(requestPresentation('pending', false), { isInitialLoading: true, isRefreshing: false, isInitialError: false })
  assert.deepEqual(requestPresentation('pending', true), { isInitialLoading: false, isRefreshing: true, isInitialError: false })
  assert.equal(requestPresentation('error', true).isInitialError, false)
  assert.equal(requestPresentation('error', false).isInitialError, true)
})

test('reduced motion removes staggering and later cards never accumulate delay', () => {
  assert.equal(revealTransition(3, true).delay, 0)
  assert.equal(revealTransition(10).delay, 0)
  assert.equal(revealTransition(3).delay, 0.09)
})
