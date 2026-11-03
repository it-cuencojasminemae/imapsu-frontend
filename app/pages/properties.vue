<script setup lang="ts">
definePageMeta({
  middleware: 'auth'
})

type PropertySpace = {
  id: string | number
  documentId?: string
  propertyCode: string
  name: string
  businessName?: string
  building: string
  floor?: string
  description?: string
  area?: number | string
  space_status: 'Vacant' | 'Occupied'
  monthlyRent?: number | string
  photos?: { id: number; url?: string; name?: string }[] | null
  tenantPhotos?: { id: number; url?: string; name?: string }[] | null
}

type Feedback = {
  id: number | string
  documentId?: string
  forCurrentTenant?: boolean
  rating: number
  comment?: string
  createdAt?: string
  propertySpace?: { documentId?: string } | null
}

type ActiveTenant = { propertyDocumentId: string; hasActiveTenant: boolean }

type PropertyResponse = { data: PropertySpace[] }
type ListResponse<T> = { data: T[] }

const config = useRuntimeConfig()
const auth = useAuth()
useHead({ title: () => `${auth.isStudent.value ? 'Campus' : 'Rentable'} Spaces | iMapSU` })
const headers = {}
const recordsPage = useRecordPage([], {  })
const { data: responseData, status, error, refresh } = await useFetch<PropertyResponse>('/api/properties', {
  baseURL: '',
  headers,
  query: computed(() => ({
    'populate[photos]': true,
    'populate[tenantPhotos]': true,
    sort: 'propertyCode:asc', ...recordsPage.query.value }))
})
const { data, hasLoaded, isInitialLoading, isRefreshing, isInitialError } = useRequestPresentation(responseData, status)


const { data: tenantData, refresh: refreshTenants } = await useFetch<ListResponse<ActiveTenant>>('/api/properties/active-tenants', {
  baseURL: '',
  headers
})

const feedbackUrl = computed(() => (auth.isStudent.value ? '/api/feedbacks' : null))
const { data: feedbackDataResponse, refresh: refreshFeedback, status: feedbackDataStatus, error: feedbackDataError } = await useCompleteFetch<ListResponse<Feedback>>(feedbackUrl, {
  baseURL: '',
  headers,
  query: {
    'populate[propertySpace]': true,
    sort: 'createdAt:desc',
    'pagination[pageSize]': 100
  }
})
const { data: feedbackData } = useRequestPresentation(feedbackDataResponse, feedbackDataStatus)


// The campus map links here with ?focus=<documentId>. That stall may sit on
// another page of the listing, so it is fetched on its own and pinned first.
const route = useRoute()
const router = useRouter()
const requestFetch = useRequestFetch()
const focusId = computed(() => typeof route.query.focus === 'string' ? route.query.focus : '')
const { data: focusResponse } = await useAsyncData('properties:focus', () => focusId.value
  ? requestFetch<PropertyResponse>('/api/properties', {
      baseURL: '',
      query: { 'populate[photos]': true, 'populate[tenantPhotos]': true, 'filters[documentId][$eq]': focusId.value }
    })
  : Promise.resolve(null), { watch: [focusId] })

const properties = computed(() => {
  const all = data.value?.data ?? []
  // The API already filters these for students; this guards against any
  // cached response while the backend is still restarting.
  return auth.isStudent.value ? all.filter(property => property.space_status !== 'Vacant') : all
})
const { data: propertySummaryResponse, refresh: refreshSummary } = await useFetch<any>('/api/dashboard/property-summary')
// The listing is paginated, so the current page cannot supply the total.
const totalCount = computed(() => propertySummaryResponse.value?.total ?? properties.value.length)
const vacantCount = computed(() => propertySummaryResponse.value?.vacant ?? 0)

const rentedProperties = computed(() => new Set((tenantData.value?.data ?? []).filter(entry => entry.hasActiveTenant).map(entry => entry.propertyDocumentId)))

const feedbacksForCurrentTenant = computed(() => {
  const map = new Map<string, Feedback[]>()
  for (const feedback of feedbackData.value?.data ?? []) {
    const propertyId = feedback.propertySpace?.documentId
    if (!propertyId || !feedback.forCurrentTenant) continue
    const list = map.get(propertyId) ?? []
    list.push(feedback)
    map.set(propertyId, list)
  }
  return map
})

type Card = PropertySpace & {
  hasTenant: boolean
  feedback: { count: number; avg: number; latest: Feedback } | null
}

const toCard = (property: PropertySpace): Card => {
  const hasTenant = rentedProperties.value.has(property.documentId ?? '')
  const list = feedbacksForCurrentTenant.value.get(property.documentId ?? '')
  const feedback = list?.length
    ? {
        count: list.length,
        avg: list.reduce((sum, item) => sum + item.rating, 0) / list.length,
        latest: list[0]
      }
    : null
  return { ...property, hasTenant, feedback }
}

const focusedCard = computed<Card | null>(() => {
  if (!focusId.value) return null
  const property = properties.value.find(entry => entry.documentId === focusId.value) ?? focusResponse.value?.data?.[0]
  if (!property || (auth.isStudent.value && property.space_status === 'Vacant')) return null
  return toCard(property)
})

const cards = computed<Card[]>(() => {
  const all = properties.value.map(toCard)
  return focusedCard.value ? [focusedCard.value, ...all.filter(card => card.documentId !== focusId.value)] : all
})

// Students look for the business, the same name the campus map shows them.
const cardTitle = (card: Card) => (auth.isStudent.value && card.businessName?.trim()) || card.name
const isFocused = (card: Card) => !!focusId.value && card.documentId === focusId.value
const clearFocus = () => {
  const { focus: _focus, ...query } = route.query
  router.replace({ query })
}

const scrollToFocused = async () => {
  if (!focusedCard.value) return
  await nextTick()
  document.getElementById(`property-${focusId.value}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
}
onMounted(scrollToFocused)
watch(focusedCard, (card, previous) => { if (card && card.documentId !== previous?.documentId) scrollToFocused() })

// Occupied spaces show the tenant's own photos; vacant ones show the office's
// listing photos.
const photosForCard = (card: Card) =>
  card.space_status === 'Occupied' ? (card.tenantPhotos ?? []) : (card.photos ?? [])

const refreshAll = async () => {
  await Promise.all([refresh(), refreshFeedback(), refreshSummary(), refreshTenants()])
}

const formatCurrency = (amount?: number | string) => {
  if (amount == null || amount === '') return 'Not set'

  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 0
  }).format(Number(amount))
}

const formatArea = (area?: number | string) => area == null || area === '' ? 'Not set' : `${area} sqm`
</script>

<template>
  <main class="imapsu-page">
    <AppPageHeader>
      <template #eyebrow>{{ auth.isStudent.value ? 'Campus directory' : 'Property portfolio' }}</template>
      <template #title>{{ auth.isStudent.value ? 'Campus' : 'Rentable' }} Spaces</template>
      <template #description><p class="mt-2 max-w-xl text-muted">{{ auth.isStudent.value ? 'Browse occupied campus stalls and other spaces in use.' : 'Browse registered campus stalls and other rentable spaces. Information shown depends on your account access.' }}</p></template>
      <template #actions><div v-if="hasLoaded" class="flex gap-3">
        <UCard class="min-w-28" :ui="{ body: 'p-3' }">
          <p class="text-xs text-muted">Total spaces</p><p class="text-xl font-semibold text-highlighted">{{ totalCount }}</p>
        </UCard>
        <UCard v-if="!auth.isStudent.value" class="min-w-28" :ui="{ body: 'p-3' }">
          <p class="text-xs text-muted">Vacant</p><p class="text-xl font-semibold text-secondary">{{ vacantCount }}</p>
        </UCard>
        <div class="flex items-center">
          <UButton label="Refresh" icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="status === 'pending'" @click="refreshAll" />
          <UButton v-if="auth.isOas.value" to="/admin/properties" label="Manage" icon="i-lucide-settings-2" color="neutral" variant="subtle" />
        </div>
      </div></template>
    </AppPageHeader>

    <AppRefreshState :refreshing="isRefreshing" :failed="hasLoaded && !!error" @retry="refresh" />
    <AppLoadingState v-if="isInitialLoading" :count="6" height="h-64" />

    <UAlert v-else-if="isInitialError" color="error" icon="i-lucide-triangle-alert" :title="auth.isStudent.value ? 'Unable to load campus spaces' : 'Unable to load property spaces'" description="Please try again." ><template #actions><UButton label="Retry" color="neutral" variant="outline" @click="refresh" /></template></UAlert>

    <UEmpty v-else-if="properties.length === 0" icon="i-lucide-store" :title="auth.isStudent.value ? 'No campus spaces found' : 'No property spaces found'" :description="auth.isStudent.value ? 'Campus spaces will appear here once they are in use.' : 'Property spaces will appear here once they are added to iMapSU.'" />

    <template v-else>
    <UAlert
      v-if="focusedCard"
      class="mb-4"
      color="primary"
      variant="subtle"
      icon="i-lucide-map-pin"
      :title="`${cardTitle(focusedCard)} is shown first`"
      description="This is the space you selected on the campus map."
    >
      <template #actions>
        <UButton size="sm" color="neutral" variant="outline" to="/campus-map" label="Back to map" icon="i-lucide-map" />
        <UButton size="sm" color="neutral" variant="ghost" label="Show all spaces" @click="clearFocus" />
      </template>
    </UAlert>
    <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <UCard
        v-for="card in cards"
        :id="`property-${card.documentId ?? card.id}`"
        :key="card.documentId ?? card.id"
        class="scroll-mt-24"
        :class="isFocused(card) && 'ring-2 ring-primary'"
        :ui="{ header: 'p-5', body: 'p-5 pt-0' }"
      >
        <template #header>
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <UBadge v-if="isFocused(card)" class="mb-2" color="primary" variant="solid" size="sm" icon="i-lucide-map-pin" label="Selected on map" />
              <p class="font-mono text-xs text-muted">{{ card.propertyCode }}</p>
              <h2 class="mt-1 break-words text-lg font-semibold text-highlighted">{{ cardTitle(card) }}</h2>
            </div>
            <UBadge v-if="!auth.isStudent.value" :color="card.space_status === 'Vacant' ? 'secondary' : 'neutral'" variant="subtle">{{ card.space_status }}</UBadge>
          </div>
        </template>

        <div v-if="photosForCard(card).length" class="mb-4 flex gap-2 overflow-x-auto pb-1">
          <img
            v-for="photo in photosForCard(card)"
            :key="photo.id"
            :src="`${''}${photo.url}`"
            :alt="photo.name || cardTitle(card)"
            class="h-24 w-24 shrink-0 rounded-lg object-cover"
          />
        </div>

        <dl class="space-y-4 text-sm">
          <div>
            <dt class="mb-1 flex items-center gap-1.5 text-xs text-muted"><UIcon name="i-lucide-map-pin" /> Location</dt>
            <dd class="font-medium text-highlighted">{{ card.building }}<span v-if="card.floor"> · {{ card.floor }}</span></dd>
          </div>
          <div v-if="!auth.isStudent.value" class="grid grid-cols-2 gap-4">
            <div><dt class="mb-1 text-xs text-muted">Area</dt><dd class="font-medium text-highlighted">{{ formatArea(card.area) }}</dd></div>
            <div><dt class="mb-1 text-xs text-muted">Monthly rent</dt><dd class="font-semibold text-primary">{{ formatCurrency(card.monthlyRent) }}</dd></div>
          </div>
          <div v-if="card.description"><dt class="mb-1 text-xs text-muted">Description</dt><dd class="line-clamp-2 text-toned">{{ card.description }}</dd></div>
        </dl>

        <div v-if="auth.isStudent.value && card.hasTenant" class="mt-4 border-t pt-4">
          <p class="mb-2 flex items-center gap-1.5 text-xs text-muted"><UIcon name="i-lucide-message-square-text" /> Student feedback</p>
          <template v-if="card.feedback">
            <div class="flex items-center gap-2">
              <span class="flex items-center gap-0.5">
                <UIcon
                  v-for="star in 5"
                  :key="star"
                  name="i-lucide-star"
                  class="size-4"
                  :class="star <= Math.round(card.feedback.avg) ? 'text-secondary fill-current' : 'text-toned'"
                />
              </span>
              <span class="text-sm font-semibold text-highlighted">{{ card.feedback.avg.toFixed(1) }}</span>
              <span class="text-xs text-muted">({{ card.feedback.count }})</span>
            </div>
            <p v-if="card.feedback.latest.comment" class="mt-1.5 line-clamp-2 text-sm text-toned">{{ card.feedback.latest.comment }}</p>
          </template>
          <p v-else class="text-sm text-toned">No feedback yet for this stall.</p>
          <UButton v-if="card.documentId" class="mt-3" size="sm" color="neutral" variant="outline" block :to="`/feedback?property=${card.documentId}`" label="Rate this stall" icon="i-lucide-star" />
        </div>

        <div v-if="auth.isAspiringTenant.value && card.space_status === 'Vacant' && card.documentId" class="mt-4">
          <UButton data-prominent="true" block :to="`/rental-applications?property=${card.documentId}`" label="Apply" icon="i-lucide-clipboard-list" />
        </div>
      </UCard>
    </div>
    </template>
    <AppRecordPagination :state="recordsPage" :response="data" :pending="status === 'pending'" />
  </main>
</template>
