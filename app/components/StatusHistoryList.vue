<script setup lang="ts">
import { formatHistoryDateTime, type StatusHistoryEntry } from '~/composables/useStatusHistory'

defineProps<{
  entries: StatusHistoryEntry[]
  loading?: boolean
  error?: string
}>()
</script>

<template>
  <div v-if="loading" class="space-y-3">
    <USkeleton v-for="index in 3" :key="index" class="h-12 rounded-lg" />
  </div>

  <UAlert v-else-if="error" color="error" icon="i-lucide-triangle-alert" :description="error" />

  <div v-else-if="entries.length === 0" class="rounded-lg border border-dashed border-default px-4 py-8 text-center text-sm text-muted">
    No status changes recorded yet.
  </div>

  <ol v-else class="relative space-y-4">
    <li v-for="entry in entries" :key="entry.id" class="flex items-start gap-3">
      <span class="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
      <div class="min-w-0 flex-1">
        <p class="text-sm text-highlighted">
          <span v-if="entry.fromStatus" class="font-medium">{{ entry.fromStatus }}</span>
          <UIcon v-if="entry.fromStatus" name="i-lucide-arrow-right" class="mx-1 size-3.5 align-[-2px] text-muted" />
          <span class="font-semibold">{{ entry.toStatus }}</span>
        </p>
        <p class="mt-0.5 text-xs text-muted">
          {{ formatHistoryDateTime(entry.changedAt) }}
          <template v-if="entry.changedBy?.username"> · {{ entry.changedBy.username }}</template>
        </p>
      </div>
    </li>
  </ol>
</template>
