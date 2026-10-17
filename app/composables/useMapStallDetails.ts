import { computed, ref, watch, type Ref } from 'vue'
import type { MapProperty } from '../types/map.ts'
import { stallKey } from '../utils/mapStalls.ts'

/** Keep an open stall tied to the currently permitted building response. */
export function useMapStallDetails(
  properties: Readonly<Ref<MapProperty[]>>,
  buildingKey: Readonly<Ref<string | null>>,
  labelMode: Readonly<Ref<boolean>>
) {
  const stallOpen = ref(false)
  const selectedStallKey = ref<string | null>(null)
  const selectedStall = computed(() => properties.value.find(property => stallKey(property) === selectedStallKey.value) ?? null)
  const clearStall = () => { stallOpen.value = false; selectedStallKey.value = null }
  const selectStall = (property: MapProperty) => {
    const key = stallKey(property)
    if (labelMode.value || !buildingKey.value || !properties.value.some(item => stallKey(item) === key)) return false
    selectedStallKey.value = key
    stallOpen.value = true
    return true
  }
  watch(buildingKey, clearStall, { flush: 'sync' })
  watch(labelMode, mode => { if (mode) clearStall() }, { flush: 'sync' })
  watch(selectedStall, property => { if (selectedStallKey.value && !property) clearStall() }, { flush: 'sync' })
  return { stallOpen, selectedStallKey, selectedStall, selectStall, clearStall }
}
