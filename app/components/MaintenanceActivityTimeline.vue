<script setup lang="ts">
import { activityIcon, activityTitle, formatTicketDateTime, type MaintenanceActivity } from '~/utils/maintenance'

// Read-only service history of one maintenance ticket, oldest first.
const props = defineProps<{
  ticketId: string
  reporterId?: number | null
  // Bumped by the parent after it changes the ticket, to load the new entries.
  reloadKey?: number
  size?: 'xs' | 'sm' | 'md'
}>()

const { $api, getErrorMessage } = useStrapi()

const entries = ref<MaintenanceActivity[]>([])
const loading = ref(false)
const loadError = ref('')
let sequence = 0

const load = async () => {
  const id = ++sequence
  loading.value = entries.value.length === 0
  loadError.value = ''
  try {
    const result = await $api<{ data: MaintenanceActivity[] }>(`/api/maintenance-tickets/${props.ticketId}/activity`)
    if (id === sequence) entries.value = result.data ?? []
  } catch (err) {
    if (id === sequence) loadError.value = getErrorMessage(err)
  } finally {
    if (id === sequence) loading.value = false
  }
}

watch(() => props.ticketId, () => { entries.value = []; load() }, { immediate: true })
watch(() => props.reloadKey, () => load())

const items = computed(() => entries.value.map((entry, index) => ({
  value: index,
  date: formatTicketDateTime(entry.createdAt),
  title: activityTitle(entry, props.reporterId),
  description: entry.note ?? undefined,
  icon: activityIcon(entry)
})))
</script>

<template>
  <div>
    <div v-if="loading" class="space-y-3" aria-label="Loading ticket history">
      <USkeleton v-for="index in 3" :key="index" class="h-10 rounded-lg" />
    </div>
    <UAlert v-else-if="loadError" color="error" variant="subtle" icon="i-lucide-triangle-alert" :description="loadError">
      <template #actions><UButton label="Retry" size="xs" color="neutral" variant="outline" @click="load" /></template>
    </UAlert>
    <p v-else-if="items.length === 0" class="text-sm text-muted">No activity recorded yet.</p>
    <UTimeline v-else :items="items" :default-value="items.length - 1" :size="size ?? 'xs'" :ui="{ description: 'whitespace-pre-line leading-relaxed' }" />
  </div>
</template>
