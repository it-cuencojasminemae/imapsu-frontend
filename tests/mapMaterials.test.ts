import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { CAMPUS_SURFACE_COLORS, prepareCampusMaterials } from '../app/utils/mapMaterials.ts'
import { MAP_STATUS_COLORS } from '../app/utils/mapZones.ts'

function addNode(root: THREE.Group, name: string, materials: THREE.MeshStandardMaterial[]) {
  const node = new THREE.Group()
  node.name = name
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), materials)
  node.add(mesh)
  root.add(node)
  return mesh
}

const surface = (name: string, color = '#c6b99a') => {
  const material = new THREE.MeshStandardMaterial({ color, metalness: 1, roughness: 0.5 })
  material.name = name
  return material
}
const hex = (material: THREE.MeshStandardMaterial) => `#${material.color.getHexString()}`

test('all authored roof variants become matte gray, including green roofs and walkway roofs', () => {
  const root = new THREE.Group()
  const names = ['Roof.001', 'Roof.002', 'Roof.003', 'Roof.004', 'roof smh', 'roof smh.001', 'Metalic GREENY.002', 'Green concrete metal roof.002', 'RED METAL', 'RED METAL.001']
  const mesh = addNode(root, '1', names.map(name => surface(name)))
  const geometry = mesh.geometry, transform = mesh.matrix.clone()
  prepareCampusMaterials(root)
  for (const material of mesh.material) {
    assert.equal(hex(material), CAMPUS_SURFACE_COLORS.roof)
    assert.equal(material.metalness, 0)
    assert.equal(material.roughness, 0.85)
  }
  assert.equal(mesh.geometry, geometry)
  assert.ok(mesh.matrix.equals(transform))
})

test('status fills are opaque and independent across buildings, roads, and gates', () => {
  const root = new THREE.Group()
  const shared = surface('metalic.001')
  shared.map = new THREE.Texture()
  shared.vertexColors = true
  shared.emissive.set('#ff0000')
  shared.emissiveMap = new THREE.Texture()
  shared.transparent = true
  shared.opacity = 0.5
  shared.alphaTest = 0.3
  const a = addNode(root, '1', [shared, surface('Roof.001')])
  const b = addNode(root, '2', [shared])
  const road = addNode(root, 'road', [shared])
  const gate = addNode(root, 'gate1', [shared])
  const styles = prepareCampusMaterials(root)
  styles.applyBuildingStatus(1, 'Occupied')
  styles.applyBuildingStatus(2, 'Vacant')

  for (const material of a.material) {
    assert.equal(hex(material), MAP_STATUS_COLORS.occupied)
    assert.equal(material.map, null)
    assert.equal(material.emissiveMap, null)
    assert.equal(material.emissive.getHex(), 0)
    assert.equal(material.vertexColors, false)
    assert.equal(material.transparent, false)
    assert.equal(material.opacity, 1)
    assert.equal(material.alphaTest, 0)
    assert.equal(material.depthWrite, true)
  }
  assert.equal(hex(b.material[0]), MAP_STATUS_COLORS.vacant)
  assert.equal(hex(road.material[0]), CAMPUS_SURFACE_COLORS.road)
  assert.equal(hex(gate.material[0]), '#c6b99a')
  assert.equal(hex(shared), '#c6b99a')
  assert.equal(shared.opacity, 0.5)
  assert.notEqual(a.material[0], b.material[0])
  assert.notEqual(road.material[0], gate.material[0])
  assert.ok(styles.sourceMaterials.has(shared), 'detached sources retain textures for cleanup')
})

test('removing status restores revised roofs and all original wall material settings', () => {
  const root = new THREE.Group()
  const wall = surface('Bricks 1.002')
  wall.map = new THREE.Texture()
  wall.emissiveMap = new THREE.Texture()
  wall.emissive.set('#442211')
  wall.vertexColors = true
  wall.transparent = true
  wall.opacity = 0.4
  wall.alphaTest = 0.2
  wall.depthWrite = false
  const mesh = addNode(root, '1', [wall, surface('Roof.001')])
  const styles = prepareCampusMaterials(root)
  const references = [...mesh.material]
  for (const status of ['Occupied', 'Vacant', 'Occupied'] as const) {
    styles.applyBuildingStatus(1, status)
    assert.equal(hex(mesh.material[0]), status === 'Vacant' ? MAP_STATUS_COLORS.vacant : MAP_STATUS_COLORS.occupied)
  }
  styles.applyBuildingStatus(1)
  for (const key of ['map', 'emissiveMap', 'vertexColors', 'roughness', 'metalness', 'transparent', 'opacity', 'alphaTest', 'depthWrite'] as const) {
    assert.equal(mesh.material[0][key], wall[key], key)
  }
  assert.ok(mesh.material[0].color.equals(wall.color))
  assert.ok(mesh.material[0].emissive.equals(wall.emissive))
  assert.equal(hex(mesh.material[1]), CAMPUS_SURFACE_COLORS.roof)
  assert.equal(mesh.material[1].metalness, 0)
  assert.deepEqual(mesh.material, references, 'status updates reuse materials')
  assert.doesNotThrow(() => styles.applyBuildingStatus(999, 'Vacant'))
})

test('ground and nested grass stay gray throughout building status changes', () => {
  const root = new THREE.Group()
  const grass = surface('Grass.002', '#008800')
  const ground = addNode(root, 'ground', [surface('Material.012', '#00ff00'), surface('Material.015', '#777777')])
  const building = addNode(root, '39', [surface('Roof.001'), grass])
  const second = addNode(root, '43', [grass])
  const styles = prepareCampusMaterials(root)
  for (const status of ['Occupied', 'Vacant', undefined] as const) {
    styles.applyBuildingStatus(39, status)
    assert.equal(hex(building.material[1]), CAMPUS_SURFACE_COLORS.ground)
    assert.equal(hex(second.material[0]), CAMPUS_SURFACE_COLORS.ground)
    assert.equal(hex(ground.material[0]), CAMPUS_SURFACE_COLORS.ground)
    assert.equal(hex(ground.material[1]), '#777777')
  }
})

test('single materials and materials shared within one building are supported', () => {
  const root = new THREE.Group(), node = new THREE.Group()
  node.name = '1'
  root.add(node)
  const source = surface('Roof.001')
  const a = new THREE.Mesh(new THREE.BoxGeometry(), source)
  const b = new THREE.Mesh(a.geometry, source)
  node.add(a, b)
  const styles = prepareCampusMaterials(root)
  assert.equal(a.material, b.material)
  assert.notEqual(a.material, source)
  styles.applyBuildingStatus(1, 'Vacant')
  assert.equal(hex(a.material), MAP_STATUS_COLORS.vacant)
  styles.applyBuildingStatus(1)
  assert.equal(hex(a.material), CAMPUS_SURFACE_COLORS.roof)
})
