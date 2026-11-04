import test from 'node:test'
import assert from 'node:assert/strict'
import { staffRoleLabel } from '../app/utils/staffRole.ts'

test('staff sign-ins show a readable role', () => {
  assert.equal(staffRoleLabel('admin'), 'MIS Administrator')
  assert.equal(staffRoleLabel('oas'), 'OAS staff')
})

test('an unrecognized or missing role stays honest', () => {
  assert.equal(staffRoleLabel('auditor'), 'auditor')
  assert.equal(staffRoleLabel(null), '')
  assert.equal(staffRoleLabel(undefined), '')
})
