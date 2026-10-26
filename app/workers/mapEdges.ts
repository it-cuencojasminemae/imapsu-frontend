import { BufferAttribute, BufferGeometry, EdgesGeometry } from 'three'

export type EdgeSource = { position: Float32Array; index: Uint16Array | Uint32Array | null }
export type EdgeRequest = { thresholdAngle: number; sources: EdgeSource[] }

// EdgesGeometry takes seconds for the full campus, so the viewer runs it here
// and receives only the finished line positions.
self.onmessage = ({ data }: MessageEvent<EdgeRequest>) => {
  const edges = data.sources.map(({ position, index }) => {
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(position, 3))
    if (index) geometry.setIndex(new BufferAttribute(index, 1))
    return new EdgesGeometry(geometry, data.thresholdAngle).getAttribute('position').array as Float32Array
  })
  self.postMessage(edges, { transfer: edges.map(array => array.buffer as ArrayBuffer) })
}
