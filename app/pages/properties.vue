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
  campus?: string
  floor?: string
  description?: string
  area?: number | string
  rentalClassification?: string
  productsServices?: string
  operatingDetails?: string
  space_status: 'Vacant' | 'Occupied'
  monthlyRent?: number | string
  photos?: { id: number; url?: string; name?: string }[] | null
  tenantPhotos?: { id: number; url?: string; name?: string }[] | null
}

type PropertyResponse = { data: PropertySpace[] }

const auth = useAuth()
useHead({ title: 'Rentable Spaces | iMapSU' })
const headers = {}
// Occupied or vacant, kept in the URL (?status=) so a reload or back keeps it.
const statusFilter = ref<'all' | 'Vacant' | 'Occupied'>('all')
const recordsPage = useRecordPage([], { status: { ref: statusFilter, field: 'space_status' } })
const { data: responseData, status, error, refresh } = await useFetch<PropertyResponse>('/api/properties', { lazy: true,
  baseURL: '',
  headers,
  query: computed(() => ({
    'populate[photos]': true,
    'populate[tenantPhotos]': true,
    sort: 'propertyCode:asc', ...recordsPage.query.value }))
})
const { data, hasLoaded, isInitialLoading, isRefreshing, isInitialError } = useRequestPresentation(responseData, status)

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

const properties = computed(() => data.value?.data ?? [])
const { data: propertySummaryResponse, refresh: refreshSummary } = await useFetch<any>('/api/dashboard/property-summary', { lazy: true })
// The listing is paginated, so the current page cannot supply the total.
const totalCount = computed(() => propertySummaryResponse.value?.total ?? properties.value.length)
const vacantCount = computed(() => propertySummaryResponse.value?.vacant ?? 0)
const occupiedCount = computed(() => propertySummaryResponse.value?.occupied ?? 0)

const statusTabs = computed(() => [
  { label: 'All', value: 'all', badge: propertySummaryResponse.value ? totalCount.value : undefined },
  { label: 'Vacant', value: 'Vacant', icon: 'i-lucide-door-open', badge: propertySummaryResponse.value ? vacantCount.value : undefined },
  { label: 'Occupied', value: 'Occupied', icon: 'i-lucide-store', badge: propertySummaryResponse.value ? occupiedCount.value : undefined }
])

type Card = PropertySpace

// The stall picked on the map stays pinned unless the status filter hides it.
const focusedCard = computed<Card | null>(() => {
  if (!focusId.value) return null
  const card = properties.value.find(entry => entry.documentId === focusId.value) ?? focusResponse.value?.data?.[0] ?? null
  return card && (statusFilter.value === 'all' || card.space_status === statusFilter.value) ? card : null
})

const cards = computed<Card[]>(() => {
  const all = properties.value
  return focusedCard.value ? [focusedCard.value, ...all.filter(card => card.documentId !== focusId.value)] : all
})

const cardTitle = (card: Card) => card.name
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

// The cards only have room for a summary, so the full record opens in a dialog.
const detailsId = ref<string | number | null>(null)
const detailsPhotoIndex = ref(0)
const detailsCard = computed(() => cards.value.find(card => (card.documentId ?? card.id) === detailsId.value) ?? null)
const detailsPhotos = computed(() => detailsCard.value ? photosForCard(detailsCard.value) : [])
const detailsPhoto = computed(() => detailsPhotos.value[detailsPhotoIndex.value] ?? detailsPhotos.value[0] ?? null)
const openDetails = (card: Card) => {
  detailsPhotoIndex.value = 0
  detailsId.value = card.documentId ?? card.id
}

const canApply = (card: Card) => (auth.isAspiringTenant.value || auth.isCurrentTenant.value) && card.space_status === 'Vacant' && !!card.documentId

const refreshAll = async () => {
  await Promise.all([refresh(), refreshSummary()])
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
      <template #title>Rentable spaces</template>
      <template #description><p class="mt-2 max-w-xl text-muted">Browse registered campus stalls and other rentable spaces. Information shown depends on your account access.</p></template>
      <template #actions><div v-if="hasLoaded" class="flex gap-3">
        <UCard class="min-w-28" :ui="{ body: 'p-3' }">
          <p class="text-xs text-muted">Total spaces</p><p class="text-xl font-semibold text-highlighted">{{ totalCount }}</p>
        </UCard>
        <UCard class="min-w-28" :ui="{ body: 'p-3' }">
          <p class="text-xs text-muted">Vacant</p><p class="text-xl font-semibold text-secondary">{{ vacantCount }}</p>
        </UCard>
        <div class="flex items-center">
          <UButton label="Refresh" icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="status === 'pending'" @click="refreshAll" />
          <UButton v-if="auth.isOas.value" to="/admin/properties" label="Manage" icon="i-lucide-settings-2" color="neutral" variant="subtle" />
        </div>
      </div></template>
    </AppPageHeader>

    <AppRefreshState :refreshing="isRefreshing" :failed="hasLoaded && !!error" @retry="refresh" />
    <AppLoadingState v-if="isInitialLoading" variant="cards" :toolbar="false" :count="6" label="Loading property spaces…" />

    <UAlert v-else-if="isInitialError" color="error" icon="i-lucide-triangle-alert" title="Unable to load property spaces" description="Please try again." ><template #actions><UButton label="Retry" color="neutral" variant="outline" @click="refresh" /></template></UAlert>

    <UEmpty v-else-if="properties.length === 0 && statusFilter === 'all'" icon="i-lucide-store" title="No property spaces found" description="Property spaces will appear here once they are added to iMapSU." />

    <template v-else>
    <UTabs
      v-model="statusFilter"
      :items="statusTabs"
      :content="false"
      variant="pill"
      color="neutral"
      class="mb-5 w-full sm:w-fit"
      aria-label="Filter spaces by occupancy"
    />
    <UEmpty
      v-if="properties.length === 0 && !focusedCard"
      icon="i-lucide-list-filter"
      :title="statusFilter === 'Vacant' ? 'No vacant spaces right now' : 'No occupied spaces'"
      :description="statusFilter === 'Vacant' ? 'Every space is currently occupied. Check back later.' : 'No spaces are currently leased.'"
    >
      <template #actions><UButton color="neutral" variant="outline" label="Show all spaces" @click="statusFilter = 'all'" /></template>
    </UEmpty>
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
    <div v-if="cards.length" class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <UCard
        v-for="card in cards"
        :id="`property-${card.documentId ?? card.id}`"
        :key="card.documentId ?? card.id"
        class="flex scroll-mt-24 flex-col"
        :class="isFocused(card) && 'ring-2 ring-primary'"
        :ui="{ header: 'p-5', body: 'flex flex-1 flex-col p-5 pt-0' }"
      >
        <template #header>
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <UBadge v-if="isFocused(card)" class="mb-2" color="primary" variant="solid" size="sm" icon="i-lucide-map-pin" label="Selected on map" />
              <p class="text-xs text-muted">{{ card.propertyCode }}</p>
              <h2 class="mt-1 break-words text-lg font-semibold text-highlighted">{{ cardTitle(card) }}</h2>
            </div>
            <UBadge :color="card.space_status === 'Vacant' ? 'secondary' : 'neutral'" variant="subtle">{{ card.space_status }}</UBadge>
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
          <div class="grid grid-cols-2 gap-4">
            <div><dt class="mb-1 text-xs text-muted">Area</dt><dd class="font-medium text-highlighted">{{ formatArea(card.area) }}</dd></div>
            <div><dt class="mb-1 text-xs text-muted">Monthly rent</dt><dd class="font-semibold text-primary">{{ formatCurrency(card.monthlyRent) }}</dd></div>
          </div>
          <div v-if="card.description"><dt class="mb-1 text-xs text-muted">Description</dt><dd class="line-clamp-2 text-toned">{{ card.description }}</dd></div>
        </dl>

        <!-- Pinned to the bottom so buttons line up across a row of cards. -->
        <div class="mt-auto flex flex-wrap gap-2 pt-4">
          <UButton class="min-w-32 flex-1 justify-center" color="neutral" variant="outline" label="View details" icon="i-lucide-eye" @click="openDetails(card)" />
          <UButton v-if="canApply(card)" class="min-w-32 flex-1 justify-center" data-prominent="true" :to="`/rental-applications?property=${card.documentId}`" label="Apply" icon="i-lucide-clipboard-list" />
        </div>
      </UCard>
    </div>
    </template>
    <AppRecordPagination :state="recordsPage" :response="data" :pending="status === 'pending'" />

    <UModal
      :open="!!detailsCard"
      class="max-w-2xl"
      :title="detailsCard ? cardTitle(detailsCard) : 'Space details'"
      :description="detailsCard ? detailsCard.propertyCode : undefined"
      @update:open="value => { if (!value) detailsId = null }"
    >
      <template #body>
        <div v-if="detailsCard" class="space-y-5">
          <div v-if="detailsPhoto">
            <img :src="detailsPhoto.url" :alt="detailsPhoto.name || cardTitle(detailsCard)" class="aspect-video w-full rounded-lg bg-elevated object-cover" />
            <div v-if="detailsPhotos.length > 1" class="mt-2 flex gap-2 overflow-x-auto pb-1">
              <button
                v-for="(photo, index) in detailsPhotos"
                :key="photo.id"
                type="button"
                class="shrink-0 overflow-hidden rounded-md ring-2 ring-offset-1 ring-offset-default"
                :class="index === detailsPhotoIndex ? 'ring-primary' : 'ring-transparent'"
                :aria-label="`Show photo ${index + 1} of ${detailsPhotos.length}`"
                :aria-pressed="index === detailsPhotoIndex"
                @click="detailsPhotoIndex = index"
              >
                <img :src="photo.url" alt="" class="size-16 object-cover" />
              </button>
            </div>
          </div>
          <div v-else class="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-lg bg-elevated text-muted">
            <UIcon name="i-lucide-image-off" class="size-6" />
            <p class="text-sm">No photos yet</p>
          </div>

          <UBadge :color="detailsCard.space_status === 'Vacant' ? 'secondary' : 'neutral'" variant="subtle">{{ detailsCard.space_status }}</UBadge>

          <dl class="grid gap-4 text-sm sm:grid-cols-2">
            <div class="sm:col-span-2">
              <dt class="mb-1 flex items-center gap-1.5 text-xs text-muted"><UIcon name="i-lucide-map-pin" /> Location</dt>
              <dd class="font-medium text-highlighted">{{ detailsCard.building }}<span v-if="detailsCard.floor"> · {{ detailsCard.floor }}</span><span v-if="detailsCard.campus"> · {{ detailsCard.campus }}</span></dd>
            </div>
            <div><dt class="mb-1 text-xs text-muted">Area</dt><dd class="font-medium text-highlighted">{{ formatArea(detailsCard.area) }}</dd></div>
            <div><dt class="mb-1 text-xs text-muted">Monthly rent</dt><dd class="font-semibold text-primary">{{ formatCurrency(detailsCard.monthlyRent) }}</dd></div>
            <div v-if="detailsCard.rentalClassification"><dt class="mb-1 text-xs text-muted">Classification</dt><dd class="font-medium text-highlighted">{{ detailsCard.rentalClassification }}</dd></div>
            <div v-if="detailsCard.space_status === 'Occupied' && detailsCard.businessName"><dt class="mb-1 text-xs text-muted">Business</dt><dd class="font-medium text-highlighted">{{ detailsCard.businessName }}</dd></div>
            <div v-if="detailsCard.description" class="sm:col-span-2"><dt class="mb-1 text-xs text-muted">Description</dt><dd class="whitespace-pre-line leading-relaxed text-toned">{{ detailsCard.description }}</dd></div>
            <div v-if="detailsCard.space_status === 'Occupied' && detailsCard.productsServices" class="sm:col-span-2"><dt class="mb-1 text-xs text-muted">Products / services</dt><dd class="whitespace-pre-line leading-relaxed text-toned">{{ detailsCard.productsServices }}</dd></div>
            <div v-if="detailsCard.space_status === 'Occupied' && detailsCard.operatingDetails" class="sm:col-span-2"><dt class="mb-1 text-xs text-muted">Operating details</dt><dd class="whitespace-pre-line leading-relaxed text-toned">{{ detailsCard.operatingDetails }}</dd></div>
          </dl>

          <div class="flex flex-wrap justify-end gap-2">
            <UButton color="neutral" variant="ghost" label="Close" @click="detailsId = null" />
            <UButton v-if="canApply(detailsCard)" data-prominent="true" :to="`/rental-applications?property=${detailsCard.documentId}`" label="Apply" icon="i-lucide-clipboard-list" />
          </div>
        </div>
      </template>
    </UModal>
  </main>
</template>
