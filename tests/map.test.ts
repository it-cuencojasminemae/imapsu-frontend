import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { fetchMapPages } from '../app/utils/mapPagination.ts'
import { boxCorners, frameMapBox, mapGeometryPoints, constrainMapTarget, unobscuredMapInsets, isMapHighlightActive, mapPropertyStatus } from '../app/utils/mapPresentation.ts'

test('unknown property status cannot be presented as occupied or vacant', () => {
  assert.equal(mapPropertyStatus('Vacant'), 'Vacant')
  assert.equal(mapPropertyStatus('Occupied'), 'Occupied')
  for (const status of [null, undefined, '', 'Unavailable', 'Pending']) assert.equal(mapPropertyStatus(status), null)
})

test('map pagination follows metadata and keeps every record past the API limit', async () => {
  const calls: number[] = []
  const result = await fetchMapPages<number>(async (page, pageSize) => {
    assert.equal(pageSize, 100)
    calls.push(page)
    return { data: Array.from({ length: page === 3 ? 5 : 100 }, (_, i) => (page - 1) * 100 + i), meta: { pagination: { page, pageSize, pageCount: 3, total: 205 } } }
  })
  assert.deepEqual(calls, [1, 2, 3])
  assert.equal(result.data.length, 205)
  assert.equal(result.data[204], 204)
})

test('empty permitted data is valid; a failed later page never returns a partial list', async () => {
  assert.deepEqual(await fetchMapPages(async () => ({ data: [], meta: { pagination: { page: 1, pageSize: 100, pageCount: 0, total: 0 } } })), { data: [] })
  await assert.rejects(fetchMapPages(async page => {
    if (page === 2) throw new Error('Forbidden')
    return { data: [1], meta: { pagination: { page, pageSize: 100, pageCount: 2, total: 101 } } }
  }), /Forbidden/)
  await assert.rejects(fetchMapPages(async () => ({ data: [1] })), /pagination is unavailable/)
  await assert.rejects(fetchMapPages(async page => ({ data: [], meta: { pagination: { page, pageSize: 100, pageCount: 2, total: 101 } } })), /Incomplete/)
})

test('selection persists after hover clears and duplicate names can select separately', () => {
  const selected = new Set(['19'])
  assert.equal(isMapHighlightActive('19', selected, '50'), true)
  assert.equal(isMapHighlightActive('50', selected, '50'), true)
  assert.equal(isMapHighlightActive('19', selected, null), true)
  assert.equal(isMapHighlightActive('50', selected, null), false)
})

for (const [width, height, insets] of [
  [1440, 900, { top: 148, right: 16, bottom: 112, left: 376 }],
  [768, 1024, { top: 148, right: 16, bottom: 112, left: 16 }],
  [390, 844, { top: 184, right: 16, bottom: 376, left: 16 }],
  [390, 640, { top: 184, right: 16, bottom: 318, left: 16 }]
] as const) {
  test(`all projected campus corners fit outside panels at ${width}×${height}`, () => {
    const box = new THREE.Box3(new THREE.Vector3(-320, -2, -200), new THREE.Vector3(270, 60, 350))
    const initial = box.clone()
    const direction = new THREE.Vector3(1, 1.5, 0.35).normalize()
    const frame = frameMapBox(box, direction, width, height, 800, insets)
    const camera = new THREE.OrthographicCamera(-800 * width / height / 2, 800 * width / height / 2, 400, -400, 0.1, 10000)
    camera.position.copy(frame.position)
    camera.lookAt(frame.target)
    camera.zoom = frame.zoom
    camera.setViewOffset(width, height, frame.offset.x, frame.offset.y, width, height)
    camera.updateProjectionMatrix()
    camera.updateMatrixWorld()
    for (const corner of boxCorners(box)) {
      corner.project(camera)
      const x = (corner.x + 1) * width / 2, y = (1 - corner.y) * height / 2
      assert.ok(x >= insets.left && x <= width - insets.right, `x=${x}`)
      assert.ok(y >= insets.top && y <= height - insets.bottom, `y=${y}`)
    }
    assert.ok(box.equals(initial), 'framing must not alter model bounds')
  })
}

test('rotated elongated meshes retain tight projected bounds without changing geometry', () => {
  const root = new THREE.Group()
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1000, 20, 120))
  mesh.rotation.y = Math.PI / 4
  root.add(mesh)
  const bounds = new THREE.Box3().setFromObject(root)
  const direction = new THREE.Vector3(1, 1.5, -1).normalize()
  const points = mapGeometryPoints(root)
  const tight = frameMapBox(bounds, direction, 1440, 900, 800, { top: 16, right: 16, bottom: 16, left: 16 }, 1.12, points)
  const loose = frameMapBox(bounds, direction, 1440, 900, 800, { top: 16, right: 16, bottom: 16, left: 16 })
  assert.ok(tight.zoom > loose.zoom * 1.1)
  assert.equal(tight.target.y, bounds.getCenter(new THREE.Vector3()).y)
  assert.deepEqual(mesh.scale.toArray(), [1, 1, 1])
})

test('pan limits hold the campus plane and allow closer exploration near every edge', () => {
  const box = new THREE.Box3(new THREE.Vector3(-500, 0, -100), new THREE.Vector3(500, 50, 100))
  const points = boxCorners(box), direction = new THREE.Vector3(1, 1.5, 0.35).normalize()
  for (const x of [-10000, 10000]) for (const z of [-10000, 10000]) {
    const distant = new THREE.Vector3(x, 1000, z)
    const overview = constrainMapTarget(distant, box, points, direction, 1500, 1000)
    const close = constrainMapTarget(distant, box, points, direction, 20, 20)
    assert.equal(overview.y, 25)
    assert.equal(close.y, 25)
    assert.ok(Math.abs(close.x) <= 550 && Math.abs(close.z) <= 110)
    assert.ok(close.distanceTo(box.getCenter(new THREE.Vector3())) > overview.distanceTo(box.getCenter(new THREE.Vector3())))
  }
})

test('corner panels leave a tall clear viewport instead of wasting full-width strips', () => {
  const panels = [
    { left: 16, right: 356, top: 16, bottom: 162 },
    { left: 1088, right: 1424, top: 16, bottom: 70 },
    { left: 1220, right: 1424, top: 716, bottom: 820 }
  ]
  const insets = unobscuredMapInsets(1440, 837, panels, 0.75)
  assert.ok(837 - insets.top - insets.bottom > 790)
  for (const panel of panels) {
    assert.ok(insets.left >= panel.right || 1440 - insets.right <= panel.left || insets.top >= panel.bottom || 837 - insets.bottom <= panel.top)
  }
})
