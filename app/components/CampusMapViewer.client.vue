<script setup lang="ts">
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import type { MapCorner, MapPin, MapPointPick, MapZone } from '~/types/map'
import pamsuBuildings from '~/data/pamsu-buildings.json'
import { boxCorners, frameMapBox, mapGeometryPoints, constrainMapTarget, isMapHighlightActive, type MapViewInsets } from '~/utils/mapPresentation'
import { prepareCampusMaterials } from '~/utils/mapMaterials'
import { MAP_STATUS_COLORS } from '~/utils/mapZones'
import type { EdgeRequest, EdgeSource } from '~/workers/mapEdges'

type PamsuBuilding = { order: number; name: string; shortname: string }

const props = withDefaults(
  defineProps<{
    modelPath?: string
    zones?: MapZone[]
    editable?: boolean
    activeZoneId?: string | null
    activeBuildingOrder?: number | null
    viewInsets?: MapViewInsets
    occupiedLabel?: string
    showNames?: boolean
    autoBuildings?: boolean
    buildingColors?: Record<string, string>
    buildingStatus?: Record<string, 'Vacant' | 'Occupied'>
    statusByOrder?: Record<string, 'Vacant' | 'Occupied'>
    labels?: Record<string, string>
    // Point-pick mode: a click reports the exact spot it hit (buildings or
    // open ground) through `point-picked` instead of selecting a building.
    pickPoint?: boolean
    pins?: MapPin[]
    activePinId?: string | null
    // Phone layout: portrait-fitted camera, one-finger pan, double-tap zoom,
    // and building labels only once zoomed in.
    mobile?: boolean
  }>(),
  {
    modelPath: '/models/campus.glb',
    zones: () => [],
    editable: false,
    activeZoneId: null,
    activeBuildingOrder: null,
    viewInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
    occupiedLabel: 'Occupied',
    showNames: false,
    autoBuildings: false,
    buildingColors: () => ({}),
    buildingStatus: () => ({}),
    statusByOrder: () => ({}),
    labels: () => ({}),
    pickPoint: false,
    pins: () => [],
    activePinId: null,
    mobile: false
  }
)

const emit = defineEmits<{
  select: [zone: MapZone]
  'building-selected': [selection: { corners: MapCorner[]; height: number; baseY: number; name: string | null }]
  'building-missed': []
  'model-error': [message: string]
  'buildings-ready': [count: number]
  'campus-aspect': [ratio: number]
  'point-picked': [pick: MapPointPick]
  'pin-select': [id: string]
}>()

const container = ref<HTMLDivElement | null>(null)

// Occupancy colors fill model surfaces; outlines remain for interaction.
const SCENE_BACKGROUND_LIGHT = '#e8ede7'
const SCENE_BACKGROUND_DARK = '#202a28'
const BUILDING_WHITE = '#ffffff'
const HIGHLIGHT_COLOR = '#e6b53a'
const STATUS_COLORS = { Vacant: MAP_STATUS_COLORS.vacant, Occupied: MAP_STATUS_COLORS.occupied }
const DEFAULT_COLOR = MAP_STATUS_COLORS.unlisted

const colorMode = useColorMode()
const isDark = computed(() =>
  colorMode.value === 'dark' ? true : colorMode.value === 'light' ? false : window.matchMedia('(prefers-color-scheme: dark)').matches
)
const sceneBackground = computed(() => new THREE.Color(isDark.value ? SCENE_BACKGROUND_DARK : SCENE_BACKGROUND_LIGHT))
watch(sceneBackground, (color) => {
  if (scene) scene.background = color
  requestRender()
})
// Orthographic frustum height before zoom, in world units.
const VIEW_HEIGHT = 800
// Objects that span more than 40% of the model's XZ extent are treated as
// terrain/ground and never selectable as buildings.
const TERRAIN_RATIO = 0.4
const DRACO_DECODER_PATH = '/draco/gltf/'

const buildingEntries = new Map<number, PamsuBuilding>()
for (const entry of pamsuBuildings) buildingEntries.set(entry.order, entry)

let renderer: THREE.WebGLRenderer | null = null
let labelRenderer: CSS2DRenderer | null = null
let scene: THREE.Scene | null = null
let camera: THREE.OrthographicCamera | null = null
let controls: OrbitControls | null = null
let aspect = 1
let raycaster = new THREE.Raycaster()
let modelGroup: THREE.Group | null = null
let frameId = 0
let resizeObserver: ResizeObserver | null = null
let hasFitted = false
let lastHoverCheck = 0
let destroyed = false
let initTimer: ReturnType<typeof setTimeout> | null = null
let decoder: DRACOLoader | null = null
let sun: THREE.DirectionalLight | null = null
let modelBounds: THREE.Box3 | null = null
let modelExtent = 1
let campusFramePoints: THREE.Vector3[] = []
let renderCount = 0
let overview = true
let focusedZone: MapZone | null = null
let interacting = false
let cameraInsets: MapViewInsets = { ...props.viewInsets }
let motionQuery: MediaQueryList | null = null
const nodeBounds = new WeakMap<THREE.Object3D, THREE.Box3>()
let campusMaterials: ReturnType<typeof prepareCampusMaterials> | null = null

type FocusAnimation = {
  fromPos: THREE.Vector3
  toPos: THREE.Vector3
  fromTarget: THREE.Vector3
  toTarget: THREE.Vector3
  fromZoom: number
  toZoom: number
  start: number
  duration: number
}
let focusAnim: FocusAnimation | null = null

const zoneMeshes = new Map<string, THREE.Group>()
const labelObjects = new Map<string, CSS2DObject>()
const pinObjects = new Map<string, CSS2DObject>()
let hoveredZoneId: string | null = null
let pointerDownPos = { x: 0, y: 0 }
let pointerDownTime = 0

// Mobile: the ground direction the camera looks from, chosen so the campus
// fills the screen, and the overview zoom labels are measured against.
let mobileHorizontal = new THREE.Vector3(1, 0, 0.35).normalize()
let overviewZoom = 1
// Labels appear once the user zooms in this far past the overview.
const MOBILE_LABEL_ZOOM = 1.6
const DOUBLE_TAP_MS = 280
const DOUBLE_TAP_DISTANCE = 30
let lastTap: { x: number; y: number; time: number } | null = null
let tapTimer: ReturnType<typeof setTimeout> | null = null

type BuildingNode = {
  node: THREE.Object3D
  order: number
  id: string
  name: string
  shortname: string
  corners: MapCorner[]
  height: number
  baseY: number
}
let buildingNodes: BuildingNode[] = []
const hoverEdges = new Map<string, THREE.Group>()
const edgeGeometryCache = new WeakMap<THREE.BufferGeometry, THREE.BufferGeometry>()
const EDGE_THRESHOLD_ANGLE = 25
const edgeQueue: string[] = []
let edgeQueueRunning = false
let edgeJobKey: string | null = null
let edgeWorker: Worker | null = null
let edgeWorkerFailed = false
let cancelEdgeJob: ((reason: Error) => void) | null = null
let hoveredId: string | null = null

const zoneIdOf = (zone: MapZone) => String(zone.documentId ?? zone.id ?? '')

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function ndcFromClient(clientX: number, clientY: number): THREE.Vector2 | null {
  const rect = renderer?.domElement.getBoundingClientRect()
  if (!rect || rect.width === 0 || rect.height === 0) return null
  return new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1)
}

function disposeObjects(objects: THREE.Object3D[], sourceMaterials: Iterable<THREE.Material> = []) {
  const geometries = new Set<THREE.BufferGeometry>()
  const materials = new Set<THREE.Material>(sourceMaterials)
  const textures = new Set<THREE.Texture>()
  for (const obj of objects) obj.traverse((child) => {
    if (child instanceof THREE.Mesh || child instanceof THREE.Line || child instanceof THREE.LineSegments) {
      if (child.geometry) geometries.add(child.geometry)
      for (const material of Array.isArray(child.material) ? child.material : [child.material]) {
        materials.add(material)
      }
    }
  })
  for (const material of materials) {
    for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value)
  }
  for (const geometry of geometries) geometry.dispose()
  for (const material of materials) material.dispose()
  for (const texture of textures) texture.dispose()
}

const disposeObject = (obj: THREE.Object3D) => disposeObjects([obj])

function buildZoneMesh(zone: MapZone, id?: string, outlineColor: string = HIGHLIGHT_COLOR): THREE.Group | null {
  const pts = Array.isArray(zone.corners) ? zone.corners : []
  if (pts.length < 3) return null

  const shape = new THREE.Shape()
  pts.forEach((point, index) => {
    const x = Number(point.x)
    const z = Number(point.z)
    if (!Number.isFinite(x) || !Number.isFinite(z)) return
    if (index === 0) shape.moveTo(x, -z)
    else shape.lineTo(x, -z)
  })
  shape.closePath()

  const height = Math.max(Number(zone.height) || 4, 0.5)
  const baseY = Number.isFinite(Number(zone.baseY)) ? Number(zone.baseY) : 0

  const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false })
  geometry.rotateX(-Math.PI / 2)

  const group = new THREE.Group()
  group.position.y = baseY
  group.renderOrder = 10
  group.userData.baseColor = new THREE.Color(BUILDING_WHITE)

  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(BUILDING_WHITE),
    roughness: 0.78,
    metalness: 0.05,
    transparent: true,
    opacity: 0.55
  })
  group.add(new THREE.Mesh(geometry, material))

  const edges = new THREE.EdgesGeometry(geometry)
  const statusOutline = new THREE.LineSegments(
    edges,
    new THREE.LineBasicMaterial({ color: new THREE.Color(outlineColor), depthWrite: false })
  )
  group.add(statusOutline)

  const highlightOutline = new THREE.LineSegments(
    edges,
    new THREE.LineBasicMaterial({ color: new THREE.Color(HIGHLIGHT_COLOR), depthTest: false, depthWrite: false })
  )
  highlightOutline.visible = false
  highlightOutline.renderOrder = 999
  group.add(highlightOutline)
  group.userData.highlightOutline = highlightOutline

  group.userData.zoneId = id ?? zoneIdOf(zone)
  group.userData.zone = zone
  return group
}

/**
 * A node is a campus building when its name is a building number (the GLB is
 * authored with numeric node names matching the building directory), a
 * concrete block ("Cube.*"), or an unnamed building.
 */
function isBuildingNodeName(name: string): boolean {
  return /^\d+$/.test(name) || /^cube\./i.test(name) || /^unnamed building/i.test(name)
}

/** Prepare independent materials while preserving the authored model geometry. */
function prepareModel(root: THREE.Object3D) {
  campusMaterials = prepareCampusMaterials(root)
  root.updateMatrixWorld(true)
  modelBounds = new THREE.Box3().setFromObject(root)
  const size = modelBounds.getSize(new THREE.Vector3())
  modelExtent = Math.max(size.x, size.z, 1)
  for (const child of root.children) nodeBounds.set(child, new THREE.Box3().setFromObject(child))
  campusFramePoints = mapGeometryPoints(root)
  root.traverse(obj => {
    if (!(obj instanceof THREE.Mesh)) return
    obj.receiveShadow = true
    let top: THREE.Object3D = obj
    while (top.parent && top.parent !== root) top = top.parent
    const bounds = nodeBounds.get(top)
    const extent = bounds?.getSize(new THREE.Vector3())
    obj.castShadow = isBuildingNodeName(top.name) || !!(extent && extent.y > 0.6 && Math.max(extent.x, extent.z) < modelExtent * TERRAIN_RATIO)
  })
  fitSunShadows()
}

function fitSunShadows() {
  if (!sun || !modelBounds) return
  const center = modelBounds.getCenter(new THREE.Vector3())
  const diagonal = Math.max(modelBounds.getSize(new THREE.Vector3()).length(), 100)
  sun.target.position.copy(center)
  sun.position.copy(center).addScaledVector(new THREE.Vector3(-0.55, 1, -0.65).normalize(), diagonal * 2)
  sun.target.updateMatrixWorld(true)
  const shadowCamera = sun.shadow.camera
  shadowCamera.position.copy(sun.position)
  shadowCamera.lookAt(center)
  shadowCamera.updateMatrixWorld(true)
  const points = boxCorners(modelBounds).map(point => point.applyMatrix4(shadowCamera.matrixWorldInverse))
  const xs = points.map(point => point.x), ys = points.map(point => point.y), zs = points.map(point => -point.z)
  const margin = diagonal * 0.05
  shadowCamera.left = Math.min(...xs) - margin
  shadowCamera.right = Math.max(...xs) + margin
  shadowCamera.bottom = Math.min(...ys) - margin
  shadowCamera.top = Math.max(...ys) + margin
  shadowCamera.near = Math.max(0.1, Math.min(...zs) - margin)
  shadowCamera.far = Math.max(...zs) + margin
  shadowCamera.updateProjectionMatrix()
  sun.shadow.normalBias = diagonal * 0.00015
  sun.shadow.bias = -0.00005
  updateShadowResolution()
}

function updateShadowResolution() {
  if (!sun) return
  const resolution = (container.value?.clientWidth ?? 0) < 768 ? 1024 : 2048
  if (sun.shadow.mapSize.x !== resolution) {
    sun.shadow.map?.dispose()
    sun.shadow.map = null
    sun.shadow.mapSize.set(resolution, resolution)
  }
  sun.shadow.needsUpdate = true
  if (renderer) renderer.shadowMap.needsUpdate = true
}

function collectBuildings() {
  buildingNodes = []
  if (!modelGroup) return
  for (const child of modelGroup.children) {
    const order = /^\d+$/.test(child.name) ? parseInt(child.name, 10) : NaN
    if (!Number.isFinite(order)) continue
    const entry = buildingEntries.get(order)
    const corners = computeGroundFootprint(child)
    if (!corners || corners.length < 3) continue
    const box = new THREE.Box3().setFromObject(child)
    const size = box.getSize(new THREE.Vector3())
    buildingNodes.push({
      node: child,
      order,
      id: entry ? normalizeName(entry.name) : normalizeName(child.name),
      name: entry?.name ?? displayNameOf(child.name),
      shortname: entry?.shortname ?? entry?.name ?? '',
      corners,
      height: Math.max(size.y, 0.5),
      baseY: box.min.y
    })
    footprintCache.set(child, { corners, height: Math.max(size.y, 0.5), baseY: box.min.y, name: displayNameOf(child.name) })
  }
}

/**
 * Builds a hover/selection outline around
 * every mesh of a building node, using its actual geometry edges so the
 * highlight traces the real building shape.
 */
function buildNodeEdges(node: THREE.Object3D, color: string, renderOrder: number, noDepth: boolean): THREE.Group | null {
  const group = new THREE.Group()
  const material = new THREE.LineBasicMaterial({
    color: new THREE.Color(color),
    depthTest: !noDepth,
    depthWrite: false
  })
  node.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh) || !obj.geometry) return
    const edges = edgeGeometryCache.get(obj.geometry)
    if (!edges) return
    const segments = new THREE.LineSegments(edges, material)
    segments.matrix.copy(obj.matrixWorld)
    segments.matrixAutoUpdate = false
    segments.renderOrder = renderOrder
    group.add(segments)
  })
  if (group.children.length === 0) {
    material.dispose()
    return null
  }
  return group
}

function rebuildEdges() {
  if (!scene) return
  // Status updates repaint existing materials; interaction geometry is built once.
  for (const b of buildingNodes) campusMaterials?.applyBuildingStatus(b.order, props.statusByOrder[String(b.order)])
  queueHoverEdges(buildingNodes.map(b => String(b.order)))
  applyHighlight()
  requestRender()
}

/**
 * Outline geometry is the slowest part of preparing the campus, so it is built
 * after the map appears, one building at a time. A highlighted building moves
 * to the front of the queue.
 */
function queueHoverEdges(keys: string[], urgent = false) {
  for (const key of keys) {
    if (hoverEdges.has(key) || key === edgeJobKey) continue
    const queued = edgeQueue.indexOf(key)
    if (queued >= 0) {
      if (!urgent) continue
      edgeQueue.splice(queued, 1)
    }
    if (urgent) edgeQueue.unshift(key)
    else edgeQueue.push(key)
  }
  void processHoverEdges()
}

async function processHoverEdges() {
  if (edgeQueueRunning) return
  edgeQueueRunning = true
  try {
    for (let key = edgeQueue.shift(); key !== undefined && scene && !destroyed; key = edgeQueue.shift()) {
      const building = buildingNodes.find(b => String(b.order) === key)
      if (!building || hoverEdges.has(key)) continue
      edgeJobKey = key
      const sources = new Set<THREE.BufferGeometry>()
      building.node.traverse(obj => {
        if (obj instanceof THREE.Mesh && obj.geometry && !edgeGeometryCache.has(obj.geometry)) sources.add(obj.geometry)
      })
      const pending = [...sources]
      const edges = await edgeGeometries(pending)
      if (!scene || destroyed) { edges.forEach(geometry => geometry.dispose()); return }
      pending.forEach((geometry, i) => edgeGeometryCache.set(geometry, edges[i]!))
      const hover = buildNodeEdges(building.node, HIGHLIGHT_COLOR, 999, false)
      if (hover) { hover.visible = false; hoverEdges.set(key, hover); scene.add(hover) }
      edgeJobKey = null
      applyHighlight()
    }
  } catch {
    // Outlines are optional; the map stays usable without them.
    edgeQueue.length = 0
  } finally {
    edgeJobKey = null
    edgeQueueRunning = false
  }
}

function edgeGeometries(sources: THREE.BufferGeometry[]): Promise<THREE.BufferGeometry[]> {
  if (!sources.length) return Promise.resolve([])
  // Without a worker, yield between buildings and build on the main thread.
  const inline = () => new Promise<THREE.BufferGeometry[]>(resolve => setTimeout(() => resolve(sources.map(geometry => new THREE.EdgesGeometry(geometry, EDGE_THRESHOLD_ANGLE))), 0))
  if (edgeWorkerFailed) return inline()
  try {
    edgeWorker ??= new Worker(new URL('../workers/mapEdges.ts', import.meta.url), { type: 'module' })
  } catch {
    edgeWorkerFailed = true
    return inline()
  }
  const request: EdgeRequest = { thresholdAngle: EDGE_THRESHOLD_ANGLE, sources: sources.map(edgeSource) }
  const transfer = request.sources.flatMap(source => source.index ? [source.position.buffer, source.index.buffer] : [source.position.buffer]) as ArrayBuffer[]
  const worker = edgeWorker
  return new Promise((resolve, reject) => {
    cancelEdgeJob = reject
    worker.onmessage = ({ data }: MessageEvent<Float32Array[]>) => {
      cancelEdgeJob = null
      resolve(data.map(position => new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(position, 3))))
    }
    worker.onerror = (event) => {
      event.preventDefault()
      cancelEdgeJob = null
      worker.terminate()
      if (edgeWorker === worker) edgeWorker = null
      edgeWorkerFailed = true
      resolve(inline())
    }
    worker.postMessage(request, transfer)
  })
}

/** Copies a geometry for the worker; the scene keeps using the original. */
function edgeSource(geometry: THREE.BufferGeometry): EdgeSource {
  const attribute = geometry.getAttribute('position')
  const position = new Float32Array(attribute.count * 3)
  for (let i = 0; i < attribute.count; i++) {
    position[i * 3] = attribute.getX(i)
    position[i * 3 + 1] = attribute.getY(i)
    position[i * 3 + 2] = attribute.getZ(i)
  }
  const index = geometry.index ? (geometry.index.array as Uint16Array | Uint32Array).slice() : null
  return { position, index }
}

function rebuildZones() {
  if (!scene) return

  if (props.autoBuildings) {
    rebuildEdges()
    rebuildLabels()
    return
  }

  for (const [, group] of zoneMeshes) {
    scene.remove(group)
    disposeObject(group)
  }
  zoneMeshes.clear()

  for (const zone of props.zones) {
    const group = buildZoneMesh(zone)
    if (group) {
      zoneMeshes.set(zoneIdOf(zone), group)
      scene.add(group)
    }
  }

  applyHighlight()
  rebuildLabels()
}

function rebuildLabels() {
  if (!scene) return
  for (const [, obj] of labelObjects) {
    scene.remove(obj)
    obj.element.remove()
  }
  labelObjects.clear()
  if (!props.showNames) { requestRender(); return }

  const addLabel = (text: string, x: number, y: number, z: number, key: string, status?: 'Vacant' | 'Occupied') => {
    const element = document.createElement('div')
    element.className = 'campus-map-label'
    const nameSpan = document.createElement('span')
    nameSpan.className = 'campus-map-label-name'
    nameSpan.textContent = text
    element.appendChild(nameSpan)
    if (status) {
      const statusSpan = document.createElement('span')
      statusSpan.className = status === 'Vacant' ? 'campus-map-label-status is-vacant' : 'campus-map-label-status is-occupied'
      statusSpan.textContent = status === 'Vacant' ? '\u25CF Vacant' : '\u25CF ' + props.occupiedLabel
      element.appendChild(statusSpan)
    }
    const label = new CSS2DObject(element)
    label.position.set(x, y, z)
    element.dataset.key = props.autoBuildings ? key.replace(/^label:/, '') : key.replace(/^label:zone:/, '')
    labelObjects.set(key, label)
    scene.add(label)
  }

  const items = props.autoBuildings
    ? buildingNodes
        // Skip buildings that have neither a pamsu entry nor a custom map label,
        // so raw numeric node names (e.g. missing pamsu entries) stay unlabeled.
        .filter((b) => buildingEntries.has(b.order) || props.labels[b.id])
        .map((b) => ({
          id: b.id,
          order: b.order,
          name: b.shortname || b.name,
          corners: b.corners,
          height: b.height,
          baseY: b.baseY
        }))
    : props.zones.map((zone) => ({
        id: `zone:${zoneIdOf(zone)}`,
        order: 0,
        name: zone.name,
        corners: Array.isArray(zone.corners) ? zone.corners : [],
        height: Math.max(Number(zone.height) || 4, 0.5),
        baseY: Number.isFinite(Number(zone.baseY)) ? Number(zone.baseY) : 0
      }))

  // Labels are anchored to the top-center of each building footprint so a name
  // always sits directly over the building it refers to. The map key is the
  // unique building order in auto mode (names repeat across the campus) and the
  // zone id otherwise, so every label object is tracked and removable.
  for (const item of items) {
    if (!item.name) continue
    const pts = item.corners.filter((c) => Number.isFinite(Number(c.x)) && Number.isFinite(Number(c.z)))
    if (pts.length < 3) continue
    const cx = pts.reduce((sum, c) => sum + Number(c.x), 0) / pts.length
    const cz = pts.reduce((sum, c) => sum + Number(c.z), 0) / pts.length
    const height = Math.max(item.height, 0.5)
    const text = props.autoBuildings ? props.labels[item.id] ?? item.name : props.labels[normalizeName(item.name)] ?? item.name
    const status = props.autoBuildings ? props.statusByOrder[String(item.order)] : props.buildingStatus[normalizeName(item.name)]
    const key = props.autoBuildings ? `label:${item.order}` : `label:${item.id}`
    addLabel(text, cx, item.baseY + height + 2.5, cz, key, status)
  }
  requestRender()
}

// Pins are anchored by their tip: the CSS2D element is a zero-size anchor at
// the world point and the marker hangs above it. They skip the label collision
// layout so a placed stall is never hidden behind a building name.
function rebuildPins() {
  if (!scene) return
  for (const [, obj] of pinObjects) {
    scene.remove(obj)
    obj.element.remove()
  }
  pinObjects.clear()

  for (const pin of props.pins) {
    if (![pin.x, pin.y, pin.z].every(Number.isFinite)) continue
    const anchor = document.createElement('div')
    anchor.className = 'campus-map-pin'
    anchor.classList.toggle('is-active', pin.id === props.activePinId)
    anchor.classList.toggle('is-muted', !!pin.muted)
    anchor.classList.toggle('is-interactive', !props.pickPoint && !pin.muted)
    const marker = document.createElement('button')
    marker.type = 'button'
    marker.className = 'campus-map-pin-marker'
    marker.style.setProperty('--pin-color', pin.status ? STATUS_COLORS[pin.status] : HIGHLIGHT_COLOR)
    marker.setAttribute('aria-label', pin.label ? `Stall: ${pin.label}` : 'Stall location')
    marker.tabIndex = !props.pickPoint && !pin.muted ? 0 : -1
    marker.addEventListener('click', (event) => {
      event.stopPropagation()
      if (!props.pickPoint && !pin.muted) emit('pin-select', pin.id)
    })
    anchor.appendChild(marker)
    if (pin.label) {
      const text = document.createElement('span')
      text.className = 'campus-map-pin-label'
      text.textContent = pin.label
      anchor.appendChild(text)
    }
    const object = new CSS2DObject(anchor)
    object.position.set(pin.x, pin.y, pin.z)
    pinObjects.set(pin.id, object)
    scene.add(object)
  }
  requestRender()
}

function setZoneHighlight(id: string, on: boolean) {
  const edge = hoverEdges.get(id)
  if (edge) edge.visible = on
  const group = zoneMeshes.get(id)
  const outline = group?.userData.highlightOutline as THREE.LineSegments | undefined
  if (outline) outline.visible = on
}

function selectedKeys(): Set<string> {
  if (props.autoBuildings && props.activeBuildingOrder != null) return new Set([String(props.activeBuildingOrder)])
  if (!props.activeZoneId) return new Set()
  return props.autoBuildings
    ? new Set(buildingNodes.filter(b => b.id === props.activeZoneId).map(b => String(b.order)))
    : new Set([props.activeZoneId])
}

function applyHighlight() {
  const selected = selectedKeys()
  if (props.autoBuildings) queueHoverEdges(hoveredId ? [...selected, hoveredId] : [...selected], true)
  for (const [key, group] of hoverEdges) {
    group.visible = isMapHighlightActive(key, selected, hoveredId)
    group.traverse(obj => {
      if (!(obj instanceof THREE.LineSegments)) return
      const material = obj.material as THREE.LineBasicMaterial
      material.color.set(selected.has(key) ? HIGHLIGHT_COLOR : '#f3dca0')
      material.transparent = true
      material.opacity = selected.has(key) ? 1 : 0.65
    })
  }
  for (const key of zoneMeshes.keys()) setZoneHighlight(key, isMapHighlightActive(key, selected, hoveredZoneId))
  requestRender()
}

function pickZone(clientX: number, clientY: number): MapZone | null {
  const ndc = ndcFromClient(clientX, clientY)
  if (!ndc || !camera || zoneMeshes.size === 0) return null
  raycaster.setFromCamera(ndc, camera)
  const targets = [...zoneMeshes.values()]
  const hit = raycaster.intersectObjects(targets, true).find((h) => {
    let obj: THREE.Object3D | null = h.object
    while (obj) {
      if (obj.userData.zoneId) return true
      obj = obj.parent
    }
    return false
  })
  if (!hit) return null
  let obj: THREE.Object3D | null = hit.object
  while (obj && !obj.userData.zoneId) obj = obj.parent
  return obj ? (obj.userData.zone as MapZone) : null
}

const GENERIC_NAMES = /^(cube|mesh|plane|box|cylinder|sphere|icosphere|circle|group|empty|node)(\.\d+)?$/i

// A top-level node can be labelled when it has a name that isn't empty or a
// generic mesh placeholder. Numeric IDs are kept (some model builders use raw
// IDs for unlabeled buildings) so OAS can name them on the map.
function isLabelableName(name: string | null | undefined): name is string {
  if (typeof name !== 'string') return false
  const trimmed = name.trim()
  if (trimmed.length === 0) return false
  return !GENERIC_NAMES.test(trimmed)
}

function displayNameOf(name: string | null | undefined): string {
  if (typeof name !== 'string') return ''
  const trimmed = name.trim()
  if (/^\d+$/.test(trimmed)) return trimmed
  return trimmed.replace(/_/g, ' ').replace(/\s+/g, ' ')
}

function convexHull(points: { x: number; z: number }[]): { x: number; z: number }[] {
  const pts = [...points].sort((a, b) => (a.x !== b.x ? a.x - b.x : a.z - b.z))
  const cross = (o: { x: number; z: number }, a: { x: number; z: number }, b: { x: number; z: number }) =>
    (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x)

  const lower: { x: number; z: number }[] = []
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper: { x: number; z: number }[] = []
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop()
    upper.push(p)
  }
  lower.pop()
  upper.pop()
  return lower.concat(upper)
}

function simplifyFootprint(points: { x: number; z: number }[], minEdge = 0.5): MapCorner[] {
  if (points.length <= 4) return points.map((p) => ({ x: p.x, z: p.z }))

  const pts = points.map((p) => ({ x: p.x, z: p.z }))
  let changed = true
  while (changed) {
    changed = false
    for (let i = pts.length - 1; i >= 0; i--) {
      const a = pts[(i + pts.length - 1) % pts.length]
      const b = pts[i]
      const c = pts[(i + 1) % pts.length]
      const cross = (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x)
      const edge = Math.hypot(b.x - a.x, b.z - a.z)
      if (edge < minEdge || Math.abs(cross) < 1e-6) {
        pts.splice(i, 1)
        changed = true
        break
      }
    }
    if (pts.length <= 4) break
  }
  return pts
}

/**
 * Projects every vertex of a building mesh (and its children) onto the ground
 * plane and returns the convex hull of that footprint. This matches rotated
 * buildings exactly, unlike an axis-aligned bounding box.
 */
function computeGroundFootprint(node: THREE.Object3D): MapCorner[] | null {
  const meshes: THREE.Mesh[] = []
  if (node instanceof THREE.Mesh) meshes.push(node)
  node.traverse((child) => {
    if (child instanceof THREE.Mesh && child !== node) meshes.push(child)
  })

  const vertices: { x: number; z: number }[] = []
  const seen = new Set<number>()
  const tmp = new THREE.Vector3()

  for (const mesh of meshes) {
    const position = mesh.geometry?.getAttribute('position')
    if (!position) continue
    mesh.updateWorldMatrix(true, true)
    const matrix = mesh.matrixWorld
    for (let i = 0; i < position.count; i++) {
      tmp.fromBufferAttribute(position as THREE.BufferAttribute, i).applyMatrix4(matrix)
      const x = Math.round(tmp.x * 50)
      const z = Math.round(tmp.z * 50)
      // Numeric keys avoid a string per vertex; exact for |z| below ~40,000 units.
      const key = x * 4194304 + z
      if (seen.has(key)) continue
      seen.add(key)
      vertices.push({ x: x / 50, z: z / 50 })
    }
  }

  if (vertices.length < 3) return null
  return simplifyFootprint(convexHull(vertices))
}

// The model is static per session, so footprints are computed once per node.
const footprintCache = new WeakMap<THREE.Object3D, { corners: MapCorner[]; height: number; baseY: number; name: string | null } | null>()

/**
 * Finds the top-level building under the model root that the click hit.
 * Returns its ground footprint (convex hull projected on the ground) plus its
 * height and base Y, or null when the click missed every selectable building.
 */
function pickModelBuilding(clientX: number, clientY: number): { corners: MapCorner[]; height: number; baseY: number; name: string | null } | null {
  const hit = raycastModel(clientX, clientY)
  return hit ? buildingOfNode(hit.node) : null
}

/** The first model surface under the pointer and its top-level node. */
function raycastModel(clientX: number, clientY: number): { point: THREE.Vector3; node: THREE.Object3D } | null {
  const ndc = ndcFromClient(clientX, clientY)
  if (!ndc || !camera || !modelGroup) return null

  raycaster.setFromCamera(ndc, camera)
  const hits = raycaster.intersectObject(modelGroup, true)
  const meshHit = hits.find((h) => (h.object as THREE.Mesh).isMesh)
  if (!meshHit) return null

  let node: THREE.Object3D = meshHit.object
  while (node.parent && node.parent !== modelGroup) node = node.parent
  return { point: meshHit.point, node }
}

// A ground click this close to a building footprint (as a share of the campus
// extent) still counts as that building, since stalls usually sit beside one.
const NEAR_BUILDING_RATIO = 0.04

/** Ground distance from a point to a footprint polygon; 0 when inside it. */
function distanceToFootprint(x: number, z: number, corners: MapCorner[]): number {
  let inside = false
  let best = Infinity
  for (let i = 0, j = corners.length - 1; i < corners.length; j = i++) {
    const a = corners[i]!
    const b = corners[j]!
    if ((a.z > z) !== (b.z > z) && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside
    const dx = b.x - a.x
    const dz = b.z - a.z
    const len2 = dx * dx + dz * dz
    const t = len2 > 0 ? Math.min(1, Math.max(0, ((x - a.x) * dx + (z - a.z) * dz) / len2)) : 0
    best = Math.min(best, Math.hypot(x - (a.x + t * dx), z - (a.z + t * dz)))
  }
  return inside ? 0 : best
}

/** The directory building whose footprint is nearest the point, within reach. */
function nearestBuildingOrder(x: number, z: number): number | null {
  let bestOrder: number | null = null
  let bestDistance = modelExtent * NEAR_BUILDING_RATIO
  for (const b of buildingNodes) {
    if (!buildingEntries.has(b.order)) continue
    const distance = distanceToFootprint(x, z, b.corners)
    if (distance <= bestDistance) {
      bestDistance = distance
      bestOrder = b.order
    }
  }
  return bestOrder
}

/**
 * The exact spot a click hit, terrain included, so stalls can be placed both
 * on buildings and in open areas. A click on open ground next to a building
 * resolves to that building; the building fields are null only when the spot
 * is clear of every building.
 */
function pickMapPoint(clientX: number, clientY: number): MapPointPick | null {
  const hit = raycastModel(clientX, clientY)
  if (!hit) return null
  const name = buildingOfNode(hit.node)?.name ?? null
  const hitOrder = name && /^\d+$/.test(name) ? parseInt(name, 10) : NaN
  const order = buildingEntries.has(hitOrder) ? hitOrder : nearestBuildingOrder(hit.point.x, hit.point.z)
  const entry = order != null ? buildingEntries.get(order) : undefined
  return {
    x: hit.point.x,
    y: hit.point.y,
    z: hit.point.z,
    buildingOrder: entry ? order : null,
    buildingName: entry?.name ?? null,
    onBuilding: entry ? order === hitOrder : false
  }
}

function buildingOfNode(node: THREE.Object3D): { corners: MapCorner[]; height: number; baseY: number; name: string | null } | null {
  const modelXZ = modelExtent

  const box = nodeBounds.get(node) ?? new THREE.Box3().setFromObject(node)
  const size = box.getSize(new THREE.Vector3())
  if (Math.max(size.x, size.z) > modelXZ * TERRAIN_RATIO) return null

  let cached = footprintCache.get(node)
  if (cached === undefined) {
    const corners = computeGroundFootprint(node)
    cached = corners
      ? { corners, height: Math.max(size.y, 0.5), baseY: box.min.y, name: isLabelableName(node.name) ? displayNameOf(node.name) : null }
      : null
    footprintCache.set(node, cached)
  }
  if (!cached) return null

  return cached
}

function campusBounds() {
  const box = modelBounds?.clone() ?? new THREE.Box3()
  for (const group of zoneMeshes.values()) box.expandByObject(group)
  return box
}

function zoneBounds(zone: MapZone) {
  const box = new THREE.Box3()
  const baseY = Number(zone.baseY) || 0
  const height = Math.max(Number(zone.height) || 4, 1)
  for (const point of zone.corners ?? []) {
    if (!Number.isFinite(Number(point.x)) || !Number.isFinite(Number(point.z))) continue
    box.expandByPoint(new THREE.Vector3(Number(point.x), baseY, Number(point.z)))
    box.expandByPoint(new THREE.Vector3(Number(point.x), baseY + height, Number(point.z)))
  }
  return box
}

function cameraFrame(box: THREE.Box3, direction: THREE.Vector3, points?: THREE.Vector3[], margin = 1.12) {
  const el = container.value
  if (!el || box.isEmpty()) return null
  const frame = frameMapBox(box, direction, Math.max(el.clientWidth, 1), Math.max(el.clientHeight, 1), VIEW_HEIGHT, props.viewInsets, margin, points)
  if (modelBounds) {
    const shift = direction.clone().multiplyScalar((campusBounds().getCenter(new THREE.Vector3()).y - frame.target.y) / direction.y)
    frame.target.add(shift)
    frame.position.add(shift)
  }
  return frame
}

function framePoints() {
  return [...campusFramePoints, ...[...zoneMeshes.values()].flatMap(group => boxCorners(new THREE.Box3().setFromObject(group)))]
}

function setCameraInsets() {
  const el = container.value
  if (!el || !camera) return
  cameraInsets = { ...props.viewInsets }
  camera.setViewOffset(el.clientWidth, el.clientHeight,
    (cameraInsets.right - cameraInsets.left) / 2, (cameraInsets.bottom - cameraInsets.top) / 2,
    el.clientWidth, el.clientHeight)
}

// Flush pending deltas through the public API before a programmatic camera move.
function stopControlMotion() {
  if (!controls) return
  const damping = controls.enableDamping
  controls.enableDamping = false
  controls.update()
  controls.enableDamping = damping
}

function constrainNavigation() {
  const el = container.value, bounds = campusBounds()
  if (!camera || !controls || !el || bounds.isEmpty()) return
  const direction = camera.position.clone().sub(controls.target).normalize()
  const points = framePoints()
  const frame = frameMapBox(bounds, direction, el.clientWidth, el.clientHeight, VIEW_HEIGHT, cameraInsets, 1.12, points)
  controls.minZoom = frame.zoom * 0.9
  const size = bounds.getSize(new THREE.Vector3())
  const detailSpan = Math.max(Math.min(size.x, size.z) * 0.025, 2)
  const availableWidth = Math.max(el.clientWidth - cameraInsets.left - cameraInsets.right, 1)
  const availableHeight = Math.max(el.clientHeight - cameraInsets.top - cameraInsets.bottom, 1)
  controls.maxZoom = Math.max(frame.zoom, Math.min(availableWidth, availableHeight) / detailSpan * VIEW_HEIGHT / el.clientHeight)
  camera.zoom = THREE.MathUtils.clamp(camera.zoom, controls.minZoom, controls.maxZoom)
  const distance = Math.max(size.length() * 2, 100)
  // Orthographic zoom changes the frustum, not distance. Keep both overview and
  // focus safely above the complete model, including during orbit rotations.
  controls.minDistance = distance
  controls.maxDistance = distance
  if (!focusAnim) {
    const next = constrainMapTarget(controls.target, bounds, points, direction,
      availableWidth / el.clientHeight * VIEW_HEIGHT / camera.zoom,
      availableHeight / el.clientHeight * VIEW_HEIGHT / camera.zoom)
    camera.position.add(next.clone().sub(controls.target))
    controls.target.copy(next)
  }
  camera.updateProjectionMatrix()
  camera.updateMatrixWorld()
}

/** The overview direction for a ground heading, tilted like the desktop view. */
function overviewDirection(horizontal: THREE.Vector3) {
  const angle = THREE.MathUtils.degToRad(35)
  return horizontal.clone().multiplyScalar(Math.sin(angle)).add(new THREE.Vector3(0, Math.cos(angle), 0))
}

/**
 * Turns the campus so it fills the phone screen: tries headings around the
 * campus and keeps the one that frames it largest, which in portrait puts the
 * campus's long side top to bottom. Of the two opposite headings that frame it
 * equally, the one nearer the desktop view wins.
 */
function fitMobileHeading(points: THREE.Vector3[]) {
  const el = container.value, box = campusBounds()
  if (!el || box.isEmpty() || !points.length) return
  const desktop = new THREE.Vector3(1, 0, 0.35).normalize()
  let best = desktop, bestZoom = -Infinity
  for (let degrees = 0; degrees < 180; degrees += 3) {
    const radians = THREE.MathUtils.degToRad(degrees)
    const horizontal = new THREE.Vector3(Math.cos(radians), 0, Math.sin(radians))
    if (horizontal.dot(desktop) < 0) horizontal.negate()
    const { zoom } = frameMapBox(box, overviewDirection(horizontal), Math.max(el.clientWidth, 1), Math.max(el.clientHeight, 1), VIEW_HEIGHT, props.viewInsets, 1.04, points)
    if (zoom > bestZoom * 1.005) { best = horizontal; bestZoom = zoom }
  }
  mobileHorizontal = best
}

function fitCamera() {
  if (!camera || !controls) return
  if (props.mobile) { fitMobileCamera(); return }
  const horizontal = new THREE.Vector3(1, 0, 0.35).normalize()
  const angle = THREE.MathUtils.degToRad(35)
  const direction = horizontal.multiplyScalar(Math.sin(angle)).add(new THREE.Vector3(0, Math.cos(angle), 0))
  const points = framePoints()
  const frame = cameraFrame(campusBounds(), direction, points.length ? points : undefined)
  if (!frame) return
  emit('campus-aspect', frame.projectedAspect)
  stopControlMotion()
  setCameraInsets()
  camera.position.copy(frame.position)
  controls.target.copy(frame.target)
  camera.zoom = frame.zoom
  camera.far = Math.max(modelExtent * 12, 5000)
  constrainNavigation()
  camera.updateProjectionMatrix()
  controls.update()
  hasFitted = true
  overview = true
  focusedZone = null
  requestRender()
}

function fitMobileCamera() {
  if (!camera || !controls) return
  const points = framePoints()
  fitMobileHeading(points)
  const frame = cameraFrame(campusBounds(), overviewDirection(mobileHorizontal), points.length ? points : undefined, 1.04)
  if (!frame) return
  stopControlMotion()
  setCameraInsets()
  camera.position.copy(frame.position)
  controls.target.copy(frame.target)
  camera.zoom = frame.zoom
  camera.far = Math.max(modelExtent * 12, 5000)
  constrainNavigation()
  camera.updateProjectionMatrix()
  controls.update()
  overviewZoom = camera.zoom
  hasFitted = true
  overview = true
  focusedZone = null
  requestRender()
}

function resetCamera() {
  focusAnim = null
  hasFitted = false
  fitCamera()
}

function focusOn(zone: MapZone, immediate = false) {
  if (!camera || !controls) return
  // Phones keep the overview's heading so focusing doesn't spin the campus.
  const focusDirection = props.mobile
    ? mobileHorizontal.clone().multiplyScalar(Math.hypot(1, 0.35)).setY(1).normalize()
    : new THREE.Vector3(1, 1, 0.35).normalize()
  const frame = cameraFrame(zoneBounds(zone), focusDirection)
  if (!frame) return
  stopControlMotion()
  setCameraInsets()
  // Preserve a safe orbit radius; only the orthographic zoom needs to change.
  const distance = Math.max(campusBounds().getSize(new THREE.Vector3()).length() * 2, 100)
  frame.position.copy(frame.target).addScaledVector(focusDirection, distance)
  frame.zoom = Math.min(frame.zoom, controls.maxZoom)
  hasFitted = true
  overview = false
  focusedZone = zone
  if (immediate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    focusAnim = null
    camera.position.copy(frame.position)
    controls.target.copy(frame.target)
    camera.zoom = frame.zoom
    camera.updateProjectionMatrix()
    controls.update()
  } else {
    focusAnim = {
      fromPos: camera.position.clone(), fromTarget: controls.target.clone(), fromZoom: camera.zoom,
      toPos: frame.position, toTarget: frame.target, toZoom: frame.zoom,
      start: performance.now(), duration: 600
    }
  }
  requestRender()
}

/**
 * Focuses the building with the given pamsu order (used by the page's search
 * results) and lets the page know it was selected.
 */
function focusBuilding(order: number) {
  const b = buildingNodes.find((node) => node.order === order)
  if (!b) return
  const entry = buildingEntries.get(order)
  if (!entry) return
  const status = props.statusByOrder[String(order)]
  const zone: MapZone = {
    id: normalizeName(entry.name),
    buildingOrder: order,
    name: entry.name,
    type: 'Property',
    corners: b.corners,
    height: b.height,
    baseY: b.baseY,
    color: status ? STATUS_COLORS[status] : DEFAULT_COLOR
  }
  // The page owns the focus operation after selection.
  emit('select', zone)
}

function loadModel() {
  const loader = new GLTFLoader()
  decoder = new DRACOLoader()
  decoder.setDecoderPath(DRACO_DECODER_PATH)
  loader.setDRACOLoader(decoder)
  loader.load(props.modelPath, gltf => {
    if (destroyed || !scene) { disposeObject(gltf.scene); return }
    try {
      modelGroup = gltf.scene
      scene.add(modelGroup)
      prepareModel(modelGroup)
      if (props.autoBuildings) collectBuildings()
      rebuildZones()
      if (!hasFitted) fitCamera()
      emit('buildings-ready', buildingNodes.length)
      decoder?.dispose()
      decoder = null
      requestRender()
    } catch {
      emit('model-error', 'The campus model could not be prepared. Please reload the map.')
      cleanupResources()
    }
  }, undefined, () => {
    if (destroyed) return
    decoder?.dispose()
    decoder = null
    emit('model-error', 'The campus model could not load. Please check your connection and reload the map.')
  })
}

function init(attempt = 0) {
  if (destroyed) return
  const el = container.value
  if (!el) {
    if (attempt < 20) initTimer = setTimeout(() => init(attempt + 1), 50)
    else emit('model-error', 'The map viewer could not start. Please reload the page.')
    return
  }
  try { initScene(el) } catch {
    cleanupResources()
    emit('model-error', '3D graphics are unavailable. Enable WebGL in your browser or try another browser.')
  }
}

function initScene(el: HTMLDivElement) {
  const width = el.clientWidth || 800, height = el.clientHeight || 600
  scene = new THREE.Scene()
  scene.background = sceneBackground.value
  aspect = width / height
  camera = new THREE.OrthographicCamera(-VIEW_HEIGHT * aspect / 2, VIEW_HEIGHT * aspect / 2, VIEW_HEIGHT / 2, -VIEW_HEIGHT / 2, 0.1, 5000)
  camera.position.set(0, 900, 0)
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
  renderer.setSize(width, height)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap
  renderer.shadowMap.autoUpdate = false
  renderer.domElement.setAttribute('aria-label', 'Interactive three-dimensional campus map. Use search to select a building.')
  el.appendChild(renderer.domElement)
  labelRenderer = new CSS2DRenderer()
  labelRenderer.setSize(width, height)
  Object.assign(labelRenderer.domElement.style, { position: 'absolute', inset: '0', overflow: 'hidden', pointerEvents: 'none' })
  el.appendChild(labelRenderer.domElement)
  controls = new OrbitControls(camera, renderer.domElement)
  motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  motionQuery.addEventListener('change', onMotionChange)
  controls.enableDamping = !motionQuery.matches
  controls.dampingFactor = 0.08
  controls.minPolarAngle = THREE.MathUtils.degToRad(15)
  controls.maxPolarAngle = THREE.MathUtils.degToRad(70)
  controls.screenSpacePanning = false
  controls.zoomToCursor = false
  controls.zoomSpeed = 0.8
  controls.panSpeed = 0.7
  controls.rotateSpeed = 0.65
  applyTouchGestures()
  controls.addEventListener('start', onControlStart)
  controls.addEventListener('end', onControlEnd)
  controls.addEventListener('change', requestRender)
  controls.update()
  scene.add(new THREE.HemisphereLight(0xddeef2, 0x8b8870, 1.8))
  sun = new THREE.DirectionalLight(0xfff3dd, 2.4)
  sun.castShadow = true
  sun.position.set(-250, 800, -850)
  scene.add(sun, sun.target)
  const dom = renderer.domElement
  dom.addEventListener('pointerdown', onPointerDown)
  dom.addEventListener('pointerup', onPointerUp)
  dom.addEventListener('pointermove', onPointerMove)
  dom.addEventListener('pointerleave', onPointerLeave)
  dom.addEventListener('pointercancel', onPointerCancel)
  dom.addEventListener('wheel', onMapWheel, { passive: false })
  dom.style.touchAction = 'none'
  dom.style.display = 'block'
  resizeObserver = new ResizeObserver(onResize)
  resizeObserver.observe(el)
  document.fonts?.ready.then(() => requestRender())
  rebuildZones()
  rebuildPins()
  loadModel()
  requestRender()
}

function onControlStart() {
  focusAnim = null
  overview = false
  focusedZone = null
  interacting = true
  requestRender()
}

function onControlEnd() { interacting = false; requestRender() }

// Phones pan with one finger like a map app; two fingers pinch to zoom and
// drag to tilt or turn. Elsewhere OrbitControls keeps its defaults.
function applyTouchGestures() {
  if (!controls) return
  controls.touches = props.mobile
    ? { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE }
    : { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }
}

/** Doubles the zoom, keeping the tapped spot under the finger. */
function zoomAtPoint(clientX: number, clientY: number) {
  const ndc = ndcFromClient(clientX, clientY)
  if (!ndc || !camera || !controls) return
  const toZoom = Math.min(camera.zoom * 2, controls.maxZoom)
  if (toZoom <= camera.zoom * 1.01) return
  raycaster.setFromCamera(ndc, camera)
  const point = raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -controls.target.y), new THREE.Vector3())
  stopControlMotion()
  const toTarget = point
    ? point.clone().add(controls.target.clone().sub(point).multiplyScalar(camera.zoom / toZoom))
    : controls.target.clone()
  overview = false
  focusedZone = null
  focusAnim = {
    fromPos: camera.position.clone(), fromTarget: controls.target.clone(), fromZoom: camera.zoom,
    toPos: toTarget.clone().add(camera.position.clone().sub(controls.target)), toTarget, toZoom,
    start: performance.now(), duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 280
  }
  requestRender()
}

function onMapWheel(event: WheelEvent) { event.preventDefault() }

function onMotionChange() {
  if (!controls) return
  stopControlMotion()
  controls.enableDamping = !motionQuery?.matches
  if (motionQuery?.matches && focusAnim && camera) {
    camera.position.copy(focusAnim.toPos)
    controls.target.copy(focusAnim.toTarget)
    camera.zoom = focusAnim.toZoom
    focusAnim = null
  }
  requestRender()
}

function onResize() {
  const el = container.value
  if (!el || !renderer || !camera) return
  const width = el.clientWidth || 1, height = el.clientHeight || 1
  aspect = width / height
  camera.left = -VIEW_HEIGHT * aspect / 2
  camera.right = VIEW_HEIGHT * aspect / 2
  camera.top = VIEW_HEIGHT / 2
  camera.bottom = -VIEW_HEIGHT / 2
  camera.updateProjectionMatrix()
  renderer.setSize(width, height)
  labelRenderer?.setSize(width, height)
  updateShadowResolution()
  // The page measures its panels in the same ResizeObserver delivery. Wait
  // for those props before fitting, including after manual navigation.
  nextTick(() => {
    if (destroyed) return
    if (overview) fitCamera()
    else if (focusedZone) focusOn(focusedZone, true)
    else { setCameraInsets(); constrainNavigation() }
    requestRender()
  })
  requestRender()
}

function requestRender() {
  if (destroyed || !renderer || frameId) return
  frameId = requestAnimationFrame(animate)
}

function animate() {
  frameId = 0
  if (destroyed) return
  if (camera && controls && focusAnim) {
    const t = Math.min(1, (performance.now() - focusAnim.start) / focusAnim.duration)
    const eased = 1 - Math.pow(1 - t, 3)
    camera.position.lerpVectors(focusAnim.fromPos, focusAnim.toPos, eased)
    controls.target.lerpVectors(focusAnim.fromTarget, focusAnim.toTarget, eased)
    camera.zoom = focusAnim.fromZoom + (focusAnim.toZoom - focusAnim.fromZoom) * eased
    camera.updateProjectionMatrix()
    if (t >= 1) focusAnim = null
  }
  const moving = controls?.update() ?? false
  constrainNavigation()
  if (renderer && scene && camera) {
    renderer.render(scene, camera)
    if (import.meta.dev) {
      renderer.domElement.dataset.renderCount = String(++renderCount)
      renderer.domElement.dataset.geometryCount = String(renderer.info.memory.geometries)
      renderer.domElement.dataset.textureCount = String(renderer.info.memory.textures)
    }
    labelRenderer?.render(scene, camera)
    layoutLabels()
  }
  if (focusAnim || moving || interacting) requestRender()
}

function layoutLabels() {
  if (!camera || !container.value) return
  const width = container.value.clientWidth, height = container.value.clientHeight
  const selected = selectedKeys()
  const hovered = props.autoBuildings ? hoveredId : hoveredZoneId
  const labels = [...labelObjects.values()].map(label => {
    const key = label.element.dataset.key ?? ''
    const priority = selected.has(key) ? 3 : key === hovered ? 2 : label.element.querySelector('.campus-map-label-status') ? 1 : 0
    return { label, key, priority }
  }).sort((a, b) => b.priority - a.priority || a.key.localeCompare(b.key, undefined, { numeric: true }))
  const occupied: { left: number; right: number; top: number; bottom: number }[] = []
  for (const { label, key, priority } of labels) {
    const point = label.position.clone().project(camera)
    const element = label.element
    const x = (point.x + 1) * width / 2, y = (1 - point.y) * height / 2
    const rect = { left: x - element.offsetWidth / 2 - 4, right: x + element.offsetWidth / 2 + 4, top: y - element.offsetHeight / 2 - 3, bottom: y + element.offsetHeight / 2 + 3 }
    const outside = point.z < -1 || point.z > 1 || rect.right < 0 || rect.left > width || rect.top < 0 || rect.bottom > height
    const blocked = priority < 2 && (rect.top < props.viewInsets.top || rect.bottom > height - props.viewInsets.bottom || rect.left < props.viewInsets.left || rect.right > width - props.viewInsets.right)
    const collision = occupied.some(other => rect.left < other.right && rect.right > other.left && rect.top < other.bottom && rect.bottom > other.top)
    // On phones only the selected building is named until the user zooms in,
    // so names and status badges don't bury the pins in the overview.
    const zoomedOut = props.mobile && camera.zoom < overviewZoom * MOBILE_LABEL_ZOOM
    const visible = !outside && !blocked && (!collision || priority === 3) && (!zoomedOut || priority === 3)
    element.style.visibility = visible ? 'visible' : 'hidden'
    element.classList.toggle('is-selected', selected.has(key))
    element.classList.toggle('is-hovered', key === hovered)
    if (visible) occupied.push(rect)
  }
}

function onPointerLeave() {
  hoveredId = null
  hoveredZoneId = null
  if (renderer) renderer.domElement.style.cursor = 'default'
  applyHighlight()
}

function onPointerCancel() { pointerDownTime = 0; onPointerLeave() }

function onPointerDown(event: PointerEvent) {
  pointerDownPos = { x: event.clientX, y: event.clientY }
  pointerDownTime = performance.now()
}

function onPointerUp(event: PointerEvent) {
  const moved = Math.hypot(event.clientX - pointerDownPos.x, event.clientY - pointerDownPos.y)
  const elapsed = performance.now() - pointerDownTime
  if (!pointerDownTime || !event.isPrimary || event.button !== 0 || moved > 8 || elapsed > 500) return

  if (props.pickPoint) {
    const pick = pickMapPoint(event.clientX, event.clientY)
    if (pick) emit('point-picked', pick)
    return
  }

  if (props.editable) {
    const building = pickModelBuilding(event.clientX, event.clientY)
    if (building) {
      emit('building-selected', building)
    } else {
      emit('building-missed')
    }
    return
  }

  if (props.mobile) {
    // A second tap close by zooms in; a single tap selects once it's clear no
    // second tap is coming.
    const now = performance.now()
    if (tapTimer && lastTap && now - lastTap.time < DOUBLE_TAP_MS && Math.hypot(event.clientX - lastTap.x, event.clientY - lastTap.y) < DOUBLE_TAP_DISTANCE) {
      clearTimeout(tapTimer)
      tapTimer = null
      lastTap = null
      zoomAtPoint(event.clientX, event.clientY)
      return
    }
    const { clientX, clientY } = event
    lastTap = { x: clientX, y: clientY, time: now }
    if (tapTimer) clearTimeout(tapTimer)
    tapTimer = setTimeout(() => { tapTimer = null; selectAt(clientX, clientY) }, DOUBLE_TAP_MS)
    return
  }

  selectAt(event.clientX, event.clientY)
}

function selectAt(clientX: number, clientY: number) {
  if (!props.autoBuildings) {
    const zone = pickZone(clientX, clientY)
    if (zone) {
      emit('select', zone)
      return
    }
  }

  const building = pickModelBuilding(clientX, clientY)
  if (!building?.name) return
  const order = /^\d+$/.test(building.name) ? parseInt(building.name, 10) : NaN
  const entry = Number.isFinite(order) ? buildingEntries.get(order) : undefined
  if (!entry) return

  const status = props.statusByOrder[String(order)]
  emit('select', {
    id: normalizeName(entry.name),
    buildingOrder: order,
    name: entry.name,
    type: 'Property',
    corners: building.corners,
    height: building.height,
    baseY: building.baseY,
    color: status ? STATUS_COLORS[status] : DEFAULT_COLOR
  })
}

function onPointerMove(event: PointerEvent) {
  if (!renderer) return
  if (props.editable) {
    const now = performance.now()
    if (now - lastHoverCheck > 80) {
      lastHoverCheck = now
      renderer.domElement.style.cursor = pickModelBuilding(event.clientX, event.clientY) ? 'pointer' : 'default'
    }
    return
  }

  let overPointer = false
  if (!props.autoBuildings) {
    const zone = pickZone(event.clientX, event.clientY)
    const id = zone ? zoneIdOf(zone) : null
    if (id !== hoveredZoneId) {
      hoveredZoneId = id
      applyHighlight()
    }
    overPointer = !!zone
  }

  const now = performance.now()
  if (now - lastHoverCheck > 80) {
    lastHoverCheck = now
    const building = pickModelBuilding(event.clientX, event.clientY)
    let id: string | null = null
    if (building?.name && /^\d+$/.test(building.name)) {
      const entry = buildingEntries.get(parseInt(building.name, 10))
      if (entry) id = String(entry.order)
    }
    if (id !== hoveredId) {
      hoveredId = id
      applyHighlight()
    }
    overPointer = overPointer || !!id
  }
  renderer.domElement.style.cursor = props.pickPoint ? 'crosshair' : (overPointer || !!hoveredId) ? 'pointer' : 'default'
}

watch(
  () => props.zones,
  () => rebuildZones(),
  { deep: true }
)

watch(
  () => props.activeZoneId,
  () => applyHighlight()
)

watch(
  () => props.showNames,
  () => rebuildLabels()
)

watch(
  () => props.labels,
  () => rebuildLabels(),
  { deep: true }
)

watch(
  () => props.buildingColors,
  () => rebuildZones(),
  { deep: true }
)

watch(
  () => props.buildingStatus,
  () => rebuildLabels(),
  { deep: true }
)

watch(
  () => props.statusByOrder,
  () => {
    rebuildEdges()
    rebuildLabels()
  },
  { deep: true }
)

watch(
  () => [props.pins, props.activePinId, props.pickPoint],
  () => rebuildPins(),
  { deep: true }
)

onMounted(() => init())

function cleanupResources() {
  cancelAnimationFrame(frameId)
  frameId = 0
  if (initTimer) clearTimeout(initTimer)
  if (tapTimer) clearTimeout(tapTimer)
  tapTimer = null
  resizeObserver?.disconnect()
  motionQuery?.removeEventListener('change', onMotionChange)
  decoder?.dispose()
  decoder = null
  const dom = renderer?.domElement
  if (dom) {
    dom.removeEventListener('pointerdown', onPointerDown)
    dom.removeEventListener('pointerup', onPointerUp)
    dom.removeEventListener('pointermove', onPointerMove)
    dom.removeEventListener('pointerleave', onPointerLeave)
    dom.removeEventListener('pointercancel', onPointerCancel)
    dom.removeEventListener('wheel', onMapWheel)
    dom.remove()
  }
  if (scene) {
    disposeObjects([scene], campusMaterials?.sourceMaterials)
    scene.clear()
  }
  sun?.shadow.dispose()
  for (const label of labelObjects.values()) label.element.remove()
  labelObjects.clear()
  for (const pin of pinObjects.values()) pin.element.remove()
  pinObjects.clear()
  zoneMeshes.clear()
  hoverEdges.clear()
  edgeQueue.length = 0
  cancelEdgeJob?.(new Error('Map viewer closed'))
  cancelEdgeJob = null
  edgeWorker?.terminate()
  edgeWorker = null
  campusMaterials = null
  labelRenderer?.domElement.remove()
  controls?.removeEventListener('start', onControlStart)
  controls?.removeEventListener('end', onControlEnd)
  controls?.removeEventListener('change', requestRender)
  controls?.dispose()
  renderer?.dispose()
  renderer = null
  labelRenderer = null
  controls = null
  camera = null
  scene = null
  modelGroup = null
  modelBounds = null
  campusFramePoints = []
  sun = null
  focusAnim = null
  buildingNodes = []
}

onBeforeUnmount(() => { destroyed = true; cleanupResources() })

watch(() => props.activeBuildingOrder, applyHighlight)
watch(() => [props.activeZoneId, props.activeBuildingOrder], () => {
  if (props.activeZoneId == null && props.activeBuildingOrder == null) focusedZone = null
})
watch(() => props.occupiedLabel, rebuildLabels)
// Crossing the phone breakpoint swaps gestures and camera framing, so the
// view is rebuilt for the new layout instead of keeping the other one's.
watch(() => props.mobile, () => {
  applyTouchGestures()
  if (tapTimer) clearTimeout(tapTimer)
  tapTimer = null
  lastTap = null
  if (!camera || !controls || !modelGroup) return
  focusAnim = null
  // Let the page re-measure its overlays for the new layout first.
  nextTick(() => {
    if (destroyed) return
    if (focusedZone) focusOn(focusedZone, true)
    else resetCamera()
  })
})
watch(() => props.viewInsets, () => {
  if (overview) fitCamera()
  else if (focusedZone) focusOn(focusedZone, true)
  requestRender()
}, { deep: true })

/** The same zone a click on the building emits, for selecting it from code. */
function getBuildingZone(order: number): MapZone | null {
  const b = buildingNodes.find((node) => node.order === order)
  const entry = buildingEntries.get(order)
  if (!b || !entry) return null
  const status = props.statusByOrder[String(order)]
  return {
    id: normalizeName(entry.name),
    buildingOrder: order,
    name: entry.name,
    type: 'Property',
    corners: b.corners,
    height: b.height,
    baseY: b.baseY,
    color: status ? STATUS_COLORS[status] : DEFAULT_COLOR
  }
}

defineExpose({ resetCamera, focusOn, focusBuilding, getBuildingZone, getBuildingOrders: () => buildingNodes.filter(b => buildingEntries.has(b.order)).map(b => b.order) })
</script>

<template>
  <div ref="container" class="relative h-full w-full overscroll-contain" :class="{ 'campus-map-mobile': mobile }" />
</template>

<style>
.campus-map-label {
  position: absolute;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 9px;
  border: 1px solid color-mix(in srgb, var(--color-maroon-700) 18%, var(--ui-border));
  border-radius: 9px;
  background: color-mix(in srgb, var(--ui-bg) 96%, transparent);
  color: var(--ui-text-highlighted);
  font-family: var(--font-sans);
  font-size: 11px;
  font-weight: 600;
  line-height: 1.4;
  white-space: nowrap;
  user-select: none;
  pointer-events: none;
  box-shadow: 0 2px 8px rgb(20 35 27 / 12%);
}
.campus-map-label-name {
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.campus-map-label.is-selected {
  border-color: var(--color-gold-500);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-gold-400) 24%, transparent), 0 3px 12px rgb(20 35 27 / 18%);
}
.campus-map-label.is-hovered { border-color: var(--color-gold-400); }
.campus-map-label-status {
  display: inline-flex;
  align-items: center;
  padding: 2px 5px;
  border-radius: 5px;
  background: var(--color-maroon-50);
  color: var(--color-maroon-800);
  font-size: 9px;
  font-weight: 700;
}
.campus-map-pin {
  position: absolute;
  width: 0;
  height: 0;
  pointer-events: none;
}
.campus-map-pin-marker {
  position: absolute;
  bottom: 4px;
  left: -13px;
  width: 26px;
  height: 26px;
  padding: 0;
  border: 2px solid #fff;
  border-radius: 50% 50% 50% 0;
  background: var(--pin-color);
  box-shadow: 0 3px 10px rgb(20 35 27 / 35%);
  transform: rotate(-45deg);
  transform-origin: center;
  pointer-events: none;
}
.campus-map-pin-marker::after {
  content: '';
  position: absolute;
  inset: 7px;
  border-radius: 50%;
  background: #fff;
}
.campus-map-pin::after {
  content: '';
  position: absolute;
  left: -4px;
  top: -2px;
  width: 8px;
  height: 4px;
  border-radius: 50%;
  background: rgb(0 0 0 / 30%);
}
.campus-map-pin.is-interactive .campus-map-pin-marker { cursor: pointer; pointer-events: auto; }
.campus-map-pin.is-interactive .campus-map-pin-marker:hover,
.campus-map-pin.is-interactive .campus-map-pin-marker:focus-visible { outline: none; box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-gold-400) 55%, transparent), 0 3px 10px rgb(20 35 27 / 35%); }
.campus-map-pin.is-active .campus-map-pin-marker { bottom: 7px; left: -17px; width: 34px; height: 34px; border-color: var(--color-gold-400); }
.campus-map-pin.is-active .campus-map-pin-marker::after { inset: 9px; }
.campus-map-pin.is-muted { opacity: 0.45; }
.campus-map-pin-label {
  position: absolute;
  bottom: 40px;
  left: 0;
  transform: translateX(-50%);
  padding: 3px 7px;
  border-radius: 7px;
  background: color-mix(in srgb, var(--ui-bg) 96%, transparent);
  color: var(--ui-text-highlighted);
  font-family: var(--font-sans);
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
  box-shadow: 0 2px 8px rgb(20 35 27 / 15%);
  opacity: 0;
  transition: opacity 120ms ease;
  pointer-events: none;
}
.campus-map-pin.is-active .campus-map-pin-label { bottom: 48px; }
.campus-map-pin.is-active .campus-map-pin-label,
.campus-map-pin:hover .campus-map-pin-label,
.campus-map-pin:focus-within .campus-map-pin-label { opacity: 1; }
@media (max-width: 959px) {
  /* Pinch and drag move the map, never the page. */
  .campus-map-mobile, .campus-map-mobile canvas { touch-action: none; }
  /* Smaller pins, each with an invisible 44px tap target. */
  .campus-map-mobile .campus-map-pin-marker { left: -11px; width: 22px; height: 22px; }
  .campus-map-mobile .campus-map-pin-marker::after { inset: 6px; }
  .campus-map-mobile .campus-map-pin-marker::before { content: ''; position: absolute; inset: -11px; border-radius: 50%; }
  .campus-map-mobile .campus-map-pin.is-active .campus-map-pin-marker { left: -15px; width: 30px; height: 30px; }
  .campus-map-mobile .campus-map-pin.is-active .campus-map-pin-marker::after { inset: 8px; }
  .campus-map-mobile .campus-map-pin.is-active .campus-map-pin-marker::before { inset: -7px; }
  .campus-map-mobile .campus-map-pin-label { bottom: 34px; }
  .campus-map-mobile .campus-map-pin.is-active .campus-map-pin-label { bottom: 42px; }
}
.campus-map-label-status.is-vacant { background: #dcfce7; color: #166534; }
.campus-map-label-status.is-occupied { background: #fbe8e6; color: #7b2b24; }
</style>
