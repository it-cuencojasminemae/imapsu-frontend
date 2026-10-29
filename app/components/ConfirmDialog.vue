<script setup lang="ts">
const { open, options, finish } = useConfirmDialog()

const tones = {
  danger: { icon: 'i-lucide-triangle-alert', badge: 'bg-error/10 text-error ring-error/20', button: 'error' },
  warning: { icon: 'i-lucide-circle-alert', badge: 'bg-warning/10 text-warning ring-warning/20', button: 'warning' },
  primary: { icon: 'i-lucide-circle-help', badge: 'bg-primary/10 text-primary ring-primary/20', button: 'primary' }
} as const

const tone = computed(() => tones[options.value.tone ?? 'danger'])
</script>

<template>
  <UModal
    :open="open"
    :title="options.title"
    :description="options.description || options.title"
    :ui="{ content: 'sm:max-w-md' }"
    @update:open="value => { if (!value) finish(false) }"
  >
    <template #content>
      <div class="p-5 sm:p-6">
        <div class="flex items-start gap-4">
          <div class="flex size-11 shrink-0 items-center justify-center rounded-full ring-1" :class="tone.badge">
            <UIcon :name="options.icon ?? tone.icon" class="size-5" />
          </div>
          <div class="min-w-0 flex-1 pt-0.5" aria-hidden="true">
            <p class="text-base font-semibold text-highlighted">{{ options.title }}</p>
            <p v-if="options.description" class="mt-1.5 whitespace-pre-line text-sm text-muted">{{ options.description }}</p>
          </div>
        </div>
        <div class="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <UButton color="neutral" variant="outline" :label="options.cancelLabel ?? 'Cancel'" class="justify-center" @click="finish(false)" />
          <UButton :color="tone.button" :label="options.confirmLabel ?? 'Confirm'" class="justify-center" @click="finish(true)" />
        </div>
      </div>
    </template>
  </UModal>
</template>
