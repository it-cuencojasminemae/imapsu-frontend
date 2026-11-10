<script setup lang="ts">
// Full-size view of an uploaded receipt, centered over the page instead of
// opening the raw file in a new tab.
type ReceiptFile = { url: string; name?: string | null }

defineProps<{ receipt: ReceiptFile | null; title?: string }>()
const open = defineModel<boolean>('open', { default: false })

const { baseURL } = useStrapi()
</script>

<template>
  <UModal v-model:open="open" :title="title || 'Receipt'" :description="receipt?.name || 'Payment receipt'" class="max-w-5xl">
    <template #body>
      <div v-if="receipt" class="flex flex-col items-center gap-3">
        <div class="flex w-full items-center justify-center rounded-lg bg-elevated/50 p-2">
          <img :src="`${baseURL}${receipt.url}`" :alt="receipt.name || 'Payment receipt'" class="mx-auto block max-h-[calc(100dvh-16rem)] w-auto max-w-full rounded-md object-contain" />
        </div>
        <UButton :to="`${baseURL}${receipt.url}`" target="_blank" icon="i-lucide-external-link" label="Open original" color="neutral" variant="ghost" size="sm" />
      </div>
    </template>
  </UModal>
</template>
