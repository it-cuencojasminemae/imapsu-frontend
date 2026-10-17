import * as THREE from 'three'
import { MAP_STATUS_COLORS } from './mapZones.ts'

export const CAMPUS_SURFACE_COLORS = {
  roof: '#808080',
  ground: '#b0b0b0',
  road: '#000000'
} as const

type Occupancy = 'Vacant' | 'Occupied'
type SurfaceState = Pick<THREE.MeshStandardMaterial,
  'map' | 'emissiveMap' | 'vertexColors' | 'roughness' | 'metalness' |
  'transparent' | 'opacity' | 'alphaTest' | 'depthWrite'> & {
    color: THREE.Color
    emissive: THREE.Color
  }

function stateOf(material: THREE.MeshStandardMaterial): SurfaceState {
  return {
    color: material.color.clone(), emissive: material.emissive.clone(),
    map: material.map, emissiveMap: material.emissiveMap, vertexColors: material.vertexColors,
    roughness: material.roughness, metalness: material.metalness,
    transparent: material.transparent, opacity: material.opacity,
    alphaTest: material.alphaTest, depthWrite: material.depthWrite
  }
}

function paint(material: THREE.MeshStandardMaterial, color: string) {
  material.color.set(color)
  material.map = null
  material.emissiveMap = null
  material.emissive.set(0)
  material.vertexColors = false
  material.roughness = 0.85
  material.metalness = 0
  material.transparent = false
  material.opacity = 1
  material.alphaTest = 0
  material.depthWrite = true
  material.needsUpdate = true
}

/** Style the loaded GLB without changing shared source materials or geometry. */
export function prepareCampusMaterials(root: THREE.Object3D) {
  // Keep detached source materials so cleanup also finds textures hidden by a fill.
  const sourceMaterials = new Set<THREE.Material>()
  const buildings = new Map<number, Map<THREE.MeshStandardMaterial, SurfaceState>>()

  for (const node of root.children) {
    const order = /^\d+$/.test(node.name) ? Number(node.name) : null
    const defaults = new Map<THREE.MeshStandardMaterial, SurfaceState>()
    if (order !== null) buildings.set(order, defaults)
    // Reuse within one node, but never between a road, gate, or different buildings.
    const clones = new Map<THREE.Material, THREE.Material>()
    node.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return
      const clone = (source: THREE.Material) => {
        const existing = clones.get(source)
        if (existing) return existing
        sourceMaterials.add(source)
        const material = source.clone()
        clones.set(source, material)
        if (!(material instanceof THREE.MeshStandardMaterial)) return material

        const name = source.name.toLowerCase()
        // Grass is also embedded inside several numeric building nodes.
        const landscape = /grass/.test(name) || (node.name === 'ground' && name === 'material.012')
        const roof = /roof|metalic greeny|^red metal(?:\.|$)/.test(name)
        if (node.name === 'road') paint(material, CAMPUS_SURFACE_COLORS.road)
        else if (landscape) paint(material, CAMPUS_SURFACE_COLORS.ground)
        else if (roof) paint(material, CAMPUS_SURFACE_COLORS.roof)

        if (order !== null && !landscape) defaults.set(material, stateOf(material))
        return material
      }
      object.material = Array.isArray(object.material) ? object.material.map(clone) : clone(object.material)
    })
  }

  function applyBuildingStatus(order: number, status?: Occupancy) {
    const defaults = buildings.get(order)
    if (!defaults) return
    for (const [material, baseline] of defaults) {
      if (status) {
        paint(material, status === 'Vacant' ? MAP_STATUS_COLORS.vacant : MAP_STATUS_COLORS.occupied)
      } else {
        const { color, emissive, ...properties } = baseline
        Object.assign(material, properties)
        material.color.copy(color)
        material.emissive.copy(emissive)
        material.needsUpdate = true
      }
    }
  }

  return { sourceMaterials, applyBuildingStatus }
}
