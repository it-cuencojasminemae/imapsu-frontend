<script setup lang="ts">
import { Cropper, RectangleStencil, type CropperResult, type Coordinates, type Size } from 'vue-advanced-cropper'
import 'vue-advanced-cropper/dist/style.css'

const props = defineProps<{ open: boolean; src: string | null }>()
const emit = defineEmits<{ 'update:open': [value: boolean]; cropped: [blob: Blob] }>()
const cropper = ref<{ getResult: () => CropperResult; refresh: () => void; zoom: (factor: number) => void } | null>(null)
const viewport = ref<HTMLElement | null>(null)
const ready = ref(false)
const busy = ref(false)
const error = ref('')
let observer: ResizeObserver | undefined
let frame = 0

const defaultSize = ({ imageSize }: { imageSize: Size }) => {
  const side = Math.min(imageSize.width, imageSize.height)
  return { width: side, height: side }
}
const defaultPosition = ({ imageSize, coordinates }: { imageSize: Size; coordinates: Coordinates }) => ({
  left: (imageSize.width - coordinates.width) / 2,
  top: (imageSize.height - coordinates.height) / 2
})
const refresh = () => {
  cancelAnimationFrame(frame)
  frame = requestAnimationFrame(() => {
    if (props.open && viewport.value?.clientWidth) cropper.value?.refresh()
  })
}
watch(() => props.src, () => { ready.value = false; error.value = '' })
watch(viewport, element => {
  observer?.disconnect()
  if (element) {
    observer = new ResizeObserver(refresh)
    observer.observe(element)
  }
}, { flush: 'post' })
const onReady = () => { ready.value = true; refresh() }
const onError = () => { ready.value = false; error.value = 'This image could not be opened. Choose another photo.' }
const confirmCrop = () => {
  if (!ready.value || busy.value) return
  error.value = ''
  const canvas = cropper.value?.getResult().canvas
  if (!canvas) { error.value = 'Unable to crop this image. Please choose it again.'; return }
  busy.value = true
  try {
    canvas.toBlob(blob => {
      busy.value = false
      if (blob) emit('cropped', blob)
      else error.value = 'Unable to export this crop. Please try again.'
    }, 'image/png')
  } catch {
    busy.value = false
    error.value = 'Unable to export this crop. Please try another image.'
  }
}
onBeforeUnmount(() => { observer?.disconnect(); cancelAnimationFrame(frame) })
</script>

<template>
  <UModal :open="open" :dismissible="!busy" :close="!busy" :ui="{ content: 'max-w-lg', body: 'p-4 sm:p-5', footer: 'p-4 sm:p-5' }" title="Crop your profile photo" description="Drag to frame your photo, then confirm. Your photo is saved as a square image." @after:enter="refresh" @update:open="value => emit('update:open', value)">
    <template #body>
      <div ref="viewport" class="avatar-crop-viewport relative w-full overflow-hidden rounded-xl bg-muted/50" :aria-busy="!ready && !error">
        <Cropper v-if="open && src" :key="src" ref="cropper" :src="src" :stencil-component="RectangleStencil" :stencil-props="{ aspectRatio: 1 }" :default-size="defaultSize" :default-position="defaultPosition" default-boundaries="fill" image-restriction="fit-area" class="h-full w-full" @ready="onReady" @error="onError" />
      </div>
      <p v-if="!ready && !error" class="mt-2 text-center text-sm text-muted" role="status">Loading photo…</p>
      <UAlert v-if="error" class="mt-3" color="error" :description="error" />
      <div class="mt-4 flex items-center justify-center gap-2">
        <UButton square size="sm" color="neutral" variant="outline" icon="i-lucide-zoom-out" aria-label="Zoom out" :disabled="!ready || busy" @click="cropper?.zoom(0.8)" />
        <UButton square size="sm" color="neutral" variant="outline" icon="i-lucide-zoom-in" aria-label="Zoom in" :disabled="!ready || busy" @click="cropper?.zoom(1.25)" />
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton label="Cancel" color="neutral" variant="ghost" :disabled="busy" @click="emit('update:open', false)" />
        <UButton label="Crop & upload" icon="i-lucide-crop" :loading="busy" :disabled="!ready" @click="confirmCrop" />
      </div>
    </template>
  </UModal>
</template>

<style scoped>
.avatar-crop-viewport { height: clamp(12rem, 40dvh, 20rem); }
</style>
