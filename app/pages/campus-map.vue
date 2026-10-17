<script setup lang="ts">
import type { MapProperty, MapZone } from '~/types/map'
import { MAP_STATUS_COLORS, normalizeBuildingName } from '~/utils/mapZones'
import { PAMSU_BUILDINGS, pamsuBuildingFor, buildingStatusByOrder, propertiesInPamsuBuilding } from '~/utils/pamsu'
import { mapBindingDiagnostics } from '~/utils/mapDiagnostics'
import { fetchMapPages, type MapListResponse } from '~/utils/mapPagination'
import { mapPropertyStatus, unobscuredMapInsets } from '~/utils/mapPresentation'
import { stallKey, stallPhotos, stallTitle, visibleStalls } from '~/utils/mapStalls'
import { useMapStallDetails } from '~/composables/useMapStallDetails'

type MapLabel = {
  documentId?: string
  buildingKey: string
  label: string
}

useHead({ title: 'Campus Map | iMapSU' })
definePageMeta({ pageTransition: false })

const auth = useAuth()
const toast = useToast()
const { baseURL, $api, getErrorMessage } = useStrapi()

const propertiesKey = computed(() => `map-properties:${auth.user.value?.id ?? 'guest'}`)
const { data: propertiesData, status, refresh: refreshProperties } = await useAsyncData(propertiesKey, () =>
  fetchMapPages<MapProperty>((page, pageSize) => $api<MapListResponse<MapProperty>>('/api/property-spaces', {
    query: { sort: 'propertyCode:asc', 'pagination[page]': page, 'pagination[pageSize]': pageSize, 'populate[photos]': true, 'populate[tenantPhotos]': true }
  }))
)

const labelsKey = computed(() => `map-labels:${auth.user.value?.id ?? 'guest'}`)
const { data: labelsData, status: labelsStatus, refresh: refreshLabels } = await useAsyncData(labelsKey, () =>
  fetchMapPages<MapLabel>((page, pageSize) => $api<MapListResponse<MapLabel>>('/api/map-labels', {
    query: { sort: 'id:asc', 'pagination[page]': page, 'pagination[pageSize]': pageSize }
  }))
)

const { data: retainedProperties } = useRequestPresentation(propertiesData, status)
const properties = computed(() => {
  const all = retainedProperties.value?.data ?? []
  // Students don't see vacant spaces: the API filters them too, but drop them
  // here as well so the panel and the building tints never leak vacancy data.
  return visibleStalls(all, auth.isStudent.value)
})
const statusByOrder = computed(() => buildingStatusByOrder(properties.value.filter(p => mapPropertyStatus(p.space_status))))
const labels = computed<Record<string, string>>(() => {
  const map: Record<string, string> = {}
  for (const entry of labelsData.value?.data ?? []) map[normalizeBuildingName(entry.buildingKey)] = entry.label
  return map
})
const selected = ref<MapZone | null>(null)
const modelError = ref('')
const modelReady = ref(false)
const availableBuildingOrders = ref<Set<number>>(new Set())
const showNames = ref(true)
const buildingCount = ref(0)

// OAS-only building labeling. In this mode clicking a building opens the name
// editor instead of the property details panel.
const labelMode = ref(false)
const labelOpen = ref(false)
const labelingZone = ref<MapZone | null>(null)
const labelDraft = ref('')
const savingLabel = ref(false)
const labelError = ref('')

type ViewerRef = { resetCamera: () => void; focusOn: (zone: MapZone) => void; focusBuilding: (order: number) => void; getBuildingOrders: () => number[] }

const bindingDiagnostics = computed(() => mapBindingDiagnostics(properties.value, PAMSU_BUILDINGS, [...availableBuildingOrders.value], pamsuBuildingFor))
const viewer = ref<ViewerRef | null>(null)
const onBuildingsReady = (count: number) => {
  buildingCount.value = count
  availableBuildingOrders.value = new Set(viewer.value?.getBuildingOrders() ?? [])
  modelReady.value = true
}
const onModelError = (message: string) => { modelError.value = message; modelReady.value = false }

const displayName = (zone: MapZone) => labels.value[normalizeBuildingName(zone.name)] ?? zone.name
const selectedColor = computed(() => {
  const occupancy = selected.value?.buildingOrder != null ? statusByOrder.value[String(selected.value.buildingOrder)] : undefined
  return occupancy === 'Vacant' ? MAP_STATUS_COLORS.vacant : occupancy === 'Occupied' ? MAP_STATUS_COLORS.occupied : MAP_STATUS_COLORS.unlisted
})

type SearchResult = {
  order: number
  name: string
  shortname: string
  match: string
}

const searchQuery = ref('')
const searchOpen = ref(false)

const closeSearch = () => {
  searchCloseTimer = setTimeout(() => {
    searchOpen.value = false
  }, 150)
}

const searchResults = computed<SearchResult[]>(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (q.length < 2) return []
  const results: SearchResult[] = []
  for (const entry of PAMSU_BUILDINGS) {
    const name = entry.name.toLowerCase()
    const short = entry.shortname.toLowerCase()
    const nameHit = name.includes(q)
    const shortHit = short.length > 0 && short.includes(q)
    const business = propertiesInPamsuBuilding(entry.name, properties.value)
      .filter((p) => p.space_status === 'Occupied')
      .map((p) => (p.businessName ?? '').trim())
      .find((b) => b.toLowerCase().includes(q))
    if (nameHit || shortHit || business) {
      results.push({
        order: entry.order,
        name: entry.name,
        shortname: entry.shortname,
        match: business ?? (shortHit ? entry.shortname : '')
      })
    }
  }
  return results
})

const jumpTo = (order: number) => {
  if (!modelReady.value || !availableBuildingOrders.value.has(order)) return
  viewer.value?.focusBuilding(order)
  searchQuery.value = ''
  searchOpen.value = false
}

const selectZone = async (zone: MapZone) => {
  selected.value = zone
  if (labelMode.value && auth.isOas.value) {
    const key = normalizeBuildingName(zone.name)
    labelDraft.value = labels.value[key] ?? zone.name
    labelingZone.value = zone
    labelError.value = ''
    labelOpen.value = true
  }
  await nextTick()
  if (selected.value?.buildingOrder !== zone.buildingOrder || selected.value?.name !== zone.name) return
  viewer.value?.focusOn(zone)
}

const closePanel = () => {
  selected.value = null
}

const saveLabel = async () => {
  const zone = labelingZone.value
  if (!zone) return
  const name = labelDraft.value.trim()
  if (!name) {
    labelError.value = 'Enter a name for this building.'
    return
  }
  savingLabel.value = true
  labelError.value = ''
  try {
    const key = normalizeBuildingName(zone.name)
    const existing = labelsData.value?.data.find((l) => normalizeBuildingName(l.buildingKey) === key)
    if (existing?.documentId) {
      await $api(`/api/map-labels/${existing.documentId}`, { method: 'PUT', body: { data: { label: name } } })
    } else {
      await $api('/api/map-labels', { method: 'POST', body: { data: { buildingKey: key, label: name } } })
    }
    toast.add({ title: 'Building name saved', color: 'success', icon: 'i-lucide-check-circle-2' })
    labelOpen.value = false
    await refreshLabels()
  } catch (err) {
    labelError.value = getErrorMessage(err)
  } finally {
    savingLabel.value = false
  }
}

const removeLabel = async () => {
  const zone = labelingZone.value
  if (!zone) return
  savingLabel.value = true
  labelError.value = ''
  try {
    const key = normalizeBuildingName(zone.name)
    const existing = labelsData.value?.data.find((l) => normalizeBuildingName(l.buildingKey) === key)
    if (existing?.documentId) {
      await $api(`/api/map-labels/${existing.documentId}`, { method: 'DELETE' })
      toast.add({ title: 'Building name removed', color: 'neutral', icon: 'i-lucide-eraser' })
    }
    labelOpen.value = false
    await refreshLabels()
  } catch (err) {
    labelError.value = getErrorMessage(err)
  } finally {
    savingLabel.value = false
  }
}

const buildingProperties = computed(() => propertiesInPamsuBuilding(selected.value?.name ?? '', properties.value))

const propertyPhotos = (property: MapProperty) => stallPhotos(property, baseURL)
const { stallOpen, selectedStallKey, selectedStall, selectStall, clearStall } = useMapStallDetails(
  buildingProperties,
  computed(() => selected.value ? `${selected.value.buildingOrder ?? ''}:${selected.value.name}` : null),
  labelMode
)
const galleryPhotos = computed(() => selectedStall.value ? propertyPhotos(selectedStall.value) : [])
const photoIndex = ref(0)
const activePhoto = computed(() => galleryPhotos.value[photoIndex.value])
const failedPhotos = reactive(new Set<string>())
let stallTrigger: HTMLElement | null = null
const markPhotoFailed = (event: Event) => failedPhotos.add((event.currentTarget as HTMLImageElement).src)

const openStall = (property: MapProperty, event: MouseEvent) => {
  if (!selectStall(property)) return
  stallTrigger = event.currentTarget as HTMLElement
  photoIndex.value = 0
}
const restoreStallFocus = (event: Event) => {
  if (stallTrigger?.isConnected) {
    event.preventDefault()
    stallTrigger.focus({ preventScroll: true })
  }
}
const afterStallLeave = () => {
  if (!stallOpen.value) { clearStall(); photoIndex.value = 0; stallTrigger = null }
}
watch(galleryPhotos, photos => { if (photoIndex.value >= photos.length) photoIndex.value = 0 })
watch(propertiesData, () => failedPhotos.clear())

const propertyBadgeColor = (property: MapProperty) => (property.space_status === 'Vacant' ? 'success' : property.space_status === 'Occupied' ? 'error' : 'neutral')

const mapContainer = ref<HTMLElement | null>(null)
const headingPanel = ref<HTMLElement | null>(null)
const toolbarPanel = ref<HTMLElement | null>(null)
const detailsPanel = ref<HTMLElement | null>(null)
const legendPanel = ref<HTMLElement | null>(null)
const labelingPanel = ref<HTMLElement | null>(null)
const dataStatusPanel = ref<HTMLElement | null>(null)
const isFullscreen = ref(false)
const viewport = ref({ width: 1280, height: 800 })
const campusAspect = ref(1)
let viewportObserver: ResizeObserver | null = null
let searchCloseTimer: ReturnType<typeof setTimeout> | null = null
const viewInsets = ref({ top: 176, right: 16, bottom: 136, left: 16 })
const panels = computed(() => [headingPanel.value, toolbarPanel.value, detailsPanel.value, legendPanel.value, labelingPanel.value, dataStatusPanel.value].filter((panel): panel is HTMLElement => !!panel))
const measurePanels = () => {
  const map = mapContainer.value
  if (!map) return
  const bounds = map.getBoundingClientRect()
  viewport.value = { width: bounds.width, height: bounds.height }
  const measured = unobscuredMapInsets(bounds.width, bounds.height, panels.value.map(panel => {
    const rect = panel.getBoundingClientRect()
    return { left: rect.left - bounds.left, right: rect.right - bounds.left, top: rect.top - bounds.top, bottom: rect.bottom - bounds.top }
  }), campusAspect.value)
  if (Object.keys(measured).some(key => measured[key as keyof typeof measured] !== viewInsets.value[key as keyof typeof measured])) viewInsets.value = measured
}
watch(campusAspect, measurePanels)
watch(panels, (current, previous) => {
  for (const panel of previous ?? []) viewportObserver?.unobserve(panel)
  for (const panel of current) viewportObserver?.observe(panel)
  measurePanels()
}, { flush: 'post' })

const toggleFullscreen = async () => {
  if (!import.meta.client) return
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen()
    } else {
      await mapContainer.value?.requestFullscreen()
    }
  } catch {
    // Fullscreen can be rejected by the browser; nothing to recover from here.
  }
}

const syncFullscreen = () => {
  isFullscreen.value = document.fullscreenElement === mapContainer.value
}

onMounted(() => {
  document.addEventListener('fullscreenchange', syncFullscreen)
  viewportObserver = new ResizeObserver(measurePanels)
  if (mapContainer.value) viewportObserver.observe(mapContainer.value)
  for (const panel of panels.value) viewportObserver.observe(panel)
  measurePanels()
})
onBeforeUnmount(() => {
  document.removeEventListener('fullscreenchange', syncFullscreen)
  viewportObserver?.disconnect()
  if (searchCloseTimer) clearTimeout(searchCloseTimer)
})
</script>

<template>

  <div
    id="campus-map-root"
    ref="mapContainer"
    class="campus-map-page imapsu-page-bg relative overflow-hidden"
    :class="isFullscreen ? 'h-dvh w-screen' : 'h-full'"
  >
    <ClientOnly>
      <CampusMapViewer
        ref="viewer"
        class="z-0"
        :auto-buildings="true"
        :status-by-order="statusByOrder"
        :labels="labels"
        :active-zone-id="selected ? normalizeBuildingName(selected.name) : null"
        :active-building-order="selected?.buildingOrder ?? null"
        :view-insets="viewInsets"
        @campus-aspect="campusAspect = $event"
        :occupied-label="auth.isStudent.value ? 'Occupied space listed' : 'Occupied'"
        :show-names="showNames"
        @select="selectZone"
        @model-error="onModelError"
        @buildings-ready="onBuildingsReady"
      />

      <template #fallback>
        <div class="grid h-full w-full place-items-center text-muted">

          <span>Loading 3D viewer…</span>
        </div>
      </template>
    </ClientOnly>

    <div v-if="!modelReady && !modelError" class="map-loading absolute inset-0 grid place-items-center" role="status" aria-live="polite">
      <div class="map-surface flex items-center gap-3 px-5 py-4">
        <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin text-primary motion-reduce:animate-none" />
        <span class="text-sm font-medium">Loading campus model…</span>
      </div>
    </div>

    <div
      v-if="modelError"
      class="absolute inset-0 z-10 grid place-items-center bg-(--ui-bg) p-8 text-center"
    >
      <div>
        <UIcon name="i-lucide-triangle-alert" class="mx-auto mb-3 size-10 text-warning" />
        <p class="font-medium">{{ modelError }}</p>
        <p class="mt-1 text-sm text-muted">Reload the page to try again.</p>
      </div>
    </div>

    <div ref="headingPanel" class="map-heading pointer-events-none absolute z-10">
      <div class="map-surface pointer-events-auto p-3.5">
        <p class="map-eyebrow">Interactive Campus Map</p>
        <h1 class="mt-0.5 text-xl font-semibold tracking-tight text-highlighted">Pampanga State University — Main Campus</h1>

    <details v-if="auth.isOas.value && modelReady" class="mt-3 rounded-md border border-default p-2 text-xs">
      <summary class="cursor-pointer font-medium">Map data diagnostics</summary>
      <p class="mt-2">Unresolved building names: {{ bindingDiagnostics.unresolved.join(', ') || 'None' }}</p>
      <p>Ambiguous associations: {{ bindingDiagnostics.ambiguous.join(', ') || 'None' }}</p>
      <p>Directory entries without a model: {{ bindingDiagnostics.directoryOnly.join(', ') || 'None' }}</p>
      <p>Model orders without a directory entry: {{ bindingDiagnostics.modelOnly.join(', ') || 'None' }}</p>
      <p class="mt-2 text-muted">Review campus identifiers before changing associations.</p>
    </details>
        <div class="relative mt-3">
          <UInput
            v-model="searchQuery"
            icon="i-lucide-search"
            placeholder="Search buildings or businesses..."
            :disabled="!modelReady"
            aria-label="Search campus buildings or businesses"
            class="w-full"
            autocomplete="off"
            @focus="searchOpen = true"
            @blur="closeSearch"
          />
          <div
            v-if="searchOpen && searchResults.length"
            class="absolute left-0 right-0 z-20 mt-1 max-h-64 overflow-auto rounded-lg border border-(--ui-border) bg-(--ui-bg) shadow-lg"
          >
            <button
              v-for="result in searchResults"
              :key="result.order"
              type="button"
              class="block w-full px-3 py-2 text-left text-sm hover:bg-(--ui-bg-elevated)"
              :disabled="!availableBuildingOrders.has(result.order)"
              @click="jumpTo(result.order)"
            >
              <span class="block truncate font-medium">{{ result.name }}</span>
              <span v-if="result.match" class="block truncate text-xs text-primary">{{ result.match }}</span>
              <span v-if="!availableBuildingOrders.has(result.order)" class="block text-xs text-muted">Not linked to a building in this model</span>
            </button>
          </div>
          <p v-else-if="searchOpen && searchQuery.trim().length >= 2" class="mt-1 text-xs text-muted">
            No buildings or businesses match “{{ searchQuery }}”.
          </p>
        </div>

        <p class="map-instructions mt-2 flex items-center gap-1.5 text-[11px] text-muted">
          <UIcon name="i-lucide-mouse-pointer-click" class="size-3.5" />
          <span>Drag to rotate · Scroll to zoom · Select a building</span>
        </p>
      </div>
    </div>

    <div
      v-if="labelMode && auth.isOas.value"
      ref="labelingPanel"
      class="map-labeling map-surface absolute z-10 flex items-center gap-2 px-3 py-2 text-xs"
    >
      <UIcon name="i-lucide-pencil" class="size-4 text-primary" />
      <span class="font-medium">Labeling mode · Select a building</span>
      <UButton size="xs" color="neutral" variant="ghost" label="Done" @click="labelMode = false" />
    </div>

    <div ref="toolbarPanel" class="map-toolbar map-surface absolute z-10 flex items-center justify-end gap-1 p-1.5">
      <UButton
        v-if="auth.isOas.value"
        size="sm"
        :color="labelMode ? 'primary' : 'neutral'"
        variant="solid"
        icon="i-lucide-pencil"
        :label="viewport.width < 1100 ? undefined : labelMode ? 'Stop labeling' : 'Label buildings'"
        :aria-label="labelMode ? 'Stop labeling' : 'Label buildings'"
        :title="labelMode ? 'Stop labeling' : 'Label buildings'"
        :disabled="!modelReady"
        @click="labelMode = !labelMode"
      />
      <UButton
        size="sm"
        variant="solid"
        color="neutral"
        icon="i-lucide-tag"
        :label="viewport.width < 1100 ? undefined : showNames ? 'Hide Labels' : 'Show Labels'"
        :aria-label="showNames ? 'Hide Labels' : 'Show Labels'"
        :title="showNames ? 'Hide Labels' : 'Show Labels'"
        :disabled="!modelReady"
        @click="showNames = !showNames"
      />
      <UButton
        v-if="PAMSU_BUILDINGS.length"
        size="sm"
        variant="solid"
        color="neutral"
        icon="i-lucide-rotate-ccw"
        :label="viewport.width < 1100 ? undefined : 'Reset View'"
        aria-label="Reset View"
        title="Reset View"
        :disabled="!modelReady"
        @click="viewer?.resetCamera()"
      />
      <UButton
        size="sm"
        :color="isFullscreen ? 'primary' : 'neutral'"
        variant="solid"
        :icon="isFullscreen ? 'i-lucide-minimize' : 'i-lucide-maximize'"
        :label="viewport.width < 1100 ? undefined : isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'"
        :aria-label="isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'"
        :title="isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'"
        @click="toggleFullscreen"
      />
    </div>

    <div
      v-if="selected"
      ref="detailsPanel"
      class="map-details map-surface absolute z-10 flex flex-col overflow-hidden"
    ><AppMotionReveal :key="selected?.buildingOrder ?? selected?.name" panel class="flex min-h-0 flex-1 flex-col">
      <div class="flex shrink-0 items-start justify-between gap-3 p-4">
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <span
              class="size-3 shrink-0 rounded-full"
              :style="{ backgroundColor: selectedColor }"
            />
            <h3 class="break-words text-base font-semibold">{{ selected ? displayName(selected) : '' }}</h3>
          </div>
          <p class="mt-1 text-xs font-medium text-toned">{{ status === 'success' ? `${buildingProperties.length} ${buildingProperties.length === 1 ? 'rentable space listed' : 'rentable spaces listed'}` : status === 'error' ? 'Rental-space information unavailable' : 'Loading rentable spaces…' }}</p>
        </div>
        <div class="flex shrink-0 items-center gap-1">
          <UButton
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            size="sm"
            aria-label="Close"
            @click="closePanel"
          />
        </div>
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        <template v-if="buildingProperties.length">
          <div class="space-y-2">
            <p class="mb-3 text-xs text-muted">{{ labelMode ? 'Select a building to edit its map label.' : 'Choose a rentable space to view photos and details.' }}</p>
            <button
              v-for="property in buildingProperties"
              :key="stallKey(property)"
              type="button"
              class="map-stall-card"
              :class="{ 'is-active': selectedStallKey === stallKey(property) }"
              :disabled="labelMode"
              :aria-label="`View ${stallTitle(property)} (${property.propertyCode})`"
              aria-haspopup="dialog"
              @click="openStall(property, $event)"
            >
              <span class="map-stall-thumbnail">
                <img
                  v-if="propertyPhotos(property)[0] && !failedPhotos.has(propertyPhotos(property)[0]!.url)"
                  :src="propertyPhotos(property)[0]!.url"
                  :alt="`${stallTitle(property)} photo`"
                  loading="lazy"
                  @error="markPhotoFailed"
                />
                <span v-else class="map-photo-placeholder"><UIcon name="i-lucide-image" class="size-5" /><span>Photo unavailable</span></span>
              </span>
              <span class="min-w-0 space-y-1.5">
                <span class="block line-clamp-2 text-sm font-semibold leading-snug text-highlighted">{{ stallTitle(property) }}</span>
                <span class="block truncate text-[11px] text-muted">{{ property.propertyCode }}<template v-if="property.floor"> · {{ property.floor }}</template></span>
                <UBadge size="sm" variant="subtle" :color="propertyBadgeColor(property)">{{ mapPropertyStatus(property.space_status) ?? 'Status unavailable' }}</UBadge>
              </span>
              <UIcon name="i-lucide-chevron-right" class="size-4 text-muted" />
            </button>
          </div>
        </template>
        <p v-else-if="status === 'error'" class="text-sm text-muted">Property information is unavailable. Use Retry to reload it.</p>
        <p v-else-if="status === 'pending'" class="text-sm text-muted">Loading property information…</p>
        <p v-else class="text-sm text-muted">
          No rentable spaces are currently listed for this building.
        </p>
      </div>

    </AppMotionReveal></div>

    <UModal
      v-model:open="stallOpen"
      :title="selectedStall ? stallTitle(selectedStall) : 'Rental-space details'"
      :description="selected ? displayName(selected) : 'Campus rental space'"
      portal="#campus-map-root"
      :content="{ onCloseAutoFocus: restoreStallFocus }"
      :ui="{ overlay: 'absolute z-40 bg-black/45 backdrop-blur-[2px]', content: 'absolute z-50 w-[calc(100%-2rem)] max-w-[800px] max-h-[calc(100%-2rem)] sm:max-h-[calc(100%-2rem)] rounded-xl', wrapper: 'min-w-0 pr-8', title: 'break-words', body: 'min-h-0 overflow-y-auto p-4 sm:p-6', footer: 'justify-between gap-3' }"
      @after:leave="afterStallLeave"
    >
      <template #body>
        <div v-if="selectedStall" class="space-y-5">
          <div class="space-y-3">
            <div class="map-stall-gallery">
              <img v-if="activePhoto && !failedPhotos.has(activePhoto.url)" :key="activePhoto.url" :src="activePhoto.url" :alt="`${stallTitle(selectedStall)} — photo ${photoIndex + 1}`" @error="markPhotoFailed" />
              <div v-else class="map-photo-placeholder"><UIcon name="i-lucide-image" class="size-9" /><span>Photo unavailable</span></div>
            </div>
            <div v-if="galleryPhotos.length" class="flex items-center justify-between gap-3 text-xs text-muted">
              <span>{{ galleryPhotos.length === 1 ? 'Stall photo' : 'Stall photos' }}</span>
              <span aria-live="polite">Photo {{ photoIndex + 1 }} of {{ galleryPhotos.length }}</span>
            </div>
            <div v-if="galleryPhotos.length > 1" class="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Choose a stall photo">
              <button v-for="(photo, index) in galleryPhotos" :key="`${photo.id}:${photo.url}`" type="button" class="map-gallery-thumbnail" :class="{ 'is-active': photoIndex === index }" :aria-label="`Show photo ${index + 1}`" :aria-pressed="photoIndex === index" @click="photoIndex = index">
                <img v-if="!failedPhotos.has(photo.url)" :src="photo.url" alt="" @error="markPhotoFailed" />
                <UIcon v-else name="i-lucide-image" class="size-5 text-muted" />
              </button>
            </div>
          </div>
          <div class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-(--ui-border)/70 bg-(--ui-bg-elevated)/50 p-3.5">
            <dl class="flex flex-wrap gap-x-6 gap-y-3 text-sm">
              <div><dt class="text-xs text-muted">Space code</dt><dd class="mt-1 font-semibold">{{ selectedStall.propertyCode }}</dd></div>
              <div v-if="selectedStall.floor"><dt class="text-xs text-muted">Floor</dt><dd class="mt-1 font-medium">{{ selectedStall.floor }}</dd></div>
            </dl>
            <UBadge variant="subtle" :color="propertyBadgeColor(selectedStall)">{{ mapPropertyStatus(selectedStall.space_status) ?? 'Status unavailable' }}</UBadge>
          </div>
          <p v-if="selectedStall.name && selectedStall.name !== stallTitle(selectedStall)" class="text-sm text-toned">{{ selectedStall.name }}</p>
          <template v-if="selectedStall.space_status === 'Occupied'">
            <div v-if="selectedStall.productsServices"><h4 class="text-sm font-semibold">Products / services</h4><p class="mt-1 whitespace-pre-line text-sm leading-relaxed text-toned">{{ selectedStall.productsServices }}</p></div>
            <div v-if="selectedStall.operatingDetails"><h4 class="text-sm font-semibold">Operating details</h4><p class="mt-1 whitespace-pre-line text-sm leading-relaxed text-toned">{{ selectedStall.operatingDetails }}</p></div>
          </template>
          <p v-else-if="selectedStall.space_status === 'Vacant'" class="text-sm text-muted">This space is currently vacant.</p>
        </div>
      </template>
      <template #footer>
        <UButton color="neutral" variant="ghost" label="Back to spaces" icon="i-lucide-arrow-left" @click="stallOpen = false" />
        <UButton :to="auth.isAuthenticated.value ? '/properties' : '/login'" size="sm" icon="i-lucide-store" label="View property listing" />
      </template>
    </UModal>

    <div
      ref="legendPanel"
      class="map-legend map-surface absolute z-10 px-3.5 py-3 text-xs text-muted"
    >
      <p>
        {{ modelReady ? `${buildingCount} modeled buildings` : 'Campus overview' }}
      </p>
      <div class="mt-2 space-y-1">
        <span v-if="!auth.isStudent.value" class="flex items-center gap-1.5">
          <span class="size-2.5 rounded-full" :style="{ backgroundColor: MAP_STATUS_COLORS.vacant }" />
          Vacant space available
        </span>
        <span class="flex items-center gap-1.5">
          <span class="size-2.5 rounded-full" :style="{ backgroundColor: MAP_STATUS_COLORS.occupied }" />
          {{ auth.isStudent.value ? 'Occupied spaces listed' : 'Fully occupied' }}
        </span>
      </div>
      <p class="map-legend-note mt-2 text-[10px] text-muted">Building colors show listed property status.</p>
    </div>

    <div v-if="status === 'pending' || status === 'error' || labelsStatus === 'pending' || labelsStatus === 'error'" ref="dataStatusPanel" class="map-data-status map-surface absolute z-10 px-3 py-2 text-xs" role="status" aria-live="polite">
      <div v-if="status === 'error' || labelsStatus === 'error'" class="flex items-center gap-2">
        <UIcon name="i-lucide-triangle-alert" class="size-4 shrink-0 text-warning" />
        <span>{{ status === 'error' ? 'Property status is unavailable.' : 'Custom building labels are unavailable.' }}</span>
        <UButton size="xs" color="neutral" variant="ghost" label="Retry" @click="refreshProperties(); refreshLabels()" />
      </div>
      <span v-else>Loading {{ status === 'pending' ? 'property status' : 'building labels' }}…</span>
    </div>

    <UModal v-model:open="labelOpen" title="Name this building" :description="labelingZone ? `Set the name shown on the map for ${labelingZone.name}.` : ''">
      <template #body>
        <form class="space-y-5" @submit.prevent="saveLabel">
          <UFormField label="Building name" name="label" required>
            <UInput required v-model="labelDraft" placeholder="e.g. Main Library" :disabled="savingLabel" />
            <p class="mt-1 text-xs text-muted">This overrides the temporary model name and shows on the map for everyone.</p>
          </UFormField>

          <UAlert v-if="labelError" color="error" icon="i-lucide-triangle-alert" :description="labelError" />

          <div class="flex items-center justify-between gap-2">
            <UButton
              v-if="labelingZone && labels[normalizeBuildingName(labelingZone.name)]"
              label="Reset name"
              color="error"
              variant="ghost"
              icon="i-lucide-eraser"
              :loading="savingLabel"
              @click="removeLabel"
            />
            <span v-else />
            <div class="flex items-center gap-2">
              <UButton label="Cancel" color="neutral" variant="ghost" :disabled="savingLabel" @click="labelOpen = false" />
              <UButton type="submit" :loading="savingLabel">Save name</UButton>
            </div>
          </div>
        </form>
      </template>
    </UModal>
  </div>
</template>

<style scoped>
.map-surface {
  border: 1px solid color-mix(in srgb, var(--ui-border) 85%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--ui-bg) 94%, transparent);
  box-shadow: 0 4px 16px rgb(22 20 18 / 8%);
  backdrop-filter: blur(12px);
}
.map-details { background: var(--ui-bg); backdrop-filter: none; }
.map-heading { left: 16px; top: 16px; width: 340px; }
.map-eyebrow {
  color: var(--ui-primary);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}
.map-toolbar { right: 16px; top: 16px; }
.map-toolbar :deep(button) { min-height: 40px; min-width: 40px; border-radius: 8px; }
.map-labeling { top: 80px; right: 16px; }
.map-details { left: 16px; bottom: 16px; width: 352px; max-height: min(32rem, calc(100% - 180px)); }
.map-legend { right: 16px; bottom: 16px; }
.map-data-status { right: 16px; bottom: 128px; max-width: 340px; }
.map-loading { pointer-events: none; }
.map-stall-card {
  display: grid;
  grid-template-columns: 76px minmax(0, 1fr) 16px;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 10px;
  text-align: left;
  border: 1px solid var(--ui-border);
  border-radius: 14px;
  background: var(--ui-bg);
  transition: border-color 160ms, background-color 160ms;
}
.map-stall-card:not(:disabled):hover { border-color: var(--ui-primary); background: var(--ui-bg-elevated); }
.map-stall-card.is-active { border-color: var(--color-gold-500); }
.map-stall-card:focus-visible, .map-gallery-thumbnail:focus-visible { outline: 2px solid var(--color-gold-500); outline-offset: 3px; }
.map-stall-card:disabled { opacity: 0.6; }
.map-stall-thumbnail { display: block; height: 84px; overflow: hidden; border-radius: 9px; background: var(--ui-bg-elevated); }
.map-stall-thumbnail img { width: 100%; height: 100%; object-fit: cover; }
.map-photo-placeholder { display: flex; height: 100%; min-height: inherit; flex-direction: column; align-items: center; justify-content: center; gap: 6px; padding: 8px; text-align: center; font-size: 10px; line-height: 1.3; color: var(--ui-text-muted); }
.map-stall-gallery { height: clamp(200px, 35dvh, 340px); overflow: hidden; border: 1px solid var(--ui-border); border-radius: 14px; background: var(--ui-bg-elevated); }
.map-stall-gallery img { width: 100%; height: 100%; object-fit: contain; }
.map-stall-gallery .map-photo-placeholder { font-size: 13px; }
.map-gallery-thumbnail { display: grid; place-items: center; flex-shrink: 0; width: 72px; height: 56px; overflow: hidden; border: 2px solid transparent; border-radius: 9px; background: var(--ui-bg-elevated); }
.map-gallery-thumbnail img { height: 100%; width: 100%; object-fit: cover; }
.map-gallery-thumbnail.is-active { border-color: var(--color-gold-500); }
@media (prefers-reduced-motion: reduce) { .map-stall-card { transition: none; } }
.map-heading button:disabled { opacity: 0.55; cursor: default; }
@media (max-width: 767px) {
  .map-heading { left: 12px; top: 12px; width: auto; right: 12px; }
  .map-heading .map-surface { padding: 12px; }
  .map-heading h1 { font-size: 18px; }
  .map-heading :deep(.mt-3) { margin-top: 8px; }
  .map-instructions { display: none; }
  .map-toolbar { top: 158px; left: 12px; right: auto; }
  .map-labeling { top: 214px; left: 12px; right: auto; max-width: calc(100% - 24px); }
  .map-details { left: 12px; right: 12px; bottom: 76px; width: auto; max-height: min(44%, 352px); border-radius: 12px; }
  .map-legend { left: 12px; right: 12px; bottom: 12px; padding: 9px 12px; display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 10px; }
  .map-legend > div { margin-top: 0; display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 4px 12px; }
  .map-legend > div > span { margin-top: 0; }
  .map-legend-note { display: none; }
  .map-data-status { top: 160px; left: 196px; right: 12px; bottom: auto; max-width: none; padding: 6px 9px; border-radius: 12px; font-size: 10px; }
  .map-data-status > div { flex-wrap: wrap; gap: 4px; }
}
</style>
