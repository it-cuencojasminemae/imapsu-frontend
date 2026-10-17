<script setup lang="ts">
const props = defineProps<{ title: string; endpoint: string; resource: string; to: string; query?: Record<string, string | number | boolean> }>()
const auth = useAuth()
const { $api } = useStrapi()
const key = computed(() => `member-dashboard:${auth.user.value?.id}:${auth.role.value}:${props.resource}`)
const { data: response, status, refresh } = await useAsyncData(key, () => $api<any>(props.endpoint, { query: props.query }))
const { data, hasLoaded, isInitialLoading, isInitialError, isRefreshing } = useRequestPresentation(response, status)
</script>

<template>
  <UCard class="min-w-0 h-full" :ui="{ header: 'flex flex-wrap items-center justify-between gap-2' }">
    <template #header>
      <h2 class="text-base font-semibold text-highlighted">{{ title }}</h2>
      <UButton :to="to" label="View all" trailing-icon="i-lucide-arrow-up-right" color="neutral" variant="ghost" size="sm" :aria-label="`View all ${title.toLowerCase()}`" />
    </template>
    <div v-if="isInitialLoading || (!hasLoaded && !isInitialError)" role="status" aria-live="polite" aria-busy="true">
      <span class="sr-only">Loading {{ title.toLowerCase() }}…</span>
      <USkeleton class="h-24 w-full rounded-lg" />
    </div>
    <UAlert v-else-if="isInitialError" color="error" icon="i-lucide-triangle-alert" :title="`Unable to load ${title.toLowerCase()}`" description="Please try again.">
      <template #actions><UButton label="Retry" color="neutral" variant="outline" @click="refresh()" /></template>
    </UAlert>
    <template v-else-if="hasLoaded">
      <AppRefreshState :refreshing="isRefreshing" :failed="status === 'error'" @retry="refresh()" />
      <slot :data="data" />
    </template>
  </UCard>
</template>
