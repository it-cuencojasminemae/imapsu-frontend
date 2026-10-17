<script setup lang="ts">
import type { MapProperty } from '~/types/map'
import { propertySummary } from '~/utils/homePresentation'
const auth = useAuth()
// Remount only this summary when the signed-in account changes; retained results belong to that account.
const { baseURL, authHeaders } = useStrapi()
const key = computed(() => `home-properties:${auth.user.value?.id ?? 'guest'}`)
const { data: responseData, status, refresh } = useFetch<{ total: number; occupied: number; vacant: number }>('/api/dashboard/property-summary', {
  key, baseURL, headers: authHeaders
})
const { data, hasLoaded, isInitialLoading, isInitialError, isRefreshing } = useRequestPresentation(responseData, status)
const stats = computed(() => [{ label: 'Listed property spaces', value: data.value?.total ?? 0 }, { label: 'Occupied property spaces', value: data.value?.occupied ?? 0 }, ...(!auth.isStudent.value ? [{ label: 'Available property spaces', value: data.value?.vacant ?? 0 }] : [])])
</script>

<template>
<section aria-labelledby="summary-title">
        <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 id="summary-title" class="text-lg font-semibold tracking-tight text-highlighted">Property Overview</h2>
          <UButton label="Refresh overview" icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="status === 'pending'" @click="refresh()" />
        </div>
        <div v-if="isInitialLoading" role="status" aria-live="polite" aria-busy="true">
          <p class="mb-3 text-sm text-muted">Loading property overview…</p>
          <div class="grid gap-3 sm:grid-cols-2" :class="!auth.isStudent.value && 'lg:grid-cols-3'">
            <USkeleton v-for="index in (auth.isStudent.value ? 2 : 3)" :key="index" class="h-22 rounded-xl" aria-hidden="true" />
          </div>
        </div>
        <UAlert v-else-if="isInitialError" color="error" icon="i-lucide-triangle-alert" title="Unable to load the property overview." description="Please try again. Availability cannot be confirmed while records are unavailable.">
          <template #actions><UButton label="Retry" color="neutral" variant="outline" @click="refresh()" /></template>
        </UAlert>
        <template v-else-if="hasLoaded">
          <AppRefreshState :refreshing="isRefreshing" :failed="status === 'error'" @retry="refresh()" />
          <div class="grid gap-3 sm:grid-cols-2" :class="!auth.isStudent.value && 'lg:grid-cols-3'">
            <div v-for="stat in stats" :key="stat.label" class="rounded-xl border border-default bg-default px-5 py-4">
              <p class="text-2xl font-semibold tracking-tight text-highlighted tabular-nums">{{ stat.value }}</p>
              <p class="mt-1 text-sm text-muted">{{ stat.label }}</p>
            </div>
          </div>
          <p class="mt-3 text-xs leading-relaxed text-muted">Counts include all property records permitted for your access. These totals describe property spaces, not buildings. Listings can include stalls, offices, and other spaces.</p>
          <p v-if="stats[0]?.value === 0" class="mt-2 text-sm text-muted">No property spaces found for your access.</p>
        </template>
      </section>
</template>
