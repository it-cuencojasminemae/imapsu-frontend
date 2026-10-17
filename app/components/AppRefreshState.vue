<script setup lang="ts">
defineProps<{ refreshing: boolean; failed?: boolean }>()
defineEmits<{ retry: [] }>()
</script>

<template>
  <div v-if="refreshing || failed" class="imapsu-refresh-state" role="status" aria-live="polite">
    <UIcon :name="failed ? 'i-lucide-triangle-alert' : 'i-lucide-refresh-cw'" class="size-4 shrink-0" :class="failed ? 'text-warning' : 'text-primary'" />
    <span>{{ failed ? 'Unable to update records. Showing the last successful results.' : 'Updating records…' }}</span>
    <UButton v-if="failed" label="Retry" color="neutral" variant="ghost" size="sm" @click="$emit('retry')" />
  </div>
</template>
