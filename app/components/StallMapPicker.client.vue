<script setup lang="ts">
import type { MapPin, MapPointPick, MapPosition } from '~/types/map'
import { pamsuBuildingFor } from '~/utils/pamsu'

// Lets the OAS click a spot on the 3D campus map to place a stall. Nothing is
// applied until "Use this location"; the picked building (if the click landed
// on one) is reported so the form's Building field can follow the pin.
const props = defineProps<{
  modelValue: MapPosition | null
  building?: string
  stallName?: string
  otherPins?: MapPin[]
}>()

const emit = defineEmits<{
  'update:modelValue': [position: MapPosition | null]
  'building-picked': [name: string]
}>()

const open = defineModel<boolean>('open', { default: false })

const viewer = ref<{ focusBuilding: (order: number) => void } | null>(null)
const draft = ref<MapPointPick | null>(null)
// True while the draft is still the saved pin, before any new click.
const fromSaved = ref(false)
const modelReady = ref(false)

watch(open, (isOpen) => {
  if (!isOpen) return
  modelReady.value = false
  const current = props.modelValue
  draft.value = current ? { ...current, buildingOrder: null, buildingName: null } : null
  fromSaved.value = !!current
})

const onPick = (pick: MapPointPick) => {
  draft.value = pick
  fromSaved.value = false
}

const focusOrder = computed(() => draft.value?.buildingOrder ?? (props.building ? pamsuBuildingFor(props.building)?.order ?? null : null))

const onReady = () => {
  modelReady.value = true
  if (focusOrder.value != null) viewer.value?.focusBuilding(focusOrder.value)
}

const pins = computed<MapPin[]>(() => [
  ...(props.otherPins ?? []).map(pin => ({ ...pin, muted: true })),
  ...(draft.value ? [{ id: 'draft', x: draft.value.x, y: draft.value.y, z: draft.value.z, label: props.stallName || 'This stall' }] : [])
])

const placement = computed(() => {
  if (!draft.value) return props.modelValue ? 'The pin will be removed from the map.' : 'Click anywhere on the map to drop the pin.'
  if (fromSaved.value) return 'Current pin location. Click elsewhere to move it.'
  if (draft.value.buildingName) return `${draft.value.onBuilding === false ? 'Near' : 'On'} ${draft.value.buildingName}`
  return 'Outdoors / open area'
})

const confirm = () => {
  const pick = draft.value
  emit('update:modelValue', pick ? { x: pick.x, y: pick.y, z: pick.z } : null)
  if (pick?.buildingName) emit('building-picked', pick.buildingName)
  open.value = false
}
</script>

<template>
  <UModal v-model:open="open" class="max-w-5xl" title="Pick stall location" description="Click the spot on the campus map where this stall is. Drag to pan, scroll to zoom.">
    <template #body>
      <div class="relative h-[60vh] min-h-80 overflow-hidden rounded-lg border border-default">
        <CampusMapViewer
          ref="viewer"
          :auto-buildings="true"
          :show-names="true"
          :pick-point="true"
          :pins="pins"
          active-pin-id="draft"
          :active-building-order="draft?.buildingOrder ?? null"
          @point-picked="onPick"
          @buildings-ready="onReady"
        />
        <div v-if="!modelReady" class="absolute inset-0 grid place-items-center bg-default/70 text-sm text-muted" role="status">
          Loading campus map…
        </div>
      </div>
      <p class="mt-3 flex items-center gap-1.5 text-sm" :class="draft ? 'text-highlighted' : 'text-muted'">
        <UIcon :name="draft ? 'i-lucide-map-pin' : 'i-lucide-mouse-pointer-click'" class="size-4 shrink-0" />
        {{ placement }}
      </p>
    </template>
    <template #footer>
      <div class="flex w-full flex-wrap items-center justify-between gap-2">
        <UButton v-if="draft" label="Clear pin" color="neutral" variant="ghost" icon="i-lucide-eraser" @click="draft = null" />
        <span v-else />
        <div class="flex gap-2">
          <UButton label="Cancel" color="neutral" variant="outline" @click="open = false" />
          <UButton :label="draft ? 'Use this location' : 'Remove pin'" icon="i-lucide-check" :disabled="!draft && !modelValue" @click="confirm" />
        </div>
      </div>
    </template>
  </UModal>
</template>
