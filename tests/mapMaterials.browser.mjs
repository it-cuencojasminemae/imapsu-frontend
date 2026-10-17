// Run against a local Nuxt dev server. API fixtures are intercepted in this
// browser only; no property records or account settings are written.
// Set NODE_PATH to the bundled Playwright runtime when needed.
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
const { chromium } = createRequire(import.meta.url)('playwright')
const evidence = fileURLToPath(new URL('../../docs/map-color-evidence/', import.meta.url))
await mkdir(evidence, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
const errors = [], checks = []
page.on('pageerror', error => errors.push(error.message))
const space = (id, building, space_status) => ({ id, documentId: `color-preview-${id}`, propertyCode: `COLOR-${id}`, name: `Preview stall ${id}`, building, space_status, photos: [], tenantPhotos: [] })
let records = [space(1, 'IT & Engineering Laboratory Building', 'Occupied'), space(2, 'UNIVERSITY HOSTEL', 'Vacant'), space(3, 'UNIVERSITY HOSTEL', 'Occupied')]
await page.route('**/api/property-spaces?**', route => route.fulfill({ json: { data: records, meta: { pagination: { page: 1, pageSize: 100, pageCount: 1, total: records.length } } } }))
await page.route('**/api/map-labels?**', route => route.fulfill({ json: { data: [], meta: { pagination: { page: 1, pageSize: 100, pageCount: 0, total: 0 } } } }))
await page.route('**/api/auth/me', route => route.fulfill({ status: 401, json: { error: { message: 'Guest preview' } } }))
const refresh = async () => {
  await page.evaluate(async () => { await window.mapTestPage().refreshProperties() })
  await page.waitForTimeout(150)
}
const materials = async name => page.evaluate(name => {
  const node = window.mapTestViewer().modelGroup.children.find(node => node.name === name)
  const result = []
  node.traverse(object => {
    if (!object.isMesh) return
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      result.push({ name: material.name, color: material.color?.getHexString(), metalness: material.metalness, opacity: material.opacity, map: !!material.map, vertexColors: material.vertexColors })
    }
  })
  return result
}, name)
try {
  await page.goto(`${process.env.MAP_PREVIEW_URL ?? 'http://localhost:3000'}/campus-map`, { timeout: 120000 })
  await page.waitForSelector('canvas[data-render-count]', { timeout: 120000 })
  await page.waitForFunction(() => document.querySelector('input[aria-label="Search campus buildings or businesses"]')?.disabled === false)
  await page.evaluate(() => {
    window.mapTestViewer = () => document.querySelector('canvas').parentElement.__vueParentComponent.devtoolsRawSetupState
    window.mapTestPage = () => {
      let component = document.querySelector('canvas').parentElement.__vueParentComponent
      while (component && component.type.__name !== 'campus-map') component = component.parent
      return component.devtoolsRawSetupState
    }
  })
  await refresh()
  assert.ok((await materials('17')).every(m => m.color === 'b84034' && m.opacity === 1 && !m.map && !m.vertexColors))
  assert.ok((await materials('44')).every(m => m.color === '22c55e'))
  assert.ok((await materials('road')).every(m => m.color === '000000' && m.metalness === 0))
  assert.equal((await materials('ground')).find(m => m.name === 'Material.012').color, 'b0b0b0')
  assert.equal((await materials('39')).find(m => /grass/i.test(m.name)).color, 'b0b0b0')
  assert.ok((await materials('18')).filter(m => /roof/i.test(m.name)).every(m => m.color === '808080' && m.metalness === 0))
  checks.push('actual GLB: opaque red/green buildings, mixed occupancy resolves green, gray roofs/landscaping, black road')

  records = [space(1, 'IT & Engineering Laboratory Building', 'Vacant')]
  await refresh()
  assert.ok((await materials('17')).every(m => m.color === '22c55e'))
  assert.ok((await materials('44')).filter(m => /greeny/i.test(m.name)).every(m => m.color === '808080'))
  records = []
  await refresh()
  assert.ok((await materials('17')).filter(m => /roof/i.test(m.name)).every(m => m.color === '808080'))
  assert.ok((await materials('17')).some(m => m.color !== '808080'))
  checks.push('property refresh changes red to green and restores revised defaults when listings disappear')

  records = [space(1, 'IT & Engineering Laboratory Building', 'Occupied'), space(2, 'UNIVERSITY HOSTEL', 'Vacant')]
  await refresh()
  for (const theme of ['light', 'dark']) {
    await page.evaluate(theme => { window.mapTestViewer().colorMode.preference = theme }, theme)
    for (const [width, height] of [[1440, 900], [390, 844]]) {
      await page.setViewportSize({ width, height })
      await page.getByRole('button', { name: /^Reset view$/i }).click()
      await page.waitForTimeout(700)
      await page.screenshot({ path: `${evidence}/${theme}-${width}.png` })
      assert.equal(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight), false)
    }
  }
  checks.push('desktop/mobile in light/dark themes without page overflow')

  await page.setViewportSize({ width: 1440, height: 900 })
  const search = page.getByRole('textbox', { name: 'Search campus buildings or businesses' })
  await search.fill('IT & Engineering')
  await page.getByRole('button', { name: /IT & Engineering Laboratory Building/i }).first().click()
  await page.waitForTimeout(500)
  assert.equal(await page.evaluate(() => window.mapTestViewer().props.activeBuildingOrder), 17)
  assert.ok(await page.evaluate(() => window.mapTestViewer().hoverEdges.get('17').visible))
  assert.ok((await materials('17')).every(m => m.color === 'b84034'))
  await page.screenshot({ path: `${evidence}/occupied-selected.png` })
  await page.locator('.map-details').getByRole('button', { name: 'Close', exact: true }).click()
  await page.getByRole('button', { name: /^Reset view$/i }).click()
  await page.waitForTimeout(400)
  const zoom = await page.evaluate(() => window.mapTestViewer().camera.zoom)
  await page.mouse.move(750, 500)
  await page.mouse.wheel(0, -500)
  await page.waitForTimeout(300)
  assert.ok(await page.evaluate(zoom => window.mapTestViewer().camera.zoom > zoom, zoom))
  await page.getByRole('button', { name: /^Reset view$/i }).click()
  await page.getByRole('button', { name: 'Hide Labels', exact: true }).click()
  assert.equal(await page.locator('.campus-map-label').count(), 0)
  await page.getByRole('button', { name: 'Show Labels', exact: true }).click()
  assert.ok(await page.locator('.campus-map-label').count() > 0)
  await page.getByRole('button', { name: 'Fullscreen', exact: true }).click()
  await page.waitForTimeout(500)
  assert.ok(await page.evaluate(() => !!document.fullscreenElement))
  await page.getByRole('button', { name: /^Exit fullscreen$/i }).click()
  checks.push('search, selection highlight, zoom/reset, labels, and fullscreen')

  // Emulate the student role in browser memory to verify the existing filter.
  await page.evaluate(() => { window.mapTestPage().auth.user.value = { id: -1, role: { type: 'student' } } })
  await page.waitForTimeout(300)
  assert.equal(await page.evaluate(() => window.mapTestViewer().props.statusByOrder['44']), undefined)
  assert.ok((await materials('44')).filter(m => /greeny/i.test(m.name)).every(m => m.color === '808080'))
  checks.push('student filtering removes vacancy fills and restores neutral roofs')
  assert.deepEqual(errors, [])
  await writeFile(`${evidence}/verification.json`, JSON.stringify({ checks, errors }, null, 2))
  console.log({ checks, errors })
} catch (error) {
  await page.screenshot({ path: `${evidence}/failure.png` }).catch(() => {})
  console.log({ errors })
  throw error
} finally {
  await browser.close()
}
