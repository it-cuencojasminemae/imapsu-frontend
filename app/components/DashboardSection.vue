<script setup lang="ts">
const props = defineProps<{ title: string; endpoint: string; resource: string; to: string; query?: Record<string, string | number | boolean> }>()
const auth = useAuth()
const { $api } = useStrapi()
const key = computed(() => `member-dashboard:${auth.user.value?.id}:${auth.role.value}:${props.resource}`)
const { data: response, status, refresh } = await useAsyncData(key, () => $api<any>(props.endpoint, { query: props.query }), { lazy: true })
const { data, hasLoaded, isInitialLoading, isInitialError, isRefreshing } = useRequestPresentation(response, status)
</script>

<template>
  <UCard class="min-w-0 h-full" :ui="{ header: 'flex flex-wrap items-center justify-between gap-2' }">
    <template #header>
      <h2 class="text-base font-semibold text-highlighted">{{ title }}</h2>
      <UButton :to="to" label="View all" color="neutral" variant="ghost" size="sm" :aria-label="`View all ${title.toLowerCase()}`" />
    </template>
    <div v-if="isInitialLoading || (!hasLoaded && !isInitialError)" role="status" aria-live="polite" aria-busy="true">
      <span class="sr-only">Loading {{ title.toLowerCase() }}…</span>
      <div class="space-y-4" aria-hidden="true">
        <div v-for="row in 3" :key="row" class="flex items-center justify-between gap-4">
          <div class="flex-1 space-y-2"><USkeleton class="h-4" :class="row === 2 ? 'w-1/2' : 'w-2/3'" /><USkeleton class="h-3 w-1/3" /></div>
          <USkeleton class="h-5 w-16 rounded-full" />
        </div>
      </div>
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
