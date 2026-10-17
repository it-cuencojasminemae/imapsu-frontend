import test from 'node:test'
import assert from 'node:assert/strict'
import { homePresentation, propertySummary } from '../app/utils/homePresentation.ts'

test('homepage actions respect the existing route role boundaries', () => {
  const restricted: Record<string, string[]> = {
    '/admin': ['oas', 'admin'], '/admin/applications': ['oas'], '/admin/bills': ['oas'], '/admin/maintenance': ['oas'],
    '/admin/users': ['admin'], '/admin/system-monitoring': ['admin'], '/admin/audit-logs': ['admin'],
    '/rental-applications': ['aspiring-tenant'], '/bills': ['current-tenant'], '/tenancy': ['current-tenant'], '/maintenance': ['current-tenant'],
    '/feedback': ['student', 'current-tenant']
  }
  for (const role of [null, 'student', 'aspiring-tenant', 'current-tenant', 'oas', 'admin']) {
    const home = homePresentation(role)
    for (const action of [home.primary, home.secondary, ...home.services]) {
      if (restricted[action.to]) assert.ok(restricted[action.to].includes(role!), `${role} cannot navigate to ${action.to}`)
      if (!role) assert.notEqual(action.to, '/properties', 'guest directory access must explain sign-in')
    }
  }
  assert.equal(homePresentation(null).services.find(item => item.title === 'Rental Applications')?.to, '/register')
})

test('property summaries distinguish unknown status and do not expose student vacancy counts', () => {
  const records = [{ space_status: 'Occupied' }, { space_status: 'Vacant' }, { space_status: 'Unknown' }, { space_status: null }]
  assert.deepEqual(propertySummary(records, false).map(item => item.value), [4, 1, 1])
  assert.deepEqual(propertySummary(records, true).map(item => item.value), [1, 1])
  assert.deepEqual(propertySummary([], false).map(item => item.value), [0, 0, 0])
  assert.equal(records.length, 4)
})
