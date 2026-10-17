// Run against the local dev server and the in-memory UI fixture API.
// NODE_PATH may point at the bundled Playwright runtime; no app dependency is required.
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
const { chromium } = createRequire(import.meta.url)('playwright')
const mode = process.argv[2] ?? 'after'
const evidence = fileURLToPath(new URL('../../docs/map-camera-evidence/', import.meta.url))
await mkdir(evidence, { recursive: true })
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' })
const errors = []
const checks = []
page.on('pageerror', error => errors.push(error.message))
const snapshot = () => page.evaluate(() => {
  const s = document.querySelector('canvas').parentElement.__vueParentComponent.devtoolsRawSetupState
  const c = s.camera, controls = s.controls
  c.updateMatrixWorld()
  const width = s.container.value.clientWidth, height = s.container.value.clientHeight
  const project = points => {
    const p = points.map(point => point.clone().project(c))
    return { left: Math.min(...p.map(v => (v.x + 1) * width / 2)), right: Math.max(...p.map(v => (v.x + 1) * width / 2)), top: Math.min(...p.map(v => (1 - v.y) * height / 2)), bottom: Math.max(...p.map(v => (1 - v.y) * height / 2)) }
  }
  const focusBox = s.focusedZone ? s.zoneBounds(s.focusedZone) : null
  const focusPoints = focusBox ? [focusBox.min.x, focusBox.max.x].flatMap(x => [focusBox.min.y, focusBox.max.y].flatMap(y => [focusBox.min.z, focusBox.max.z].map(z => c.position.clone().set(x, y, z)))) : null
  return {
    target: controls.target.toArray(), position: c.position.toArray(), zoom: c.zoom,
    minZoom: controls.minZoom, maxZoom: controls.maxZoom, polar: controls.getPolarAngle(), damping: controls.enableDamping,
    animating: !!s.focusAnim, projected: project(s.campusFramePoints), width, height,
    insets: s.cameraInsets ?? s.props.viewInsets, bounds: { min: s.modelBounds.min.toArray(), max: s.modelBounds.max.toArray() },
    focused: focusPoints ? project(focusPoints) : null,
    renders: Number(document.querySelector('canvas').dataset.renderCount), scrollY,
    pageHeight: document.documentElement.scrollHeight, windowHeight: innerHeight
  }
})
const close = (a, b, message) => assert.ok(Math.abs(a - b) < 1e-5, `${message}: ${a} != ${b}`)
const assertFrame = state => {
  assert.ok(state.projected.left >= state.insets.left - 1 && state.projected.right <= state.width - state.insets.right + 1, 'campus fits horizontal safe area')
  assert.ok(state.projected.top >= state.insets.top - 1 && state.projected.bottom <= state.height - state.insets.bottom + 1, 'campus fits vertical safe area')
  assert.equal(state.pageHeight, state.windowHeight, 'map fills viewport without page overflow')
}
const assertBounded = state => {
  assert.ok(state.zoom >= state.minZoom - 1e-5 && state.zoom <= state.maxZoom + 1e-5)
  close(state.target[1], (state.bounds.min[1] + state.bounds.max[1]) / 2, 'target stays on campus plane')
  for (const axis of [0, 2]) {
    const padding = (state.bounds.max[axis] - state.bounds.min[axis]) * 0.05
    assert.ok(state.target[axis] >= state.bounds.min[axis] - padding - 1e-5 && state.target[axis] <= state.bounds.max[axis] + padding + 1e-5)
  }
  assert.ok(state.polar >= Math.PI / 12 - 1e-5 && state.polar <= 70 * Math.PI / 180 + 1e-5)
}
try {
  await page.goto('http://127.0.0.1:3200/campus-map')
  await page.waitForSelector('canvas[data-render-count]')
  await page.waitForFunction(() => document.querySelector('input[aria-label="Search campus buildings or businesses"]')?.disabled === false)
  await page.waitForTimeout(4000)
  console.log(await page.evaluate(() => {
    const s = document.querySelector('canvas').parentElement.__vueParentComponent.devtoolsRawSetupState
    return { bounds: s.modelBounds, zoom: s.camera.zoom, target: s.controls.target, insets: s.props.viewInsets, nodes: s.modelGroup.children.length, height: document.documentElement.scrollHeight }
  }))
  for (const [width, height] of [[1440, 900], [768, 1024], [390, 844]]) {
    await page.setViewportSize({ width, height })
    await page.getByRole('button', { name: /^Reset view$/i }).click()
    await page.waitForTimeout(1200)
    await page.screenshot({ path: `${evidence}/${mode}-${width}-reset.png` })
    if (mode !== 'before') { assertFrame(await snapshot()); checks.push(`reset fit and canvas overflow at ${width}px`) }
  }
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.getByRole('button', { name: /^Reset view$/i }).click()
  // Identical pan gesture repeated before and after the change.
  await page.mouse.move(1100, 500)
  await page.mouse.down({ button: 'right' })
  await page.mouse.move(1100, 200, { steps: 20 })
  await page.mouse.up({ button: 'right' })
  await page.waitForTimeout(1600)
  await page.screenshot({ path: `${evidence}/${mode}-1440-pan.png` })
  if (mode !== 'before') {
    assertBounded(await snapshot())
    const reset = page.getByRole('button', { name: /^Reset view$/i })
    await reset.click()
    await page.waitForTimeout(300)
    const initial = await snapshot()
    await page.mouse.move(700, 450)
    for (let i = 0; i < 16; i++) await page.mouse.wheel(0, -1200)
    await page.waitForTimeout(1200)
    const zoomed = await snapshot()
    close(zoomed.zoom, zoomed.maxZoom, 'wheel zoom-in limit')
    initial.target.forEach((v, i) => close(v, zoomed.target[i], 'wheel does not move target'))
    assert.equal(zoomed.scrollY, 0)
    for (const [dx, dy] of [[450, 0], [-450, 0], [0, 350], [0, -350]]) {
      for (let i = 0; i < 4; i++) {
        await page.mouse.move(720, 480)
        await page.mouse.down({ button: 'right' })
        await page.mouse.move(720 + dx, 480 + dy, { steps: 10 })
        await page.mouse.up({ button: 'right' })
      }
      await page.waitForTimeout(1200)
      assertBounded(await snapshot())
    }
    checks.push('zoom-in limit and repeated panning at all four edges')
    await reset.click()
    await page.mouse.move(700, 450)
    for (let i = 0; i < 16; i++) await page.mouse.wheel(0, 1200)
    await page.waitForTimeout(1200)
    const zoomOut = await snapshot()
    close(zoomOut.zoom, zoomOut.minZoom, 'wheel zoom-out limit')
    assertBounded(zoomOut)
    assert.equal(zoomOut.scrollY, 0)
    checks.push('zoom-out limit and wheel scroll containment')
    await page.mouse.move(700, 450)
    await page.mouse.down()
    await page.mouse.move(1000, 820, { steps: 12 })
    await page.mouse.up()
    await page.waitForTimeout(1200)
    assertBounded(await snapshot())
    // Reset while rotational damping is still in flight.
    await page.mouse.move(700, 450)
    await page.mouse.down()
    await page.mouse.move(950, 250, { steps: 5 })
    await page.mouse.up()
    await reset.click()
    await page.waitForTimeout(100)
    const freshReset = await snapshot()
    await page.waitForTimeout(1400)
    const stableReset = await snapshot()
    for (const key of ['position', 'target']) initial[key].forEach((v, i) => close(v, stableReset[key][i], `reset ${key}`))
    close(initial.zoom, stableReset.zoom, 'reset zoom')
    freshReset.position.forEach((v, i) => close(v, stableReset.position[i], 'reset clears inertia'))
    assertFrame(stableReset)
    checks.push('rotation limits and repeatable reset during damping')
    const orders = await page.evaluate(() => {
      const s = document.querySelector('canvas').parentElement.__vueParentComponent.devtoolsRawSetupState
      const nodes = s.buildingNodes.filter(b => s.buildingEntries.has(b.order)).sort((a, b) => a.corners[0].x - b.corners[0].x)
      return [nodes[0].order, nodes[Math.floor(nodes.length / 2)].order, nodes.at(-1).order]
    })
    for (const order of orders) {
      await page.evaluate(order => document.querySelector('canvas').parentElement.__vueParentComponent.exposed.focusBuilding(order), order)
      await page.waitForTimeout(1400)
      const focused = await snapshot()
      assert.ok(focused.focused, 'building selection focuses camera')
      assert.ok(focused.focused.left >= focused.insets.left - 1 && focused.focused.right <= focused.width - focused.insets.right + 1)
      assert.ok(focused.focused.top >= focused.insets.top - 1 && focused.focused.bottom <= focused.height - focused.insets.bottom + 1)
      await page.locator('.map-details').getByRole('button', { name: 'Close', exact: true }).click()
      await page.waitForTimeout(400)
      const closed = await snapshot()
      focused.position.forEach((v, i) => close(v, closed.position[i], 'closing details preserves position'))
      close(focused.zoom, closed.zoom, 'closing details preserves zoom')
      assert.equal(closed.focused, null)
    }
    checks.push('buildings at both campus ends and center remain clear of panels; closing details keeps camera')
    await reset.click()
    await page.getByRole('button', { name: 'Fullscreen', exact: true }).click()
    await page.waitForTimeout(1200)
    assert.ok(await page.evaluate(() => !!document.fullscreenElement))
    assertFrame(await snapshot())
    await page.screenshot({ path: `${evidence}/after-fullscreen.png` })
    await page.getByRole('button', { name: /^Exit fullscreen$/i }).click()
    await page.waitForTimeout(1200)
    assertFrame(await snapshot())
    checks.push('fullscreen entry and exit refit to actual canvas')
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.evaluate(order => document.querySelector('canvas').parentElement.__vueParentComponent.exposed.focusBuilding(order), orders[1])
    await page.waitForTimeout(250)
    const reduced = await snapshot()
    assert.equal(reduced.animating, false)
    assert.equal(reduced.damping, false)
    await page.locator('.map-details').getByRole('button', { name: 'Close', exact: true }).click()
    await reset.click()
    await page.waitForTimeout(500)
    const idleBefore = await snapshot()
    await page.waitForTimeout(1300)
    const idleAfter = await snapshot()
    assert.equal(idleBefore.renders, idleAfter.renders, 'render-on-demand sleeps when idle')
    checks.push('reduced motion skips camera tween and damping; idle rendering stops')
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.setViewportSize({ width: 390, height: 844 })
    await reset.click()
    await page.waitForTimeout(800)
    const beforeTouch = await snapshot()
    const client = await page.context().newCDPSession(page)
    await client.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 })
    const touches = [{ x: 150, y: 450 }, { x: 240, y: 450 }]
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: touches })
    for (let i = 1; i <= 10; i++) await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 150 - i * 6, y: 450 + i * 6 }, { x: 240 + i * 6, y: 450 + i * 6 }] })
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await page.waitForTimeout(1400)
    const afterTouch = await snapshot()
    assertBounded(afterTouch)
    assert.ok(afterTouch.zoom > beforeTouch.zoom, 'pinch changes map zoom')
    await page.setViewportSize({ width: 768, height: 1024 })
    await page.waitForTimeout(800)
    assertBounded(await snapshot())
    await page.setViewportSize({ width: 390, height: 844 })
    await page.waitForTimeout(800)
    assertBounded(await snapshot())
    await reset.click()
    await page.waitForTimeout(800)
    assertFrame(await snapshot())
    checks.push('mobile two-finger pinch/pan, resize after manual navigation, and reset')
    // Exercise search and stall selection through their actual UI paths.
    const search = page.getByRole('textbox', { name: 'Search campus buildings or businesses' })
    await search.fill('building')
    await page.waitForTimeout(300)
    const results = page.locator('.map-heading .overflow-auto')
    const resultsBox = await results.boundingBox()
    await page.mouse.move(resultsBox.x + 80, resultsBox.y + 80)
    await page.mouse.wheel(0, 400)
    await page.waitForTimeout(300)
    assert.ok(await results.evaluate(el => el.scrollTop > 0), 'search results scroll normally')
    assert.equal((await snapshot()).scrollY, 0)
    await search.fill('CAFE HONORIO')
    await page.getByRole('button', { name: /CAFE HONORIO/i }).first().click()
    await page.waitForTimeout(1200)
    const mobileFocus = await snapshot()
    assert.ok(mobileFocus.focused.top >= mobileFocus.insets.top - 1 && mobileFocus.focused.bottom <= mobileFocus.height - mobileFocus.insets.bottom + 1)
    await page.screenshot({ path: `${evidence}/after-390-building.png` })
    await page.locator('.map-stall-card').first().click()
    await page.getByRole('dialog').waitFor()
    await page.keyboard.press('Escape')
    await page.getByRole('dialog').waitFor({ state: 'hidden' })
    await page.locator('.map-details').getByRole('button', { name: 'Close', exact: true }).click()
    checks.push('mobile search-result scrolling, building focus, stall dialog and Escape dismissal')
    await writeFile(`${evidence}/verification.json`, JSON.stringify({ checks, errors, final: await snapshot() }, null, 2))
    assert.deepEqual(errors, [])
  }
  console.log({ errors })
} catch (error) {
  console.log({ errors, text: await page.locator('body').innerText().catch(() => '') })
  await page.screenshot({ path: `${evidence}/${mode}-failure.png` }).catch(() => {})
  throw error
} finally {
  await browser.close()
}
