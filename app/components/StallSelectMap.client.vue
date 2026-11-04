<script setup lang="ts">
import type { MapPin, MapProperty } from '~/types/map'
import { pamsuBuildingFor } from '~/utils/pamsu'

// Lets the OAS choose an existing stall by clicking its pin on the campus map.
// Only vacant stalls can be chosen, plus `currentId`: the stall the record being
// edited already holds. Nothing is applied until "Use this stall".
const props = defineProps<{
  modelValue?: string
  stalls: MapProperty[]
  currentId?: string
}>()

const emit = defineEmits<{ 'update:modelValue': [documentId: string] }>()
const open = defineModel<boolean>('open', { default: false })

const viewer = ref<{ focusBuilding: (order: number) => void } | null>(null)
const draftId = ref<string | null>(null)
const modelReady = ref(false)

const selectable = (stall: MapProperty) => stall.space_status === 'Vacant' || stall.documentId === props.currentId
const placed = computed(() => props.stalls.filter(stall => stall.documentId && stall.mapPosition))
const pins = computed<MapPin[]>(() => placed.value.map(stall => ({
  id: stall.documentId as string,
  ...stall.mapPosition!,
  label: stall.name,
  status: stall.space_status,
  muted: !selectable(stall)
})))
const draft = computed(() => placed.value.find(stall => stall.documentId === draftId.value) ?? null)
const buildingOrder = (stall: MapProperty | null) => stall ? pamsuBuildingFor(stall.building)?.order ?? null : null
const choosableCount = computed(() => placed.value.filter(selectable).length)
// Stalls with no pin can't be clicked, so say so rather than leave them missing.
const unplacedVacant = computed(() => props.stalls.filter(stall => stall.space_status === 'Vacant' && !stall.mapPosition).length)

watch(open, (isOpen) => {
  if (!isOpen) return
  modelReady.value = false
  const current = placed.value.find(stall => stall.documentId === props.modelValue)
  draftId.value = current && selectable(current) ? current.documentId as string : null
})

const onPinSelect = (id: string) => {
  draftId.value = id
}

const onReady = () => {
  modelReady.value = true
  const order = buildingOrder(draft.value)
  if (order != null) viewer.value?.focusBuilding(order)
}

const confirm = () => {
  if (!draftId.value) return
  emit('update:modelValue', draftId.value)
  open.value = false
}
</script>

<template>
  <UModal v-model:open="open" class="max-w-5xl" title="Pick stall on map" description="Click a vacant stall's pin to choose it. Occupied stalls are faded and can't be chosen. Drag to pan, scroll to zoom.">
    <template #body>
      <div class="relative h-[60vh] min-h-80 overflow-hidden rounded-lg border border-default">
        <CampusMapViewer
          ref="viewer"
          :auto-buildings="true"
          :show-names="true"
          :pins="pins"
          :active-pin-id="draftId"
          :active-building-order="buildingOrder(draft)"
          @pin-select="onPinSelect"
          @buildings-ready="onReady"
        />
        <div v-if="!modelReady" class="absolute inset-0 grid place-items-center bg-default/70 text-sm text-muted" role="status">
          Loading campus map…
        </div>
      </div>
      <p class="mt-3 flex items-center gap-1.5 text-sm" :class="draft ? 'text-highlighted' : 'text-muted'">
        <UIcon :name="draft ? 'i-lucide-map-pin' : 'i-lucide-mouse-pointer-click'" class="size-4 shrink-0" />
        <template v-if="draft">{{ draft.name }} ({{ draft.propertyCode }}) · {{ draft.building }}</template>
        <template v-else-if="choosableCount">Click a vacant stall's pin to choose it.</template>
        <template v-else>No vacant stalls are placed on the map right now.</template>
      </p>
      <p v-if="unplacedVacant" class="mt-1 text-xs text-muted">
        {{ unplacedVacant }} vacant {{ unplacedVacant === 1 ? 'stall has' : 'stalls have' }} no map pin yet. Search for {{ unplacedVacant === 1 ? 'it' : 'them' }} by name in the form, or place {{ unplacedVacant === 1 ? 'it' : 'them' }} from Rentable spaces.
      </p>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton label="Cancel" color="neutral" variant="outline" @click="open = false" />
        <UButton label="Use this stall" icon="i-lucide-check" :disabled="!draftId" @click="confirm" />
      </div>
    </template>
  </UModal>
</template>
