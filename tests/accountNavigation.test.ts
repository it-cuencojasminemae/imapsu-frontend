import test from 'node:test'
import assert from 'node:assert/strict'
import { accountSection, internalRedirect, landingPath, requiresAccountSetup, SECURITY_PATH } from '../app/utils/accountNavigation.ts'

test('guests enter the map and all five roles enter their dashboards', () => {
  assert.equal(landingPath(null), '/campus-map')
  for (const type of ['student', 'aspiring-tenant', 'current-tenant', 'oas', 'admin']) {
    assert.equal(landingPath({ role: { type } }), ['oas', 'admin'].includes(type) ? '/admin' : '/dashboard')
  }
})

test('password and overdue enrollment requirements precede dashboard routing without changing deadlines', () => {
  const now = 10000
  const security = { mfaRequired: true, mfaEnabled: false, enrollmentDeadline: now + 1 }
  const user = { role: { type: 'oas' }, security }
  assert.equal(landingPath(user, now), '/admin')
  assert.equal(landingPath(user, now + 2), SECURITY_PATH)
  assert.equal(security.enrollmentDeadline, now + 1)
  assert.equal(requiresAccountSetup({ security: { ...security, mfaEnabled: true } }, now + 2), false)
  assert.equal(requiresAccountSetup({ security: { ...security, mfaRequired: false } }, now + 2), false)
  assert.equal(requiresAccountSetup({ security: { ...security, enrollmentDeadline: null } }, now + 2), false)
  assert.equal(landingPath({ role: { type: 'student' }, security: { ...security, passwordChangeRequired: true } }, now), SECURITY_PATH)
})

test('redirect destinations reject external, malformed, and disguised cross-origin URLs', () => {
  for (const value of ['https://example.com', '//example.com', '/%2fexample.com', '/\\example.com', '/%5cexample.com', '/%0aexample.com', '/%', '%2fbills', ['/', '/admin'], null]) {
    assert.equal(internalRedirect(value), null, String(value))
  }
  assert.equal(internalRedirect('/bills?page=2#receipt'), '/bills?page=2#receipt')
  assert.equal(internalRedirect('/account?section=security'), '/account?section=security')
})

test('account section selection defaults safely on direct links and malformed query values', () => {
  for (const value of [undefined, null, 'unknown', ['security'], '']) assert.equal(accountSection(value), 'profile')
  for (const value of ['profile', 'security', 'preferences']) assert.equal(accountSection(value), value)
})
