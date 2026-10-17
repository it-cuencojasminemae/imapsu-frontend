// Isolated UI fixtures: this server never connects to Strapi or a database.
import http from 'node:http'

export async function startAccountDashboardApi(port = 1341) {
  const roles = ['student', 'aspiring-tenant', 'current-tenant', 'oas', 'admin']
  const profiles = new Map(roles.map((type, index) => [type, {
    id: 700 + index, username: `qa-${type}`, email: `${type}@example.test`, fullName: `Campus ${type}`,
    role: { id: index + 1, name: type, type }, bio: '', contactNumber: '',
    security: { mfaRequired: ['oas', 'admin'].includes(type), mfaEnabled: ['oas', 'admin'].includes(type), enrollmentDeadline: Date.now() + 86400000, passwordChangeRequired: false }
  }]))
  const state = { requests: [], uploads: [], fail: [], empty: false, delay: 0 }
  const record = (index, prefix, extra = {}) => ({ id: index + 1, documentId: `${prefix}${index + 1}`, createdAt: new Date(Date.UTC(2026, 9, 15 - index)).toISOString(), ...extra })
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${port}`), path = url.pathname
    const send = (body, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)) }
    const role = req.headers.authorization?.replace('Bearer test-', '')
    const user = profiles.get(role)
    const raw = req.method !== 'GET' ? Buffer.concat(await Array.fromAsync(req)) : Buffer.alloc(0)
    const body = req.headers['content-type']?.includes('application/json') && raw.length ? JSON.parse(raw) : {}
    if (path === '/fixture/control') {
      if (body.role && body.security) Object.assign(profiles.get(body.role).security, body.security)
      for (const key of ['fail', 'empty', 'delay']) if (body[key] !== undefined) state[key] = body[key]
      send({ ok: true }); return
    }
    if (path === '/fixture/state') { send(state); return }
    state.requests.push({ path, role: role ?? 'guest', method: req.method, query: Object.fromEntries(url.searchParams), ...(path === '/api/auth/account' && !body.newPassword ? { body } : {}) })
    if (state.delay && path === '/api/auth/account') await new Promise(resolve => setTimeout(resolve, state.delay))
    if (state.fail.includes(path)) { send({ error: { message: 'Synthetic request failure. Please retry.' } }, 503); return }
    const list = records => {
      if (state.empty) records = []
      const pageSize = Number(url.searchParams.get('pagination[pageSize]') || 25)
      return { data: records.slice(0, pageSize), meta: { pagination: { page: 1, pageSize, pageCount: Math.ceil(records.length / pageSize), total: records.length } } }
    }
    const tokens = type => ({ jwt: `test-${type}`, refreshToken: `refresh-${type}`, user: profiles.get(type) })
    if (path === '/api/auth/login') {
      const type = roles.includes(body.identifier) ? body.identifier : 'student'
      send(body.password === 'invalid' ? { error: { message: 'Invalid password' } } : body.password === 'mfa' ? { mfaRequired: true, challengeToken: `challenge-${type}` } : tokens(type), body.password === 'invalid' ? 400 : 200); return
    }
    if (path === '/api/auth/mfa/challenge') {
      if (body.code !== '123456') { send({ error: { message: 'Invalid authenticator code' } }, 400); return }
      send(tokens(body.challengeToken.replace('challenge-', ''))); return
    }
    if (path === '/api/auth/logout') { send({ ok: true }); return }
    if (path === '/api/auth/me') { send(user ?? { error: { message: 'Sign in required' } }, user ? 200 : 401); return }
    if (path === '/api/auth/account') {
      if (!user) { send({ error: { message: 'Sign in required' } }, 401); return }
      if (body.newPassword) { send(user); return }
      const next = { ...body }
      if (body.avatar) next.avatar = { id: 500, url: 'data:image/png;base64,' + state.uploads.at(-1).png }
      Object.assign(user, next)
      // Production account updates omit computed security metadata.
      const { security, ...profile } = user
      send(profile); return
    }
    if (path === '/api/auth/mfa/enrollment') { send({ secret: 'SYNTHETIC-SETUP-KEY', uri: 'otpauth://totp/QA?secret=SYNTHETIC' }); return }
    if (path === '/api/auth/mfa/enable') {
      if (body.code !== '123456') { send({ error: { message: 'Invalid authenticator code' } }, 400); return }
      user.security.mfaEnabled = true; send({ recoveryCodes: ['QA-RECOVERY-ONE', 'QA-RECOVERY-TWO'] }); return
    }
    if (path === '/api/auth/mfa/reauthenticate') { send({ ok: true }); return }
    if (path === '/api/upload') {
      const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
      const start = raw.indexOf(signature), end = raw.indexOf(Buffer.from('IEND'), start) + 8
      if (start < 0) { send({ error: { message: 'Missing PNG image' } }, 400); return }
      const png = raw.subarray(start, end)
      state.uploads.push({ width: png.readUInt32BE(16), height: png.readUInt32BE(20), png: png.toString('base64') })
      send([{ id: 500 }]); return
    }
    if (path === '/api/dashboard/property-summary') { send(state.empty ? { total: 0, occupied: 0, vacant: 0 } : role === 'student' ? { total: 7, occupied: 7, vacant: 0 } : { total: 12, occupied: 7, vacant: 5 }); return }
    if (path === '/api/dashboard/billing-summary') { send(state.empty ? { total: 0, outstanding: 0, overdueBills: 0, forVerification: 0 } : { total: 27, outstanding: 7500, overdueBills: 2, forVerification: 3 }); return }
    if (path === '/api/rental-applications') { send(list(Array.from({ length: 23 }, (_, i) => record(i, 'application', { propertySpace: { name: `Space ${i + 1}` }, status: 'For Review' })))); return }
    if (path === '/api/tenancies') { send(list(Array.from({ length: 4 }, (_, i) => record(i, 'tenancy', { status: 'Active', endDate: '2026-12-31', propertySpace: { name: `Tenant space ${i + 1}` } })))); return }
    if (path === '/api/maintenance-tickets') { send(list(Array.from({ length: 14 }, (_, i) => record(i, 'maintenance', { category: `Maintenance ${i + 1}`, status: 'Pending', propertySpace: { name: 'Campus Cafe' } })))); return }
    if (path === '/api/announcements') { send(list(Array.from({ length: 8 }, (_, i) => record(i, 'announcement', { title: `Campus announcement ${i + 1}`, publishedAt: new Date(Date.UTC(2026, 9, 15 - i)).toISOString() })))); return }
    if (path === '/api/notifications/unread-count') { send({ count: 0 }); return }
    if (path === '/api/dashboard/oas-summary') { send({ properties: { total: 12, occupied: 7, vacant: 5 }, tenancies: { total: 4, active: 4, expiring: [] }, applications: { total: 23, pending: 3 }, maintenance: { total: 14, active: 2 }, feedback: { total: 0, unreviewed: 0 }, readings: 0, announcements: 8, billing: { total: 27, outstanding: 7500, collected: 0, overdueTotal: 1000, overdueAccounts: 1, overdueBills: 2, forVerification: 3 } }); return }
    if (path === '/api/dashboard/admin-summary') { send({ users: { total: 5, active: 5, blocked: 0, unconfirmed: 0 }, roles: 5, roleCounts: Object.fromEntries(roles.map(type => [type, 1])), security: { lockedAccounts: 0, staffMfaEnabled: 2, staffEnrollmentPending: 0, staffEnrollmentOverdue: 0 } }); return }
    send(list([]))
  })
  await new Promise(resolve => server.listen(port, '127.0.0.1', resolve))
  return { server, state, profiles }
}
