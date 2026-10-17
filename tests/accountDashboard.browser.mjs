// Run after npm run build. All API records and account mutations are synthetic.
// NODE_PATH may point to the bundled Playwright runtime; no installed browser packages are required.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { startAccountDashboardApi } from './fixtures/accountDashboardApi.mjs'

const { chromium } = createRequire(import.meta.url)('playwright')
const origin = 'http://127.0.0.1:3215'
const evidence = fileURLToPath(new URL('../../docs/account-dashboard-evidence/', import.meta.url))
await mkdir(evidence, { recursive: true })
const fixture = await startAccountDashboardApi()
const server = spawn(process.execPath, ['.output/server/index.mjs'], {
  cwd: fileURLToPath(new URL('../', import.meta.url)), windowsHide: true,
  env: { ...process.env, PORT: '3215', HOST: '127.0.0.1', NUXT_STRAPI_INTERNAL_URL: 'http://127.0.0.1:1341', NUXT_SESSION_PASSWORD: randomBytes(32).toString('hex'), NUXT_GATEWAY_SECRET: randomBytes(32).toString('hex'), NUXT_APP_ORIGIN: origin }
})
let serverLog = ''
server.stdout.on('data', chunk => { serverLog += chunk })
server.stderr.on('data', chunk => { serverLog += chunk })
const checks = [], errors = []
let browser, page
const check = label => { checks.push(label); console.log(`PASS ${label}`) }
const control = options => fetch('http://127.0.0.1:1341/fixture/control', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(options) })
const waitForServer = async () => {
  let lastResponse = ''
  for (let i = 0; i < 100; i++) {
    try {
      const response = await fetch(origin + '/login')
      if (response.ok) return
      lastResponse = `${response.status} ${(await response.text()).slice(0, 2000)}`
      if (i > 4) break
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 300))
  }
  throw new Error(`Preview server unavailable: ${lastResponse} ${serverLog.slice(-3000)}`)
}
const login = async (page, role, password = 'test-password', redirect = '') => {
  await page.goto(origin + '/login' + (redirect ? '?redirect=' + encodeURIComponent(redirect) : ''))
  await page.getByRole('textbox', { name: 'Email or username' }).fill(role)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
}
const waitPath = (page, path) => page.waitForURL(url => url.pathname + url.search === path)
const chooseSection = async (page, label) => {
  await page.getByRole('navigation', { name: 'Account settings' }).getByRole('link', { name: label, exact: true }).click()
  await waitPath(page, '/account?section=' + label.toLowerCase())
  await page.getByRole('region', { name: label, exact: true }).waitFor()
}
const overflow = page => page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }))
const cropReady = page => page.waitForFunction(() => {
  const button = [...document.querySelectorAll('[role=dialog] button')].find(element => element.textContent.includes('Crop & upload'))
  return button && !button.disabled && document.querySelector('.vue-rectangle-stencil')?.getBoundingClientRect().width > 0
})
const snapshot = async (page, name) => {
  await page.waitForFunction(() => !document.querySelector('.app-page-enter-active'))
  const close = page.getByRole('button', { name: 'Close', exact: true })
  while (await close.count()) await close.first().click()
  await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo({ top: 0, behavior: 'instant' }) })
  await page.screenshot({ path: `${evidence}/${name}.png`, fullPage: true, animations: 'disabled' })
}
const photo = async (page, width, height) => Buffer.from(await page.evaluate(({ width, height }) => {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#98332a'; ctx.fillRect(0, 0, width, height)
  ctx.fillStyle = '#e6b53a'; ctx.fillRect(width / 3, height / 3, width / 3, height / 3)
  return canvas.toDataURL('image/png').split(',')[1]
}, { width, height }), 'base64')

try {
  await waitForServer()
  browser = await chromium.launch({ channel: 'chrome', headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' })
  page = await context.newPage()
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'warning' && /hydration/i.test(message.text())) errors.push(message.text()) })

  await page.goto(origin + '/')
  await waitPath(page, '/campus-map')
  assert.equal(await page.getByRole('link', { name: 'Home', exact: true }).count(), 0)
  check('guest root redirects to the campus map without Home navigation')

  for (const role of ['student', 'aspiring-tenant', 'current-tenant', 'oas', 'admin']) {
    await context.clearCookies()
    const start = fixture.state.requests.length
    await login(page, role)
    await waitPath(page, ['oas', 'admin'].includes(role) ? '/admin' : '/dashboard')
    await page.getByRole('heading', { level: 1 }).waitFor()
    const requests = fixture.state.requests.slice(start).map(request => request.path)
    if (role === 'student') {
      await page.getByRole('heading', { name: 'Latest announcements' }).waitFor()
      assert.equal(await page.getByText('Available spaces', { exact: true }).count(), 0)
      assert.equal(await page.getByText('Campus announcement 4', { exact: true }).count(), 0)
      assert(!requests.includes('/api/rental-applications'))
      assert(!requests.includes('/api/dashboard/billing-summary'))
    }
    if (role === 'aspiring-tenant') {
      await page.getByText('applications in total', { exact: false }).waitFor()
      assert.match(await page.locator('main').innerText(), /23 applications in total/)
      assert.equal(await page.getByText('Space 4', { exact: true }).count(), 0)
      assert(!requests.includes('/api/dashboard/billing-summary'))
    }
    if (role === 'current-tenant') {
      await page.getByText('Active tenancy contracts').waitFor()
      assert.match(await page.locator('main').innerText(), /4\s+Active tenancy contracts/)
      assert.match(await page.locator('main').innerText(), /7,500\.00/)
      assert(!requests.includes('/api/dashboard/property-summary'))
      assert(!requests.includes('/api/rental-applications'))
    }
    await page.goto(origin + '/')
    await waitPath(page, ['oas', 'admin'].includes(role) ? '/admin' : '/dashboard')
    check(`${role} login and root use the correct dashboard with permitted resources`)
  }

  await context.clearCookies()
  await login(page, 'current-tenant', 'test-password', '/bills?page=2')
  await waitPath(page, '/bills?page=2')
  check('authorized protected deep link survives sign-in')
  await context.clearCookies()
  await login(page, 'student', 'test-password', '/admin/users')
  await waitPath(page, '/dashboard')
  await context.clearCookies()
  await login(page, 'student', 'test-password', '//example.com')
  await waitPath(page, '/dashboard')
  check('unauthorized and external sign-in destinations fall back to the role dashboard')

  await control({ role: 'oas', security: { mfaEnabled: false, enrollmentDeadline: Date.now() - 1000 } })
  await context.clearCookies()
  await login(page, 'oas')
  await waitPath(page, '/account?section=security')
  await page.getByRole('button', { name: 'Set up authenticator' }).first().waitFor()
  await page.getByRole('button', { name: 'Set up authenticator' }).first().click()
  await page.getByText('SYNTHETIC-SETUP-KEY', { exact: true }).waitFor()
  await chooseSection(page, 'Profile')
  await chooseSection(page, 'Security')
  await page.getByText('SYNTHETIC-SETUP-KEY', { exact: true }).waitFor()
  await page.getByLabel('Authenticator code', { exact: true }).fill('000000')
  await page.getByRole('button', { name: 'Enable authenticator' }).click()
  await page.getByText('Invalid authenticator code', { exact: true }).waitFor()
  await page.getByLabel('Authenticator code', { exact: true }).fill('123456')
  await page.getByRole('button', { name: 'Enable authenticator' }).click()
  await page.getByText('QA-RECOVERY-ONE', { exact: false }).waitFor()
  await chooseSection(page, 'Preferences')
  await chooseSection(page, 'Security')
  await page.getByText('QA-RECOVERY-ONE', { exact: false }).waitFor()
  check('overdue enrollment opens Security; setup, errors, enabling and recovery codes survive section switches')

  await control({ role: 'oas', security: { mfaEnabled: false, enrollmentDeadline: Date.now() + 86400000 } })
  await context.clearCookies()
  await login(page, 'oas')
  await waitPath(page, '/admin')
  await page.goto(origin + '/account')
  await page.getByText('Authenticator enrollment required', { exact: true }).waitFor()
  await page.getByRole('heading', { name: 'Employee details', exact: true }).waitFor()
  await page.getByLabel('Position', { exact: true }).fill('Campus Property Officer')
  await page.getByRole('button', { name: 'Save Changes', exact: true }).click()
  await page.getByText('Profile updated', { exact: true }).waitFor()
  assert.equal(fixture.profiles.get('oas').position, 'Campus Property Officer')
  await snapshot(page, 'account-oas-enrollment-light')
  check('pending enrollment keeps the deadline notice and staff profile fields without blocking before the deadline')

  await control({ role: 'admin', security: { passwordChangeRequired: true } })
  await context.clearCookies()
  await login(page, 'admin', 'test-password', '/admin/users')
  await waitPath(page, '/account?section=security')
  await page.goto(origin + '/admin')
  await waitPath(page, '/account?section=security')
  check('password-expired accounts enter Security before requested or direct dashboard routes')
  await control({ role: 'admin', security: { passwordChangeRequired: false } })

  await context.clearCookies()
  await login(page, 'admin', 'mfa')
  await page.getByRole('heading', { name: 'Verify your sign-in' }).waitFor()
  await page.getByLabel('Authenticator or recovery code', { exact: true }).fill('123456')
  await page.getByRole('button', { name: 'Verify sign-in' }).click()
  await waitPath(page, '/admin')
  check('MFA sign-in completion uses the authenticated role dashboard')

  await context.clearCookies()
  await login(page, 'student')
  await waitPath(page, '/dashboard')
  await page.goto(origin + '/account?section=profile')
  await page.getByLabel('Full name', { exact: true }).waitFor()
  assert.equal(await page.getByRole('heading', { name: 'Employee details' }).count(), 0)
  assert.equal(await page.getByLabel('Email address', { exact: true }).isDisabled(), true)
  assert.equal(await page.getByRole('button', { name: 'Save Changes', exact: true }).isDisabled(), true)
  await page.getByLabel('Full name', { exact: true }).fill('  Revised Campus User  ')
  await chooseSection(page, 'Security')
  await chooseSection(page, 'Profile')
  assert.equal(await page.getByLabel('Full name', { exact: true }).inputValue(), '  Revised Campus User  ')
  await page.goBack(); await page.goBack()
  assert.equal(await page.getByLabel('Full name', { exact: true }).inputValue(), '  Revised Campus User  ')
  check('Profile defaults, locked email, role fields, dirty state, section URLs and history work correctly')

  page.once('dialog', dialog => dialog.dismiss())
  await page.getByRole('link', { name: 'Dashboard', exact: true }).click()
  assert.equal(new URL(page.url()).pathname, '/account')
  assert.equal(await page.getByLabel('Full name', { exact: true }).inputValue(), '  Revised Campus User  ')
  check('cancelling unsaved navigation retains the profile draft')

  await page.getByRole('button', { name: 'Account menu', exact: true }).click()
  page.once('dialog', dialog => dialog.dismiss())
  const logoutCount = fixture.state.requests.filter(request => request.path === '/api/auth/logout').length
  await page.getByRole('menuitem', { name: 'Sign out', exact: true }).click()
  assert.equal(fixture.state.requests.filter(request => request.path === '/api/auth/logout').length, logoutCount)
  assert.equal(await page.getByLabel('Full name', { exact: true }).inputValue(), '  Revised Campus User  ')
  const nativeReload = page.waitForEvent('dialog')
  const reloading = page.reload().catch(() => {})
  const warning = await nativeReload
  assert.equal(warning.type(), 'beforeunload')
  await warning.dismiss()
  await reloading
  check('unsaved sign-out and reload require a decision before discarding edits')

  await control({ fail: ['/api/auth/account'] })
  await page.getByRole('button', { name: 'Save Changes', exact: true }).click()
  await page.getByText('Synthetic request failure. Please retry.', { exact: true }).waitFor()
  assert.equal(await page.getByLabel('Full name', { exact: true }).inputValue(), '  Revised Campus User  ')
  await control({ fail: [], delay: 350 })
  await page.getByRole('button', { name: 'Save Changes', exact: true }).click()
  assert.equal(await page.getByLabel('Full name', { exact: true }).isDisabled(), true)
  await page.getByText('Profile updated', { exact: true }).waitFor()
  assert.equal(await page.getByLabel('Full name', { exact: true }).inputValue(), 'Revised Campus User')
  const saved = fixture.state.requests.filter(request => request.path === '/api/auth/account' && request.body).at(-1)
  assert.deepEqual(saved.body, { fullName: 'Revised Campus User' })
  assert.equal(await page.getByRole('button', { name: 'Save Changes', exact: true }).isDisabled(), true)
  await control({ delay: 0 })
  check('failed saves retain edits; successful saves send normalized changed fields and synchronize account state')

  await page.locator('input[type=file]').setInputFiles({ name: 'invalid.txt', mimeType: 'text/plain', buffer: Buffer.from('not an image') })
  await page.getByText('Please choose an image file.', { exact: true }).waitFor()
  await page.locator('input[type=file]').setInputFiles({ name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('corrupted image') })
  let dialog = page.getByRole('dialog', { name: 'Crop your profile photo' })
  await dialog.getByText('This image could not be opened. Choose another photo.', { exact: true }).waitFor()
  assert.equal(await dialog.getByRole('button', { name: 'Crop & upload', exact: true }).isDisabled(), true)
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  check('non-images and undecodable images fail visibly without enabling crop confirmation')

  const repeatPhoto = { name: 'repeat.png', mimeType: 'image/png', buffer: await photo(page, 400, 600) }
  await page.locator('input[type=file]').setInputFiles(repeatPhoto)
  await cropReady(page)
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.locator('input[type=file]').setInputFiles(repeatPhoto)
  await cropReady(page)
  dialog = page.getByRole('dialog', { name: 'Crop your profile photo' })
  await page.evaluate(() => { window.qaToBlob = HTMLCanvasElement.prototype.toBlob; HTMLCanvasElement.prototype.toBlob = callback => callback(null) })
  await dialog.getByRole('button', { name: 'Crop & upload', exact: true }).click()
  await dialog.getByText('Unable to export this crop. Please try again.', { exact: true }).waitFor()
  await page.evaluate(() => { HTMLCanvasElement.prototype.toBlob = () => { throw new Error('Synthetic export error') } })
  await dialog.getByRole('button', { name: 'Crop & upload', exact: true }).click()
  await dialog.getByText('Unable to export this crop. Please try another image.', { exact: true }).waitFor()
  await page.evaluate(() => { HTMLCanvasElement.prototype.toBlob = window.qaToBlob; delete window.qaToBlob })
  await control({ fail: ['/api/upload'] })
  await dialog.getByRole('button', { name: 'Crop & upload', exact: true }).click()
  await page.getByText('Synthetic request failure. Please retry.', { exact: true }).waitFor()
  await control({ fail: [] })
  check('reselecting a cancelled image works; export and upload errors give recoverable feedback')

  await page.getByLabel('Bio', { exact: true }).fill('Unsaved bio survives photo updates')
  for (const [name, width, height] of [['portrait', 400, 800], ['landscape', 800, 400], ['square', 500, 500]]) {
    await page.locator('input[type=file]').setInputFiles({ name: `${name}.png`, mimeType: 'image/png', buffer: await photo(page, width, height) })
    const crop = page.getByRole('dialog', { name: 'Crop your profile photo' })
    await crop.getByRole('button', { name: 'Crop & upload', exact: true }).waitFor()
    await cropReady(page)
    const alignment = await page.evaluate(() => {
      const area = document.querySelector('.avatar-crop-viewport').getBoundingClientRect()
      const stencil = document.querySelector('.vue-rectangle-stencil').getBoundingClientRect()
      return { dx: Math.abs((area.left + area.width / 2) - (stencil.left + stencil.width / 2)), dy: Math.abs((area.top + area.height / 2) - (stencil.top + stencil.height / 2)), square: Math.abs(stencil.width - stencil.height) }
    })
    assert(alignment.dx < 3 && alignment.dy < 3 && alignment.square < 2, JSON.stringify({ name, alignment }))
    await page.screenshot({ path: `${evidence}/crop-${name}-desktop.png` })
    await crop.getByRole('button', { name: 'Zoom in', exact: true }).click()
    await crop.getByRole('button', { name: 'Zoom out', exact: true }).click()
    if (name === 'landscape') {
      const stencil = page.locator('.vue-rectangle-stencil')
      const previous = await stencil.getAttribute('style')
      const bounds = await stencil.boundingBox()
      await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
      await page.mouse.down()
      await page.mouse.move(bounds.x + bounds.width / 2 + 24, bounds.y + bounds.height / 2, { steps: 5 })
      await page.mouse.up()
      await page.waitForFunction(previous => document.querySelector('.vue-rectangle-stencil')?.getAttribute('style') !== previous, previous)
    }
    await page.setViewportSize({ width: 390, height: 844 })
    assert.deepEqual(await overflow(page), { width: 390, scroll: 390 })
    await page.screenshot({ path: `${evidence}/crop-${name}-mobile.png` })
    await crop.getByRole('button', { name: 'Crop & upload', exact: true }).click()
    await page.getByText('Profile photo updated', { exact: true }).first().waitFor()
    await crop.waitFor({ state: 'hidden' })
    assert.equal(await page.getByLabel('Bio', { exact: true }).inputValue(), 'Unsaved bio survives photo updates')
    const uploaded = fixture.state.uploads.at(-1)
    assert(uploaded.width > 0 && uploaded.width === uploaded.height)
    await page.setViewportSize({ width: 1440, height: 1000 })
    check(`${name} crop is centered and square, supports zoom/mobile resize and exports a square PNG without losing profile edits`)
  }
  await page.getByRole('button', { name: 'Remove', exact: true }).click()
  await page.getByText('Profile photo removed', { exact: true }).waitFor()
  assert.equal(await page.getByLabel('Bio', { exact: true }).inputValue(), 'Unsaved bio survives photo updates')
  await page.getByRole('button', { name: 'Save Changes', exact: true }).click()
  await page.waitForFunction(() => [...document.querySelectorAll('button')].find(element => element.textContent.trim() === 'Save Changes')?.disabled)
  check('photo removal preserves profile edits')

  await page.getByRole('button', { name: 'Account menu', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Account settings', exact: true }).click()
  await waitPath(page, '/account?section=security')
  await page.reload()
  await page.getByRole('heading', { name: 'Change password', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Account menu', exact: true }).click()
  await page.getByRole('menuitem', { name: 'My account', exact: true }).click()
  await waitPath(page, '/account?section=profile')
  check('dropdown links select distinct account sections and survive refresh')

  await page.goto(origin + '/account?section=unknown')
  await page.getByRole('region', { name: 'Profile', exact: true }).waitFor()
  await page.getByRole('navigation', { name: 'Account settings' }).getByRole('link', { name: 'Profile', exact: true }).focus()
  await page.keyboard.press('Tab')
  assert.equal(await page.getByRole('navigation', { name: 'Account settings' }).getByRole('link', { name: 'Security', exact: true }).evaluate(element => element === document.activeElement), true)
  await page.keyboard.press('Enter')
  await waitPath(page, '/account?section=security')
  await chooseSection(page, 'Profile')
  check('unknown sections default to Profile and settings navigation works with the keyboard')

  for (const [width, height] of [[1440, 1000], [390, 844], [320, 740]]) {
    await page.setViewportSize({ width, height })
    for (const theme of ['light', 'dark']) {
      await page.evaluate(theme => { localStorage.setItem('nuxt-color-mode', theme) }, theme)
      await page.reload()
      await page.getByLabel('Full name', { exact: true }).waitFor()
      assert.deepEqual(await overflow(page), { width, scroll: width })
      await snapshot(page, `account-${width}-${theme}`)
    }
  }
  check('account layout has no horizontal overflow at desktop, mobile and narrow mobile sizes in both themes')

  await page.setViewportSize({ width: 1440, height: 1000 })
  await chooseSection(page, 'Preferences')
  await page.getByRole('combobox', { name: 'Color theme' }).click()
  await page.getByRole('option', { name: 'Dark', exact: true }).click()
  await page.waitForFunction(() => document.documentElement.classList.contains('dark'))
  await page.getByRole('button', { name: 'Toggle color theme' }).click()
  await page.waitForFunction(() => !document.documentElement.classList.contains('dark'))
  check('Preferences theme and global theme control stay synchronized')

  await chooseSection(page, 'Security')
  await page.getByLabel('Current password', { exact: true }).fill('current')
  await page.getByLabel('New password', { exact: true }).fill('StrongPassword!123')
  await page.getByLabel('Confirm new password', { exact: true }).fill('DifferentPassword!123')
  await page.getByRole('button', { name: 'Update password', exact: true }).click()
  await page.getByText('New passwords do not match.', { exact: true }).waitFor()
  await page.getByLabel('Confirm new password', { exact: true }).fill('StrongPassword!123')
  await page.getByRole('button', { name: 'Update password', exact: true }).click()
  await waitPath(page, '/login')
  check('password validation is preserved and a successful change requires a new sign-in')

  await login(page, 'aspiring-tenant')
  await waitPath(page, '/dashboard')
  await control({ fail: ['/api/dashboard/property-summary'] })
  await page.reload()
  await page.getByText('Unable to load property overview', { exact: true }).waitFor()
  assert.match(await page.locator('main').innerText(), /23 applications in total/)
  await control({ fail: [] })
  await page.getByRole('button', { name: 'Retry', exact: true }).click()
  await page.getByText('Available spaces', { exact: true }).waitFor()
  check('a failed dashboard resource shows its own error while other resources remain usable, and retry recovers')

  await control({ empty: true })
  await page.reload()
  await page.getByText('You have no rental applications yet.', { exact: false }).waitFor()
  await page.getByText('No announcements are available right now.', { exact: true }).waitFor()
  check('empty dashboard datasets show honest empty states')
  await control({ empty: false })
  await page.setViewportSize({ width: 390, height: 844 })
  for (const role of ['student', 'aspiring-tenant', 'current-tenant']) {
    await context.clearCookies()
    await login(page, role)
    await waitPath(page, '/dashboard')
    await page.getByRole('heading', { name: 'Latest announcements' }).waitFor()
    assert.deepEqual(await overflow(page), { width: 390, scroll: 390 })
    for (const theme of ['light', 'dark']) {
      await page.evaluate(theme => localStorage.setItem('nuxt-color-mode', theme), theme)
      await page.reload()
      await snapshot(page, `dashboard-${role}-mobile-${theme}`)
      await page.setViewportSize({ width: 1440, height: 1000 })
      await snapshot(page, `dashboard-${role}-desktop-${theme}`)
      await page.setViewportSize({ width: 390, height: 844 })
    }
  }
  check('each member dashboard fits mobile and switching accounts replaces the previous role data')

  await page.getByRole('button', { name: 'Account menu', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Sign out', exact: true }).click()
  await waitPath(page, '/campus-map')
  check('sign-out returns to the campus map')
  assert.deepEqual(errors, [], 'browser exceptions or hydration warnings')
  await context.close()
} catch (error) {
  if (page && !page.isClosed()) {
    await page.screenshot({ path: `${evidence}/failure.png`, fullPage: true })
    await writeFile(`${evidence}/failure.html`, await page.content())
  }
  throw error
} finally {
  await writeFile(`${evidence}/verification.json`, JSON.stringify({ checks, errors, serverLog: serverLog.slice(-3000) }, null, 2))
  await browser?.close()
  server.kill()
  await new Promise(resolve => fixture.server.close(resolve))
}
console.log(`${checks.length} browser checks passed`)
