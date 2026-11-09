<script setup lang="ts">
definePageMeta({
  middleware: ['auth', 'role'],
  roles: ['current-tenant']
})

type Rating = {
  id: number | string
  documentId?: string
  rating: number
  category?: string
  comment?: string
  createdAt?: string
  propertySpace?: { documentId?: string; name?: string; businessName?: string; propertyCode?: string } | null
}
type ListResponse<T> = { data: T[] }

useHead({ title: 'Stall Ratings | iMapSU' })

const { baseURL } = useStrapi()

// Visitors rate stalls from the campus map. A tenant reads the ratings for the
// stalls they rent now; the OAS hides any that break the community guidelines.
const recordsPage = useRecordPage([], {})
const { data: responseData, status, error, refresh } = await useFetch<ListResponse<Rating>>('/api/feedbacks', { lazy: true,
  baseURL,
  query: computed(() => ({ 'populate[propertySpace]': true, sort: 'createdAt:desc', ...recordsPage.query.value }))
})
const { data, hasLoaded, isInitialLoading, isRefreshing, isInitialError } = useRequestPresentation(responseData, status)
const ratings = computed(() => data.value?.data ?? [])

// Averages cover every rating, so they are read in full; the list is paginated.
const { data: allRatings } = await useCompleteFetch<ListResponse<Rating>>('/api/feedbacks', { lazy: true,
  baseURL,
  query: { 'populate[propertySpace]': true, 'fields[0]': 'rating' }
})

const stallName = (property: { name?: string; businessName?: string }) => property.businessName?.trim() || property.name || 'Stall'

const summaries = computed(() => {
  const byStall = new Map<string, { name: string; code?: string; count: number; total: number }>()
  for (const item of allRatings.value?.data ?? []) {
    const stall = item.propertySpace
    const key = stall?.documentId ?? 'unknown'
    const entry = byStall.get(key) ?? { name: stall ? stallName(stall) : 'Stall', code: stall?.propertyCode, count: 0, total: 0 }
    entry.count++
    entry.total += Number(item.rating) || 0
    byStall.set(key, entry)
  }
  return [...byStall.values()].map(entry => ({ ...entry, average: entry.count ? entry.total / entry.count : 0 }))
})

const formatDate = (value?: string) => value
  ? new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  : ''
</script>

<template>
  <main class="imapsu-page">
    <AppPageHeader>
      <template #title>Stall ratings</template>
      <template #description>
        <p class="mt-2 max-w-xl text-muted">What visitors say about your stall. Anyone can rate a stall from the campus map and see its ratings there; ratings that break the <NuxtLink to="/community-guidelines" class="font-medium text-primary hover:underline">community guidelines</NuxtLink> are hidden by the OAS.</p>
      </template>
      <template #actions><UButton label="Refresh" color="neutral" variant="ghost" :loading="status === 'pending'" @click="refresh" /></template>
    </AppPageHeader>

    <section v-if="summaries.length" class="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Average ratings">
      <div v-for="stall in summaries" :key="stall.name + stall.code" class="rounded-xl border border-default bg-default px-5 py-4">
        <p class="truncate text-sm font-medium text-highlighted">{{ stall.name }} <span v-if="stall.code" class="text-xs text-muted">({{ stall.code }})</span></p>
        <p class="mt-2 flex items-baseline gap-2">
          <span class="text-3xl font-semibold tracking-tight text-highlighted tabular-nums">{{ stall.average.toFixed(1) }}</span>
          <span class="text-sm text-muted">out of 5</span>
        </p>
        <p class="mt-1 text-xs text-muted">From {{ stall.count }} rating{{ stall.count === 1 ? '' : 's' }}</p>
      </div>
    </section>

    <AppRefreshState :refreshing="isRefreshing" :failed="hasLoaded && !!error" @retry="refresh" />
    <AppLoadingState v-if="isInitialLoading" variant="list" :toolbar="false" :count="4" label="Loading feedback…" />
    <UAlert v-else-if="isInitialError" color="error" title="Unable to load ratings" description="Please try again."><template #actions><UButton label="Retry" color="neutral" variant="outline" @click="refresh" /></template></UAlert>
    <UEmpty v-else-if="ratings.length === 0" icon="i-lucide-star" title="No ratings yet" description="Ratings visitors leave for your stall on the campus map will appear here." />

    <div v-else class="space-y-4">
      <UCard v-for="item in ratings" :key="item.documentId ?? item.id" :ui="{ body: 'p-5' }">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="flex items-center gap-0.5" :aria-label="`${item.rating} out of 5 stars`">
            <RatingStar v-for="star in 5" :key="star" class="size-4" :class="star <= item.rating ? 'text-secondary' : 'text-(--ui-border-accented)'" />
          </div>
          <div class="flex items-center gap-2">
            <UBadge v-if="item.category && item.category !== 'Other'" color="neutral" variant="subtle" size="sm">{{ item.category }}</UBadge>
            <p class="whitespace-nowrap text-xs text-muted">{{ formatDate(item.createdAt) }}</p>
          </div>
        </div>
        <p class="mt-3 text-sm leading-relaxed text-toned">{{ item.comment || 'No comment left.' }}</p>
        <p v-if="item.propertySpace" class="mt-3 text-xs text-muted">
          {{ stallName(item.propertySpace) }} <span>({{ item.propertySpace.propertyCode }})</span>
        </p>
      </UCard>
    </div>
    <AppRecordPagination :state="recordsPage" :response="data" :pending="status === 'pending'" />
  </main>
</template>
