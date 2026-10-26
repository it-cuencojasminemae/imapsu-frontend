import test from 'node:test'
import assert from 'node:assert/strict'
import type { MapProperty } from '../app/types/map.ts'
import { resolveStallPhotoUrl, stallFloorLabel, stallPhotos, stallTitle, visibleStalls } from '../app/utils/mapStalls.ts'
import { useMapStallDetails } from '../app/composables/useMapStallDetails.ts'
import { effectScope, ref } from 'vue'

const baseURL = 'http://localhost:1337'
const property: MapProperty = { documentId: 'stall-1', propertyCode: 'A-01', name: 'Stall 1', building: 'Cafe', space_status: 'Occupied', businessName: ' Campus Cafe ', photos: [{ id: 1, url: '/uploads/listing.jpg' }], tenantPhotos: [{ id: 2, url: 'https://media.example.com/business.jpg' }, { id: 3, url: '/uploads/business-2.jpg' }] }

test('occupied stalls prefer all valid tenant photos; missing tenant media falls back to listings', () => {
  const before = structuredClone(property)
  assert.deepEqual(stallPhotos(property, baseURL).map(photo => photo.url), ['https://media.example.com/business.jpg', `${baseURL}/uploads/business-2.jpg`])
  for (const tenantPhotos of [null, [], [{ id: 4, url: '' }, { id: 5, url: 'javascript:alert(1)' }]]) {
    assert.equal(stallPhotos({ ...property, tenantPhotos }, baseURL)[0]?.url, `${baseURL}/uploads/listing.jpg`)
  }
  assert.deepEqual(property, before, 'media presentation must not rewrite the property response')
})

test('vacant stalls use listing photos and absent or unsafe URLs do not become image requests', () => {
  assert.deepEqual(stallPhotos({ ...property, space_status: 'Vacant' }, baseURL).map(photo => photo.id), [1])
  assert.deepEqual(stallPhotos({ ...property, photos: null, tenantPhotos: null }, baseURL), [])
  assert.equal(resolveStallPhotoUrl('uploads/photo.png', baseURL), `${baseURL}/uploads/photo.png`)
  assert.equal(resolveStallPhotoUrl(' https://example.com/photo.png ', baseURL), 'https://example.com/photo.png')
  // An empty baseURL means uploads go through this site's own /uploads proxy.
  assert.equal(resolveStallPhotoUrl('/uploads/photo.png', ''), '/uploads/photo.png')
  assert.equal(resolveStallPhotoUrl('uploads/photo.png', ''), '/uploads/photo.png')
  assert.equal(resolveStallPhotoUrl('https://example.com/photo.png', ''), 'https://example.com/photo.png')
  assert.equal(resolveStallPhotoUrl('javascript:alert(1)', ''), null)
  for (const url of [undefined, '', '  ', 'data:image/png;base64,abc', 'file:///photo.png', 'https://[invalid']) assert.equal(resolveStallPhotoUrl(url, baseURL), null)
})

test('titles and student visibility follow occupancy without changing record order', () => {
  assert.equal(stallTitle(property), 'Campus Cafe')
  assert.equal(stallTitle({ ...property, space_status: 'Vacant' }), 'Stall 1')
  assert.equal(stallTitle({ ...property, businessName: ' ', name: '' }), 'A-01')
  const occupied = { ...property, propertyCode: 'A-03' }
  const vacant = { ...property, propertyCode: 'A-02', space_status: 'Vacant' as const }
  const unknown = { ...property, propertyCode: 'A-04', space_status: 'Pending' as MapProperty['space_status'] }
  const records = [property, vacant, occupied, unknown]
  assert.deepEqual(visibleStalls(records, true).map(p => p.propertyCode), ['A-01', 'A-03'])
  assert.equal(visibleStalls(records, false), records)
  assert.equal(records.length, 4)
})

test('stall selection uses the latest response and closes when a refresh removes access', () => {
  const scope = effectScope()
  scope.run(() => {
    const records = ref<MapProperty[]>([property])
    const building = ref<string | null>('57:Cafe')
    const labelMode = ref(false)
    const details = useMapStallDetails(records, building, labelMode)
    assert.equal(details.stallOpen.value, false, 'a single stall must still require explicit selection')
    assert.equal(details.selectStall(property), true)
    records.value = [{ ...property, businessName: 'Updated business' }]
    assert.equal(details.selectedStall.value?.businessName, 'Updated business')
    assert.equal(details.stallOpen.value, true)
    records.value = []
    assert.equal(details.stallOpen.value, false)
    assert.equal(details.selectedStallKey.value, null)
    assert.equal(details.selectStall(property), false, 'a stale card cannot open a removed record')
  })
  scope.stop()
})

test('changing buildings, closing the building, and OAS labeling clear the stall popup', () => {
  const scope = effectScope()
  scope.run(() => {
    const records = ref<MapProperty[]>([property])
    const building = ref<string | null>('19:Duplicate name')
    const labelMode = ref(false)
    const details = useMapStallDetails(records, building, labelMode)
    details.selectStall(property)
    building.value = '50:Duplicate name'
    assert.equal(details.stallOpen.value, false)
    details.selectStall(property)
    building.value = null
    assert.equal(details.stallOpen.value, false)
    assert.equal(details.selectStall(property), false)
    building.value = '57:Cafe'
    details.selectStall(property)
    labelMode.value = true
    assert.equal(details.stallOpen.value, false)
    assert.equal(details.selectStall(property), false)
  })
  scope.stop()
})

test('floors read as words and free text is kept', () => {
  assert.equal(stallFloorLabel('1'), '1st floor')
  assert.equal(stallFloorLabel(' 2 '), '2nd floor')
  assert.equal(stallFloorLabel('3'), '3rd floor')
  assert.equal(stallFloorLabel('11'), '11th floor')
  assert.equal(stallFloorLabel('G'), 'Ground floor')
  assert.equal(stallFloorLabel('Mezzanine'), 'Mezzanine')
  for (const floor of [undefined, '', '  ']) assert.equal(stallFloorLabel(floor), null)
})
