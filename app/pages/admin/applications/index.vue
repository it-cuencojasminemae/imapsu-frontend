<script setup lang="ts">
import {
  formatReviewDate as formatDate,
  isReviewLocked,
  reviewKindLabel,
  reviewPath,
  reviewPropertyCode as propertyCode,
  reviewPropertyName as propertyName,
  reviewStatusBadgeColor as statusBadgeColor,
  reviewStatusLabel as statusLabel,
  type ReviewItem as Item
} from '~/utils/applicationReview'

definePageMeta({
  middleware: ['auth', 'role'],
  roles: ['oas']
})

type ListResponse<T> = { data: T[] }

useHead({ title: 'Review Applications | iMapSU' })

const route = useRoute()
const { baseURL } = useStrapi()
const headers = {}

const filter = ref('all')
const filterSearch = ref('')
const recordsPage = useRecordPage([], { status: { ref: filter, field: 'status' } }, filterSearch)
const { data: responseData, status, error, refresh } = await useFetch<ListResponse<Item>>('/api/dashboard/applications', { lazy: true,
  baseURL,
  headers,
  query: computed(() => ({ ...recordsPage.query.value, statusFilter: filter.value, q: filterSearch.value }))
})
const { data, hasLoaded, isInitialLoading, isRefreshing, isInitialError } = useRequestPresentation(responseData, status)

watch(filter, () => { recordsPage.page.value = 1 })

const items = computed<Item[]>(() => [...(data.value?.data ?? [])].sort((a, b) => {
  const time = (item: Item) => item.createdAt ? new Date(item.createdAt).getTime() : 0
  return time(b) - time(a)
}))

const FILTER_OPTIONS = [
  { label: 'All applications', value: 'all' },
  { label: 'Unanswered (Pending / For Review)', value: 'unanswered' },
  { label: 'For Recommendation', value: 'For Recommendation' },
  { label: 'Approved', value: 'Approved' },
  { label: 'Declined / Rejected', value: 'declined' },
  { label: 'Cancelled', value: 'Cancelled' }
]

const isUnanswered = (item: Item) => item.kind === 'application' && (item.status === 'Pending' || item.status === 'For Review')

const filteredItems = computed(() => {
  const query = filterSearch.value.trim().toLowerCase()
  return items.value.filter(item => {
    if (filter.value === 'unanswered' && !isUnanswered(item)) return false
    if (filter.value === 'declined' && !(item.status === 'Declined' || item.status === 'Rejected')) return false
    if (filter.value !== 'all' && filter.value !== 'unanswered' && filter.value !== 'declined' && item.status !== filter.value) return false
    if (query) {
      const haystack = [propertyName(item), propertyCode(item) ?? '', item.user?.username ?? '', item.user?.email ?? ''].join(' ').toLowerCase()
      if (!haystack.includes(query)) return false
    }
    return true
  })
})

const filterCount = computed(() => (filter.value !== 'all' ? 1 : 0) + (filterSearch.value.trim() ? 1 : 0))

const clearFilters = () => {
  filter.value = 'all'
  filterSearch.value = ''
}

const itemKey = (item: Item) => item.kind + '-' + (item.documentId ?? item.id)

// The review page gets the list's query so its back link returns to the same
// filters and page.
const openTo = (item: Item) => ({ path: reviewPath(item), query: route.query })

// Items still waiting on the OAS get Review; decided ones only show their details.
const actionFor = (item: Item) => isReviewLocked(item)
  ? { label: 'Details', icon: 'i-lucide-eye', color: 'neutral' as const, variant: 'outline' as const }
  : { label: 'Review', icon: undefined, color: 'primary' as const, variant: 'subtle' as const }

const recordColumns = [
  { key: 'property', label: 'Property', value: (item: Item) => propertyName(item) },
  { key: 'applicant', label: 'Applicant', value: (item: Item) => item.user?.username || '—' },
  { key: 'kind', label: 'Type', value: (item: Item) => reviewKindLabel(item) },
  { key: 'date', label: 'Submitted', value: (item: Item) => formatDate(item.createdAt) },
  { key: 'status', label: 'Status', value: (item: Item) => statusLabel(item), badge: true, color: (item: Item) => statusBadgeColor(item) }
]
</script>

<template>
  <main class="imapsu-page imapsu-page--admin">
    <AppPageHeader>
      <template #title>Rental applications</template>
      <template #description><p class="mt-2 max-w-xl text-muted">Review rental applications and renewal requests, track recommendations, and record official application decisions.</p></template>
      <template #actions><UButton label="Refresh" icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="status === 'pending'" @click="refresh()" /></template>
    </AppPageHeader>

    <AppRefreshState :refreshing="isRefreshing" :failed="hasLoaded && !!error" @retry="refresh" />
    <AppLoadingState v-if="isInitialLoading" variant="table" :count="6" label="Loading rental applications…" />

    <UAlert v-else-if="isInitialError" color="error" icon="i-lucide-triangle-alert" title="Unable to load rental applications" description="Please try again." ><template #actions><UButton label="Retry" color="neutral" variant="outline" @click="refresh()" /></template></UAlert>

    <UEmpty v-else-if="items.length === 0 && filterCount === 0" icon="i-lucide-clipboard-list" title="No rental applications found" description="Applications and renewal intents will appear here." />

    <div v-else class="space-y-4">
      <UCard :ui="{ body: 'p-4' }">
        <div class="grid gap-3 sm:grid-cols-2">
          <UFormField label="Filter">
            <USelect v-model="filter" :items="FILTER_OPTIONS" />
          </UFormField>
          <UFormField label="Search">
            <UInput v-model="filterSearch" placeholder="Property, code, applicant…" icon="i-lucide-search" />
          </UFormField>
        </div>
        <div class="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p class="text-sm text-muted">Showing {{ filteredItems.length }} of {{ items.length }}</p>
          <UButton v-if="filterCount > 0" label="Clear filters" icon="i-lucide-x" color="neutral" variant="ghost" size="sm" @click="clearFilters" />
        </div>
      </UCard>

      <UEmpty v-if="filteredItems.length === 0" icon="i-lucide-list-filter" title="No matching applications" description="No applications match the current filters." />
      <template v-else>
        <AppRecordTable :items="filteredItems" :columns="recordColumns" :item-key="itemKey" caption="Applications and renewals" :details-toggle="false">
        <template #cell-applicant="{ item }"><span class="flex items-center gap-2"><AppUserAvatar v-if="item.user" :user="item.user" size="xs" /><span class="text-toned">{{ item.user?.username || '—' }}</span></span></template>
        <template #actions="{ item }"><UButton :to="openTo(item)" v-bind="actionFor(item)" size="sm" /></template>
        <template #details="{ item }">
          <!-- Phone card: a summary and the same single Review or Details action as the desktop row. -->
          <UCard :ui="{ body: 'p-4' }">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="font-medium text-highlighted">{{ propertyName(item) }}</p>
                <p class="mt-1 text-xs text-muted">
                  {{ reviewKindLabel(item) }} · {{ item.user?.username ?? '—' }} · {{ formatDate(item.createdAt) }}
                </p>
              </div>
              <UBadge :color="statusBadgeColor(item)" variant="subtle">{{ statusLabel(item) }}</UBadge>
            </div>
            <UButton :to="openTo(item)" v-bind="actionFor(item)" size="sm" block class="mt-3" />
          </UCard>
        </template>
      </AppRecordTable>
      </template>
    </div>

    <AppRecordPagination :state="recordsPage" :response="data" :pending="status === 'pending'" />
  </main>
</template>
