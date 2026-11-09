<script setup lang="ts">
import type { StatusHistoryEntityType } from '~/composables/useStatusHistory'

const props = defineProps<{
  entityType: StatusHistoryEntityType
  entityId: string
  entityLabel?: string
}>()

const open = defineModel<boolean>('open')

const { entries, loading, loadError, load } = useStatusHistory(() => props.entityType, () => props.entityId)

watch(open, (isOpen) => {
  if (isOpen) load()
})
</script>

<template>
  <UModal v-model:open="open" title="Status history" :description="entityLabel ?? 'Recorded status changes.'">
    <template #body>
      <StatusHistoryList :entries="entries" :loading="loading" :error="loadError" />
    </template>
  </UModal>
</template>
