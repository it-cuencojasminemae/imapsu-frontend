<script setup lang="ts">
import type { MaintenancePhoto } from '~/utils/maintenance'

// Full-size view of a ticket's photos, stepping through them with the
// buttons or the arrow keys.
const props = defineProps<{ photos: MaintenancePhoto[] }>()
const open = defineModel<boolean>('open', { default: false })
const index = defineModel<number>('index', { default: 0 })

const { baseURL } = useStrapi()
const current = computed(() => props.photos[index.value] ?? null)
const step = (delta: number) => {
  if (props.photos.length < 2) return
  index.value = (index.value + delta + props.photos.length) % props.photos.length
}
const onKey = (event: KeyboardEvent) => {
  if (event.key === 'ArrowRight') step(1)
  if (event.key === 'ArrowLeft') step(-1)
}
watch(open, isOpen => {
  if (!import.meta.client) return
  if (isOpen) window.addEventListener('keydown', onKey)
  else window.removeEventListener('keydown', onKey)
})
onBeforeUnmount(() => { if (import.meta.client) window.removeEventListener('keydown', onKey) })
</script>

<template>
  <UModal v-model:open="open" title="Photo" :description="photos.length > 1 ? `${index + 1} of ${photos.length}` : 'Submitted by the tenant'" class="max-w-4xl">
    <template #body>
      <div v-if="current" class="flex flex-col items-center gap-3">
        <img :src="`${baseURL}${current.url}`" :alt="current.name || 'Ticket photo'" class="max-h-[70vh] w-auto rounded-lg object-contain" />
        <div class="flex w-full items-center justify-between gap-2">
          <UButton v-if="photos.length > 1" icon="i-lucide-chevron-left" label="Previous" color="neutral" variant="outline" size="sm" @click="step(-1)" />
          <span v-else />
          <UButton :to="`${baseURL}${current.url}`" target="_blank" icon="i-lucide-external-link" label="Open original" color="neutral" variant="ghost" size="sm" />
          <UButton v-if="photos.length > 1" trailing-icon="i-lucide-chevron-right" label="Next" color="neutral" variant="outline" size="sm" @click="step(1)" />
          <span v-else />
        </div>
      </div>
    </template>
  </UModal>
</template>
