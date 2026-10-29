import test from 'node:test'
import assert from 'node:assert/strict'
import { emptyProfileDraft, profilePatch, type ProfileDraft } from '../app/utils/accountProfile.ts'

const baseline: ProfileDraft = { ...emptyProfileDraft(), fullName: 'Campus User' }

test('profile patches normalize optional values and omit unchanged fields', () => {
  assert.deepEqual(profilePatch({ ...baseline, fullName: ' Campus User ', bio: '  ' }, baseline, 'student'), {})
  assert.deepEqual(profilePatch({ ...baseline, fullName: '  New Name ', contactNumber: ' 0917 000 0000 ' }, baseline, 'student'), { fullName: 'New Name', contactNumber: '0917 000 0000' })
  assert.deepEqual(profilePatch({ ...baseline, fullName: '' }, baseline, 'student'), { fullName: null })
})

test('only staff patches include employee fields and no patches expose administrator-controlled fields', () => {
  const changed = { ...baseline, position: 'Officer', employeeId: 'STAFF-1', email: 'changed@example.test', role: 'admin', username: 'changed' }
  assert.deepEqual(profilePatch(changed, baseline, 'student'), {})
  assert.deepEqual(profilePatch(changed, baseline, 'oas'), { position: 'Officer', employeeId: 'STAFF-1' })
  assert.equal(baseline.position, '')
})

test('role-specific fields are only patched for the matching role', () => {
  const changed = { ...baseline, businessName: 'Kape Corner' }
  assert.deepEqual(profilePatch(changed, baseline, 'student'), {})
  assert.deepEqual(profilePatch(changed, baseline, 'aspiring-tenant'), { businessName: 'Kape Corner' })
  assert.deepEqual(profilePatch(changed, baseline, 'current-tenant'), { businessName: 'Kape Corner' })
  assert.deepEqual(profilePatch(changed, baseline, 'admin'), {})
})
