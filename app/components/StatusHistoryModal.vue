<script setup lang="ts">
import type { StatusHistoryEntityType } from '~/composables/useStatusHistory'

const props = defineProps<{
  entityType: StatusHistoryEntityType
  entityId: string
  entityLabel?: string
}>()

const emit = defineEmits<{ viewReceipt: [receipt: { url: string; name?: string | null }] }>()

const open = defineModel<boolean>('open')

const { entries, loading, loadError, load } = useStatusHistory(() => props.entityType, () => props.entityId)

// Pages mount this modal already open, so load on mount as well as on reopen.
watch([open, () => props.entityId], ([isOpen]) => {
  if (isOpen) load()
}, { immediate: true })
</script>

<template>
  <UModal v-model:open="open" title="Status history" :description="entityLabel ?? 'Recorded status changes.'">
    <template #body>
      <StatusHistoryList :entries="entries" :loading="loading" :error="loadError" @view-receipt="receipt => emit('viewReceipt', receipt)" />
    </template>
  </UModal>
</template>
