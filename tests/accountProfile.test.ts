import test from 'node:test'
import assert from 'node:assert/strict'
import { profilePatch, type ProfileDraft } from '../app/utils/accountProfile.ts'

const baseline: ProfileDraft = { fullName: 'Campus User', contactNumber: '', bio: '', position: '', department: '', employeeId: '', officeLocation: '' }

test('profile patches normalize optional values and omit unchanged fields', () => {
  assert.deepEqual(profilePatch({ ...baseline, fullName: ' Campus User ', bio: '  ' }, baseline, false), {})
  assert.deepEqual(profilePatch({ ...baseline, fullName: '  New Name ', contactNumber: ' 0917 000 0000 ' }, baseline, false), { fullName: 'New Name', contactNumber: '0917 000 0000' })
  assert.deepEqual(profilePatch({ ...baseline, fullName: '' }, baseline, false), { fullName: null })
})

test('only staff patches include employee fields and no patches expose administrator-controlled fields', () => {
  const changed = { ...baseline, position: 'Officer', employeeId: 'STAFF-1', email: 'changed@example.test', role: 'admin', username: 'changed' }
  assert.deepEqual(profilePatch(changed, baseline, false), {})
  assert.deepEqual(profilePatch(changed, baseline, true), { position: 'Officer', employeeId: 'STAFF-1' })
  assert.equal(baseline.position, '')
})
