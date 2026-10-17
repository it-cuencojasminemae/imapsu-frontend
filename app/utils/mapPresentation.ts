import * as THREE from 'three'

export type MapViewInsets = { top: number; right: number; bottom: number; left: number }

export function mapPropertyStatus(value: unknown): 'Vacant' | 'Occupied' | null {
  return value === 'Vacant' || value === 'Occupied' ? value : null
}

export function boxCorners(box: THREE.Box3): THREE.Vector3[] {
  return [box.min.x, box.max.x].flatMap(x =>
    [box.min.y, box.max.y].flatMap(y => [box.min.z, box.max.z].map(z => new THREE.Vector3(x, y, z)))
  )
}

/** Keep rotated, elongated meshes tight instead of re-boxing them in world axes. */
export function mapGeometryPoints(root: THREE.Object3D): THREE.Vector3[] {
  root.updateWorldMatrix(true, true)
  const points: THREE.Vector3[] = []
  root.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return
    node.geometry.computeBoundingBox()
    if (!node.geometry.boundingBox?.isEmpty()) {
      points.push(...boxCorners(node.geometry.boundingBox!).map(point => point.applyMatrix4(node.matrixWorld)))
    }
  })
  return points
}

export function mapViewOffset(insets: MapViewInsets) {
  return { x: (insets.right - insets.left) / 2, y: (insets.bottom - insets.top) / 2 }
}

/** Fit the actual projected bounds, including building height, into the unobscured canvas. */
export function frameMapBox(
  box: THREE.Box3, direction: THREE.Vector3, width: number, height: number,
  viewHeight: number, insets: MapViewInsets, margin = 1.12,
  points = boxCorners(box)
) {
  const center = box.getCenter(new THREE.Vector3())
  const right = new THREE.Vector3(0, 1, 0).cross(direction).normalize()
  const up = direction.clone().cross(right).normalize()
  const projected = points.map(point => point.clone().sub(center))
  const xs = projected.map(point => point.dot(right))
  const ys = projected.map(point => point.dot(up))
  const availableWidth = Math.max(width - insets.left - insets.right, width * 0.15, 1)
  const availableHeight = Math.max(height - insets.top - insets.bottom, height * 0.15, 1)
  const pixelsPerUnit = Math.min(
    availableWidth / Math.max(Math.max(...xs) - Math.min(...xs), 1),
    availableHeight / Math.max(Math.max(...ys) - Math.min(...ys), 1)
  ) / margin
  const target = center.clone()
    .addScaledVector(right, (Math.max(...xs) + Math.min(...xs)) / 2)
    .addScaledVector(up, (Math.max(...ys) + Math.min(...ys)) / 2)
  // Moving along the view direction preserves the projected center while
  // anchoring orbit/pan to the campus plane. Overlay offsets belong to the
  // projection, so zoom does not magnify an offset in the controls target.
  target.addScaledVector(direction, (center.y - target.y) / direction.y)
  const distance = Math.max(box.getSize(new THREE.Vector3()).length() * 2, 100)
  return { target, position: target.clone().addScaledVector(direction, distance), zoom: pixelsPerUnit * viewHeight / height, offset: mapViewOffset(insets), projectedAspect: (Math.max(...xs) - Math.min(...xs)) / Math.max(Math.max(...ys) - Math.min(...ys), 1) }
}

type MapPanelRect = { left: number; right: number; top: number; bottom: number }

/** Choose a clear rectangle shaped for the campus instead of reserving full
 * horizontal strips for controls that only occupy the canvas corners. */
export function unobscuredMapInsets(width: number, height: number, panels: MapPanelRect[], aspect: number): MapViewInsets {
  const padding = 16
  const obstacles = panels.map(rect => ({ left: rect.left - 12, right: rect.right + 12, top: rect.top - 12, bottom: rect.bottom + 12 }))
  const lefts = [padding, ...obstacles.map(rect => rect.right)]
  const rights = [width - padding, ...obstacles.map(rect => rect.left)]
  let best = { left: padding, right: width - padding, top: padding, bottom: height - padding }
  let bestScore = -Infinity, bestArea = 0
  for (const left of lefts) for (const right of rights) {
    if (left < padding || right > width - padding || right <= left) continue
    const blocked = obstacles.filter(rect => rect.left < right && rect.right > left).sort((a, b) => a.top - b.top)
    let top = padding
    const consider = (bottom: number) => {
      if (bottom <= top) return
      const score = Math.min((right - left) / Math.max(aspect, 0.1), bottom - top)
      const area = (right - left) * (bottom - top)
      if (score > bestScore || (score === bestScore && area > bestArea)) {
        best = { left, right, top, bottom }; bestScore = score; bestArea = area
      }
    }
    for (const rect of blocked) {
      consider(Math.min(rect.top, height - padding))
      top = Math.max(top, rect.bottom)
    }
    consider(height - padding)
  }
  return { top: best.top, right: width - best.right, bottom: height - best.bottom, left: best.left }
}

/** Bound pans in the camera plane, tightening the range when zoomed out. */
export function constrainMapTarget(
  target: THREE.Vector3, box: THREE.Box3, points: THREE.Vector3[], direction: THREE.Vector3,
  visibleWidth: number, visibleHeight: number
) {
  const center = box.getCenter(new THREE.Vector3())
  const right = new THREE.Vector3(0, 1, 0).cross(direction).normalize()
  const up = direction.clone().cross(right).normalize()
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const point of points) {
    const delta = point.clone().sub(center)
    const x = delta.dot(right), y = delta.dot(up)
    minX = Math.min(minX, x); maxX = Math.max(maxX, x)
    minY = Math.min(minY, y); maxY = Math.max(maxY, y)
  }
  const rangeX = Math.max((maxX - minX) * 0.08, (maxX - minX) * 0.54 - visibleWidth * 0.35)
  const rangeY = Math.max((maxY - minY) * 0.08, (maxY - minY) * 0.54 - visibleHeight * 0.35)
  const next = target.clone().setY(center.y)
  const delta = next.clone().sub(center)
  const x = delta.dot(right), y = delta.dot(up)
  const dx = THREE.MathUtils.clamp(x, (minX + maxX) / 2 - rangeX, (minX + maxX) / 2 + rangeX) - x
  const dy = THREE.MathUtils.clamp(y, (minY + maxY) / 2 - rangeY, (minY + maxY) / 2 + rangeY) - y
  const groundUp = up.clone().setY(0)
  next.addScaledVector(right, dx).addScaledVector(groundUp, dy / Math.max(groundUp.lengthSq(), 0.01))
  const size = box.getSize(new THREE.Vector3())
  next.x = THREE.MathUtils.clamp(next.x, box.min.x - size.x * 0.05, box.max.x + size.x * 0.05)
  next.z = THREE.MathUtils.clamp(next.z, box.min.z - size.z * 0.05, box.max.z + size.z * 0.05)
  return next
}

export function isMapHighlightActive(key: string, selected: ReadonlySet<string>, hovered: string | null) {
  return selected.has(key) || key === hovered
}
