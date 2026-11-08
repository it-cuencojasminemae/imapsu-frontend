<script setup lang="ts">
definePageMeta({
  middleware: ['auth', 'role'],
  roles: ['oas']
})

type MediaDoc = { id: number; url?: string; name?: string }

type RentalApplication = {
  id: number | string
  documentId?: string
  status: 'Pending' | 'For Review' | 'For Recommendation' | 'Approved' | 'Declined' | 'Cancelled'
  message?: string
  evaluation?: string
  recommendation?: string
  createdAt?: string
  letterOfIntent?: MediaDoc | null
  dtiDocuments?: MediaDoc[] | null
  birDocuments?: MediaDoc[] | null
  businessPermits?: MediaDoc[] | null
  productsServices?: string
  appearanceDate?: string
  appearanceConfirmed?: boolean
  user?: { id: number; username?: string; email?: string; avatar?: { url?: string } | null } | null
  propertySpace?: { documentId?: string; name?: string; propertyCode?: string; building?: string; monthlyRent?: number | string | null } | null
  tenancy?: { documentId?: string; startDate?: string; endDate?: string; status?: string } | null
}

type RenewalIntent = {
  id: number | string
  documentId?: string
  status: 'Pending' | 'Approved' | 'Rejected'
  message?: string
  createdAt?: string
  letterOfRenewal?: { id: number; url?: string; name?: string } | null
  user?: { id: number; username?: string; email?: string; avatar?: { url?: string } | null } | null
  tenancy?: { documentId?: string; propertySpace?: { name?: string; propertyCode?: string; building?: string } | null } | null
}

type ApplicationItem = { kind: 'application'; status: RentalApplication['status']; propertySpace?: RentalApplication['propertySpace']; letterOfIntent?: RentalApplication['letterOfIntent']; dtiDocuments?: RentalApplication['dtiDocuments']; birDocuments?: RentalApplication['birDocuments']; businessPermits?: RentalApplication['businessPermits']; productsServices?: RentalApplication['productsServices']; appearanceDate?: RentalApplication['appearanceDate']; appearanceConfirmed?: RentalApplication['appearanceConfirmed']; evaluation?: RentalApplication['evaluation']; recommendation?: RentalApplication['recommendation']; tenancy?: RentalApplication['tenancy']; applicantRole?: string | null }
  & Pick<RentalApplication, 'id' | 'documentId' | 'message' | 'createdAt' | 'user'>
type RenewalItem = { kind: 'renewal'; status: RenewalIntent['status']; letterOfRenewal?: RenewalIntent['letterOfRenewal']; tenancy?: RenewalIntent['tenancy'] }
  & Pick<RenewalIntent, 'id' | 'documentId' | 'message' | 'createdAt' | 'user'>
type Item = ApplicationItem | RenewalItem

type ListResponse<T> = { data: T[] }

useHead({ title: 'Review Applications | iMapSU' })

const auth = useAuth()
const notify = useNotify()
const { baseURL, $api, getErrorMessage } = useStrapi()
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


const renewalDataStatus = status, renewalDataError = error, refreshRenewals = refresh
const renewalData = computed(() => ({ data: (data.value?.data ?? []).filter(item => item.kind === 'renewal') }))
watch(filter, () => { recordsPage.page.value = 1 })

const applications = computed(() => (data.value?.data ?? []).filter(item => item.kind === 'application'))
const renewalIntents = computed(() => renewalData.value?.data ?? [])

const items = computed<Item[]>(() => {
  const apps: ApplicationItem[] = applications.value.map(application => ({ kind: 'application', ...application }))
  const renewals: RenewalItem[] = renewalIntents.value.map(renewal => ({ kind: 'renewal', ...renewal }))
  return [...apps, ...renewals].sort((a, b) => {
    const time = (item: Item) => item.createdAt ? new Date(item.createdAt).getTime() : 0
    return time(b) - time(a)
  })
})

const APPLICATION_STATUS_OPTIONS = [
  { label: 'Pending', value: 'Pending' },
  { label: 'For Review', value: 'For Review' },
  { label: 'For Recommendation', value: 'For Recommendation' },
  { label: 'Approved', value: 'Approved' },
  { label: 'Declined', value: 'Declined' },
  { label: 'Cancelled', value: 'Cancelled' }
]

const RENEWAL_STATUS_OPTIONS = [
  { label: 'Pending', value: 'Pending' },
  { label: 'Approved', value: 'Approved' },
  { label: 'Rejected', value: 'Rejected' }
]

// Once a decision is made it only moves forward: an approved application can
// still be cancelled, and Declined, Cancelled and decided renewals are final.
// Keep in step with backend/src/utils/status-locks.ts.
const LOCKED_NEXT: Record<Item['kind'], Record<string, string[] | undefined>> = {
  application: { Approved: ['Cancelled'], Declined: [], Cancelled: [] },
  renewal: { Approved: [], Rejected: [] }
}
const nextStatuses = (item: Item) => LOCKED_NEXT[item.kind][item.status]
const statusOptions = (item: Item) => {
  const all = item.kind === 'renewal' ? RENEWAL_STATUS_OPTIONS : APPLICATION_STATUS_OPTIONS
  const next = nextStatuses(item)
  return next ? all.filter(option => option.value === item.status || next.includes(option.value)) : all
}
const statusLocked = (item: Item) => isLeased(item) || nextStatuses(item)?.length === 0
const statusNote = (item: Item) => {
  if (isLeased(item)) return 'This application became a lease, so its status can no longer change.'
  const next = nextStatuses(item)
  if (!next) return undefined
  return next.length
    ? `Already ${item.status.toLowerCase()}. It can only be changed to ${next.join(' or ')}.`
    : `Already ${item.status.toLowerCase()}, so the status can no longer change.`
}

const statusColor = (status: string) => {
  switch (status) {
    case 'Approved':
      return 'success'
    case 'Declined':
    case 'Rejected':
      return 'error'
    case 'Cancelled':
      return 'neutral'
    case 'For Review':
      return 'warning'
    default:
      return 'secondary'
  }
}

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

const propertyName = (item: Item) =>
  item.kind === 'renewal'
    ? item.tenancy?.propertySpace?.name ?? 'Property removed'
    : item.propertySpace?.name ?? 'Property removed'

const propertyCode = (item: Item) =>
  item.kind === 'renewal'
    ? item.tenancy?.propertySpace?.propertyCode
    : item.propertySpace?.propertyCode

const letter = (item: Item) =>
  item.kind === 'renewal' ? item.letterOfRenewal : item.letterOfIntent

const applicationDocSections: { key: 'letterOfIntent' | 'dtiDocuments' | 'birDocuments' | 'businessPermits'; label: string }[] = [
  { key: 'letterOfIntent', label: 'Letter of intent' },
  { key: 'dtiDocuments', label: 'SEC/DTI business documents' },
  { key: 'birDocuments', label: 'BIR business documents' },
  { key: 'businessPermits', label: 'Business permits' }
]

const docsOf = (item: Item, key: 'letterOfIntent' | 'dtiDocuments' | 'birDocuments' | 'businessPermits') => {
  if (item.kind !== 'application') return []
  const value = item[key]
  if (Array.isArray(value)) return value.filter(Boolean)
  return value ? [value] : []
}

const formatDate = (value?: string) => {
  if (!value) return ''
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(value + 'T00:00:00') : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

const refreshAll = async () => {
  await Promise.all([refresh(), refreshRenewals()])
}

const historyOpen = ref(false)
const historyTarget = ref<{ type: 'rental-application' | 'renewal-intent'; id: string; label: string } | null>(null)

const openHistory = (item: Item) => {
  historyTarget.value = {
    type: item.kind === 'renewal' ? 'renewal-intent' : 'rental-application',
    id: String(item.documentId ?? item.id),
    label: propertyName(item)
  }
  historyOpen.value = true
}

// Staff record the office visit only when the applicant is at the counter;
// applicants cannot mark it themselves.
const confirmingAppearance = ref<string | null>(null)

const markAttended = async (item: Item) => {
  if (item.kind !== 'application') return
  const docId = item.documentId ?? item.id
  confirmingAppearance.value = String(docId)
  try {
    await $api(`/api/rental-applications/${docId}`, {
      method: 'PUT',
      body: { data: { appearanceConfirmed: true } }
    })
    notify.success('Marked as attended', { description: 'The applicant\u2019s office visit is recorded.' })
    await refresh()
  } catch (err) {
    notify.error('Unable to record the visit', { description: getErrorMessage(err) })
  } finally {
    confirmingAppearance.value = null
  }
}

// A no-show can be declined from the visit day onward, freeing the stall
// without waiting for the overnight auto-decline.
const visitDayStarted = (value?: string) => {
  if (!value) return false
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return false
  return Date.now() >= new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

const noShowOpen = ref(false)
const noShowTarget = ref<ApplicationItem | null>(null)
const noShowSaving = ref(false)
const noShowError = ref('')

const openNoShow = (item: Item) => {
  if (item.kind !== 'application') return
  reviewOpen.value = false
  noShowTarget.value = item
  noShowError.value = ''
  noShowOpen.value = true
}

const saveNoShow = async () => {
  const item = noShowTarget.value
  if (!item) return
  noShowSaving.value = true
  noShowError.value = ''
  try {
    await $api(`/api/rental-applications/${item.documentId ?? item.id}/no-show`, { method: 'POST' })
    notify.info('Marked as no-show', { description: `The application for ${propertyName(item)} was declined.` })
    noShowOpen.value = false
    await refresh()
  } catch (err) {
    noShowError.value = getErrorMessage(err)
  } finally {
    noShowSaving.value = false
  }
}

// Moves one applicant's visit, for when they cannot come on the scheduled
// day. The server refuses weekends and office closures.
const rescheduleOpen = ref(false)
const rescheduleTarget = ref<ApplicationItem | null>(null)
const rescheduleDate = ref('')
const rescheduleSaving = ref(false)
const rescheduleError = ref('')

const openReschedule = (item: Item) => {
  if (item.kind !== 'application') return
  reviewOpen.value = false
  rescheduleTarget.value = item
  rescheduleDate.value = ''
  rescheduleError.value = ''
  rescheduleOpen.value = true
}

const saveReschedule = async () => {
  const item = rescheduleTarget.value
  if (!item || !rescheduleDate.value) return
  rescheduleSaving.value = true
  rescheduleError.value = ''
  try {
    await $api(`/api/rental-applications/${item.documentId ?? item.id}/reschedule-visit`, { method: 'POST', body: { data: { date: rescheduleDate.value } } })
    notify.success('Office visit moved', { description: `${item.user?.username ?? 'The applicant'} was notified of the new day.` })
    rescheduleOpen.value = false
    await refresh()
  } catch (err) {
    rescheduleError.value = getErrorMessage(err)
  } finally {
    rescheduleSaving.value = false
  }
}

// An approved applicant who attended their office visit can be given the
// stall in one step: the server creates the active tenancy, switches a new
// tenant's account to current tenant and closes the other open applications.
// An application keeps its link to the tenancy it became, even after that tenancy ends.
const isLeased = (item: Item) => item.kind === 'application' && !!item.tenancy
const leaseActive = (item: Item) => isLeased(item) && (item as ApplicationItem).tenancy?.status === 'Active'
const statusLabel = (item: Item) => leaseActive(item) ? 'Lease active' : isLeased(item) ? 'Lease ended' : item.status
const statusBadgeColor = (item: Item) => isLeased(item) && !leaseActive(item) ? 'neutral' as const : statusColor(item.status)
const canFinalize = (item: Item) => item.kind === 'application' && item.status === 'Approved' && !!item.appearanceConfirmed && !item.tenancy

const finalizeOpen = ref(false)
const finalizeTarget = ref<ApplicationItem | null>(null)
const finalizeSaving = ref(false)
const finalizeError = ref('')
const finalizeForm = reactive({
  businessName: '',
  productsServices: '',
  opensAt: undefined as string | undefined,
  closesAt: undefined as string | undefined,
  monthlyRent: '' as string | number,
  startDate: '',
  endDate: ''
})

// Operating hours are picked from a 30-minute list rather than typed, so the
// campus map always shows them in one format. Values are "HH:MM" (24-hour).
const formatTime = (value: string) => {
  const [h, m] = value.split(':').map(Number) as [number, number]
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}
const timeOptions = Array.from({ length: 48 }, (_, i) => {
  const value = `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`
  return { label: formatTime(value), value }
})
const closingTimeOptions = computed(() => finalizeForm.opensAt
  ? timeOptions.filter(option => option.value > finalizeForm.opensAt!)
  : timeOptions)
watch(() => finalizeForm.opensAt, opensAt => {
  if (opensAt && finalizeForm.closesAt && finalizeForm.closesAt <= opensAt) finalizeForm.closesAt = undefined
})
const operatingHours = () => finalizeForm.opensAt && finalizeForm.closesAt
  ? `${formatTime(finalizeForm.opensAt)} – ${formatTime(finalizeForm.closesAt)}`
  : ''

// A new lease cannot start in the past.
const todayInManila = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const finalizeMinStart = ref(todayInManila())
const finalizeDateError = computed(() => finalizeForm.startDate && finalizeForm.startDate < finalizeMinStart.value
  ? 'The contract cannot start before today.'
  : finalizeForm.startDate && finalizeForm.endDate && finalizeForm.endDate <= finalizeForm.startDate
    ? 'The end date must be after the start date.'
    : '')
watch(() => finalizeForm.startDate, startDate => {
  if (startDate && finalizeForm.endDate && finalizeForm.endDate <= startDate) finalizeForm.endDate = ''
})

const openFinalize = (item: Item) => {
  if (item.kind !== 'application') return
  reviewOpen.value = false
  finalizeTarget.value = item
  finalizeForm.businessName = ''
  finalizeForm.productsServices = item.productsServices ?? ''
  finalizeForm.opensAt = undefined
  finalizeForm.closesAt = undefined
  finalizeMinStart.value = todayInManila()
  finalizeForm.monthlyRent = item.propertySpace?.monthlyRent != null ? Number(item.propertySpace.monthlyRent) : ''
  // The contract is signed outside the system, so the dates are left for the
  // OAS to copy from it rather than guessed.
  finalizeForm.startDate = ''
  finalizeForm.endDate = ''
  finalizeError.value = ''
  finalizeOpen.value = true
}

const saveFinalize = async () => {
  const item = finalizeTarget.value
  if (!item) return
  if (finalizeDateError.value) {
    finalizeError.value = finalizeDateError.value
    return
  }
  finalizeSaving.value = true
  finalizeError.value = ''
  try {
    const result = await $api<{ data: { promoted: boolean; closed: { cancelled: number; declined: number } } }>(`/api/rental-applications/${item.documentId ?? item.id}/finalize-lease`, {
      method: 'POST',
      body: {
        data: {
          businessName: finalizeForm.businessName.trim(),
          productsServices: finalizeForm.productsServices.trim(),
          operatingDetails: operatingHours(),
          monthlyRent: Number(finalizeForm.monthlyRent),
          startDate: finalizeForm.startDate,
          endDate: finalizeForm.endDate
        }
      }
    })
    const { promoted, closed } = result.data
    const closedCount = closed.cancelled + closed.declined
    const notes = [
      promoted ? `${item.user?.username ?? 'The applicant'} is now a current tenant.` : '',
      closedCount ? `${closedCount} other open application${closedCount === 1 ? ' was' : 's were'} closed.` : ''
    ].filter(Boolean).join(' ')
    notify.success(`Lease active for ${propertyName(item)}`, { description: notes || undefined })
    finalizeOpen.value = false
    await refresh()
  } catch (err) {
    finalizeError.value = getErrorMessage(err)
  } finally {
    finalizeSaving.value = false
  }
}

const formatAppearance = (value?: string) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
}

// Everything about one application or renewal is in one window: the
// Application tab shows what was submitted, the Evaluation tab is the only
// place its status, evaluation and visit are changed.
const itemKey = (item: Item) => item.kind + '-' + (item.documentId ?? item.id)
const reviewOpen = ref(false)
const reviewKey = ref<string | null>(null)
// Read from the list so the window shows fresh data after a refresh.
const reviewTarget = computed(() => items.value.find(item => itemKey(item) === reviewKey.value) ?? null)
const reviewTab = ref('application')
const reviewTabs = [
  { label: 'Application', value: 'application', slot: 'application' as const },
  { label: 'Evaluation', value: 'evaluation', slot: 'evaluation' as const }
]
const reviewSaving = ref(false)
const reviewError = ref('')
const reviewForm = reactive({
  status: 'For Review' as string,
  evaluation: '',
  recommendation: ''
})

const openReview = (item: Item) => {
  reviewKey.value = itemKey(item)
  reviewTab.value = 'application'
  reviewForm.status = item.status
  reviewForm.evaluation = 'evaluation' in item ? item.evaluation ?? '' : ''
  reviewForm.recommendation = 'recommendation' in item ? item.recommendation ?? '' : ''
  reviewError.value = ''
  reviewOpen.value = true
}

const saveReview = async () => {
  const item = reviewTarget.value
  if (!item) return
  reviewSaving.value = true
  reviewError.value = ''
  try {
    if (item.kind === 'renewal') {
      await $api(`/api/renewal-intents/${item.documentId ?? item.id}`, { method: 'PUT', body: { data: { status: reviewForm.status } } })
    } else {
      await $api(`/api/rental-applications/${item.documentId ?? item.id}`, {
        method: 'PUT',
        body: {
          data: {
            ...(statusLocked(item) ? {} : { status: reviewForm.status }),
            evaluation: reviewForm.evaluation?.trim() || null,
            recommendation: reviewForm.recommendation?.trim() || null
          }
        }
      })
    }
    notify.success(`${item.kind === 'renewal' ? 'Renewal' : 'Application'} saved`, { description: `Status: ${reviewForm.status}.` })
    reviewOpen.value = false
    await refresh()
  } catch (err) {
    reviewError.value = getErrorMessage(err)
  } finally {
    reviewSaving.value = false
  }
}
const recordColumns = [
 { key: 'property', label: 'Property', value: (item: Item) => propertyName(item) },
 { key: 'applicant', label: 'Applicant', value: (item: Item) => item.user?.username || '—' },
 { key: 'kind', label: 'Type', value: (item: Item) => item.kind === 'renewal' ? 'Renewal' : 'Application' },
 { key: 'date', label: 'Submitted', value: (item: Item) => formatDate(item.createdAt) },
 { key: 'status', label: 'Status', value: (item: Item) => statusLabel(item), badge: true, color: (item: Item) => statusBadgeColor(item) }
]
</script>

<template>
  <main class="imapsu-page imapsu-page--admin">
    <AppPageHeader>
      <template #title>Rental applications</template>
      <template #description><p class="mt-2 max-w-xl text-muted">Review rental applications and renewal requests, track recommendations, and record official application decisions.</p></template>
      <template #actions><UButton label="Refresh" icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="status === 'pending'" @click="refreshAll" /></template>
    </AppPageHeader>

    <AppRefreshState :refreshing="isRefreshing" :failed="hasLoaded && !!error" @retry="refresh" />
    <AppLoadingState v-if="isInitialLoading" variant="table" :count="6" label="Loading rental applications…" />

    <UAlert v-else-if="isInitialError" color="error" icon="i-lucide-triangle-alert" title="Unable to load rental applications" description="Please try again." ><template #actions><UButton label="Retry" color="neutral" variant="outline" @click="refresh" /></template></UAlert>

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
        <template #actions="{ item }"><UButton label="Review" color="primary" variant="subtle" size="sm" @click="openReview(item)" /></template>
        <template #details="{ item }">
          <!-- Phone card: a summary and the same single Review action as the desktop row. -->
          <UCard :ui="{ body: 'p-4' }">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="font-medium text-highlighted">{{ propertyName(item) }}</p>
                <p class="mt-1 text-xs text-muted">
                  {{ item.kind === 'renewal' ? 'Renewal' : 'Application' }} · {{ item.user?.username ?? '—' }} · {{ formatDate(item.createdAt) }}
                </p>
              </div>
              <UBadge :color="statusBadgeColor(item)" variant="subtle">{{ statusLabel(item) }}</UBadge>
            </div>
            <UButton label="Review" color="primary" variant="subtle" size="sm" block class="mt-3" @click="openReview(item)" />
          </UCard>
        </template>
      </AppRecordTable>
      </template>
    </div>

    <UModal
      v-model:open="reviewOpen"
      :ui="{ content: 'sm:max-w-3xl' }"
      :title="reviewTarget ? propertyName(reviewTarget) : 'Review'"
      :description="reviewTarget ? `${reviewTarget.kind === 'renewal' ? 'Renewal request' : 'Rental application'} from ${reviewTarget.user?.username ?? 'a removed account'}` : undefined"
    >
      <template #body>
        <div v-if="reviewTarget">
          <UTabs v-model="reviewTab" :items="reviewTabs" variant="link" class="w-full" :ui="{ list: 'mb-5' }">
            <template #application>
              <div class="space-y-6">
                <dl class="grid gap-4 sm:grid-cols-3">
                  <div>
                    <dt class="text-xs font-medium text-muted">Applicant</dt>
                    <dd class="mt-1 flex items-center gap-2">
                      <AppUserAvatar v-if="reviewTarget.user" :user="reviewTarget.user" size="xs" />
                      <span class="min-w-0">
                        <span class="block truncate font-medium text-highlighted">{{ reviewTarget.user?.username ?? '—' }}</span>
                        <span class="block truncate text-xs text-muted">{{ reviewTarget.user?.email }}</span>
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt class="text-xs font-medium text-muted">Stall</dt>
                    <dd class="mt-1">
                      <span class="block font-medium text-highlighted">{{ propertyName(reviewTarget) }}</span>
                      <span v-if="propertyCode(reviewTarget)" class="block text-xs text-muted">{{ propertyCode(reviewTarget) }}</span>
                    </dd>
                  </div>
                  <div>
                    <dt class="text-xs font-medium text-muted">Submitted</dt>
                    <dd class="mt-1 flex flex-wrap items-center gap-2">
                      <span class="text-toned">{{ formatDate(reviewTarget.createdAt) }}</span>
                      <UBadge :color="statusBadgeColor(reviewTarget)" variant="subtle">{{ statusLabel(reviewTarget) }}</UBadge>
                    </dd>
                  </div>
                </dl>

                <section v-if="reviewTarget.kind === 'application'">
                  <h3 class="text-sm font-semibold text-highlighted">Products / services offered</h3>
                  <p class="mt-1 whitespace-pre-line leading-relaxed text-toned">{{ reviewTarget.productsServices || 'Not provided' }}</p>
                </section>

                <section v-if="reviewTarget.message">
                  <h3 class="text-sm font-semibold text-highlighted">Message</h3>
                  <p class="mt-1 whitespace-pre-line leading-relaxed text-toned">{{ reviewTarget.message }}</p>
                </section>

                <section>
                  <h3 class="text-sm font-semibold text-highlighted">{{ reviewTarget.kind === 'renewal' ? 'Letter of renewal intent' : 'Submitted documents' }}</h3>
                  <template v-if="reviewTarget.kind === 'renewal'">
                    <a v-if="letter(reviewTarget)" :href="`${baseURL}${letter(reviewTarget)!.url}`" target="_blank" rel="noopener" class="mt-2 inline-block font-medium text-primary hover:underline">View letter</a>
                    <p v-else class="mt-1 text-muted">Not uploaded</p>
                  </template>
                  <div v-else class="mt-2 divide-y divide-default rounded-lg border border-default">
                    <div v-for="section in applicationDocSections" :key="section.key" class="grid gap-1 px-4 py-3 sm:grid-cols-[13rem_1fr] sm:gap-4">
                      <p class="text-muted">{{ section.label }}</p>
                      <div v-if="docsOf(reviewTarget, section.key).length" class="min-w-0 space-y-1">
                        <a v-for="doc in docsOf(reviewTarget, section.key)" :key="doc.id" :href="`${baseURL}${doc.url}`" target="_blank" rel="noopener" class="block truncate font-medium text-primary hover:underline">{{ doc.name || 'View document' }}</a>
                      </div>
                      <p v-else class="text-muted">Not uploaded</p>
                    </div>
                  </div>
                </section>

                <div class="flex flex-wrap justify-between gap-2 border-t border-default pt-4">
                  <UButton label="Status history" color="neutral" variant="ghost" size="sm" @click="openHistory(reviewTarget)" />
                  <UButton label="Continue to evaluation" color="primary" variant="subtle" size="sm" trailing-icon="i-lucide-arrow-right" @click="reviewTab = 'evaluation'" />
                </div>
              </div>
            </template>

            <template #evaluation>
              <div class="space-y-6">
                <section v-if="reviewTarget.kind === 'application' && reviewTarget.status === 'Approved' && reviewTarget.appearanceDate" class="rounded-lg border p-4" :class="reviewTarget.appearanceConfirmed ? 'border-success/40 bg-success/5' : 'border-warning/40 bg-warning/5'">
                  <div class="flex flex-wrap items-center justify-between gap-3">
                    <div class="flex flex-wrap items-center gap-2">
                      <span class="font-medium text-highlighted">Office visit: {{ formatAppearance(reviewTarget.appearanceDate) }}</span>
                      <UBadge :color="reviewTarget.appearanceConfirmed ? 'success' : 'warning'" variant="subtle">{{ reviewTarget.appearanceConfirmed ? 'Attended' : 'Not yet arrived' }}</UBadge>
                    </div>
                    <div v-if="!reviewTarget.appearanceConfirmed" class="flex flex-wrap items-center gap-2">
                      <UButton label="Reschedule" size="sm" color="neutral" variant="ghost" icon="i-lucide-calendar-clock" @click="openReschedule(reviewTarget)" />
                      <UTooltip :text="`Available from ${formatAppearance(reviewTarget.appearanceDate)}`" :disabled="visitDayStarted(reviewTarget.appearanceDate)">
                        <span><UButton label="Mark as no-show" size="sm" color="error" variant="ghost" :disabled="!visitDayStarted(reviewTarget.appearanceDate)" @click="openNoShow(reviewTarget)" /></span>
                      </UTooltip>
                      <UButton label="Mark as attended" size="sm" color="primary" variant="subtle" :loading="confirmingAppearance === String(reviewTarget.documentId ?? reviewTarget.id)" @click="markAttended(reviewTarget)" />
                    </div>
                    <UButton v-else-if="canFinalize(reviewTarget)" label="Finalize lease" size="sm" color="primary" @click="openFinalize(reviewTarget)" />
                  </div>
                  <p v-if="!reviewTarget.appearanceConfirmed" class="mt-3 text-muted">Mark the applicant as attended only once they are at the office. If no visit is recorded by the end of {{ formatAppearance(reviewTarget.appearanceDate) }}, the application is declined automatically.<template v-if="!visitDayStarted(reviewTarget.appearanceDate)"> Mark as no-show becomes available on that day.</template></p>
                  <p v-if="reviewTarget.tenancy" class="mt-3 text-toned">
                    <template v-if="leaseActive(reviewTarget)">Lease active since {{ formatDate(reviewTarget.tenancy.startDate) }}<template v-if="reviewTarget.tenancy.endDate">, until {{ formatDate(reviewTarget.tenancy.endDate) }}</template>.</template>
                    <template v-else>This lease has ended.</template>
                    <NuxtLink to="/admin/tenancies" class="ml-1 font-medium text-primary hover:underline">Manage in Tenancies</NuxtLink>
                  </p>
                  <p v-else-if="canFinalize(reviewTarget)" class="mt-3 text-muted">The applicant attended their office visit. Finalize the lease to give {{ reviewTarget.user?.username ?? 'the applicant' }} the stall<template v-if="reviewTarget.applicantRole === 'current-tenant'"> alongside the ones they already lease</template><template v-else> and switch their account to current tenant</template>.</p>
                </section>

                <form class="space-y-4" @submit.prevent="saveReview">
                  <UFormField label="Status" required :description="statusNote(reviewTarget)">
                    <USelect v-model="reviewForm.status" :items="statusOptions(reviewTarget)" :disabled="statusLocked(reviewTarget)" class="w-full sm:w-64" />
                  </UFormField>
                  <template v-if="reviewTarget.kind === 'application'">
                    <UFormField label="Evaluation" description="Assessment of the application against the stall's requirements.">
                      <UTextarea v-model="reviewForm.evaluation" :rows="4" placeholder="e.g. Business plan is viable; financial capacity is adequate." :ui="{ root: 'w-full' }" />
                    </UFormField>
                    <UFormField label="Recommendation">
                      <UTextarea v-model="reviewForm.recommendation" :rows="3" placeholder="e.g. Recommend approval pending background check." :ui="{ root: 'w-full' }" />
                    </UFormField>
                  </template>
                  <UAlert v-if="reviewError" color="error" :description="reviewError" />
                  <div class="flex justify-end gap-2 border-t border-default pt-4">
                    <UButton label="Close" color="neutral" variant="ghost" :disabled="reviewSaving" @click="reviewOpen = false" />
                    <UButton v-if="!(reviewTarget.kind === 'renewal' && statusLocked(reviewTarget))" data-prominent="true" type="submit" :loading="reviewSaving">Save review</UButton>
                  </div>
                </form>
              </div>
            </template>
          </UTabs>
        </div>
      </template>
    </UModal>

    <UModal v-model:open="finalizeOpen" class="max-w-2xl" title="Finalize lease" :description="finalizeTarget ? `Lease ${propertyName(finalizeTarget)} to ${finalizeTarget.user?.username ?? 'the applicant'}.` : undefined">
      <template #body>
        <form v-if="finalizeTarget" class="space-y-4" @submit.prevent="saveFinalize">
          <div class="grid gap-3 rounded-lg border border-default p-3 text-sm sm:grid-cols-2">
            <div>
              <p class="text-xs font-medium text-muted">Applicant</p>
              <p class="mt-0.5 font-medium text-highlighted">{{ finalizeTarget.user?.username ?? '—' }}</p>
              <p class="text-xs text-muted">{{ finalizeTarget.user?.email }}</p>
            </div>
            <div>
              <p class="text-xs font-medium text-muted">Stall</p>
              <p class="mt-0.5 font-medium text-highlighted">{{ propertyName(finalizeTarget) }}</p>
              <p class="text-xs text-muted"><span>{{ propertyCode(finalizeTarget) }}</span> · {{ finalizeTarget.propertySpace?.building }}</p>
            </div>
          </div>
          <UFormField label="Business name" required>
            <UInput v-model="finalizeForm.businessName" required placeholder="e.g. Campus Bites" :ui="{ root: 'w-full' }" />
          </UFormField>
          <UFormField label="Products / services" description="From the application. Shown on the campus map.">
            <UTextarea v-model="finalizeForm.productsServices" :rows="3" :ui="{ root: 'w-full' }" />
          </UFormField>
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField label="Opens at">
              <USelect v-model="finalizeForm.opensAt" :items="timeOptions" placeholder="Choose a time" icon="i-lucide-clock" class="w-full" />
            </UFormField>
            <UFormField label="Closes at">
              <USelect v-model="finalizeForm.closesAt" :items="closingTimeOptions" placeholder="Choose a time" icon="i-lucide-clock" class="w-full" />
            </UFormField>
          </div>
          <UFormField label="Monthly rent (₱)" description="From the stall's listed rent." required>
            <UInput v-model="finalizeForm.monthlyRent" type="number" min="1" step="0.01" required :ui="{ root: 'w-full' }" />
          </UFormField>
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField label="Contract start date" description="As written on the signed contract." required>
              <UInput v-model="finalizeForm.startDate" type="date" required :min="finalizeMinStart" :ui="{ root: 'w-full' }" />
            </UFormField>
            <UFormField label="Contract end date" description="As written on the signed contract." required>
              <UInput v-model="finalizeForm.endDate" type="date" required :min="finalizeForm.startDate || undefined" :ui="{ root: 'w-full' }" />
            </UFormField>
          </div>
          <UAlert color="info" variant="subtle" icon="i-lucide-info" title="What happens next">
            <template #description>
              <ul class="mt-1 list-disc space-y-0.5 pl-4 text-sm">
                <li>An active tenancy is created and the stall is marked Occupied on the map.</li>
                <li v-if="finalizeTarget.applicantRole === 'current-tenant'">{{ finalizeTarget.user?.username ?? 'The applicant' }} is already a current tenant, so this stall is added to their tenancies. They stay signed in and get a notification.</li>
                <li v-else>{{ finalizeTarget.user?.username ?? 'The applicant' }}'s account switches to current tenant. They are signed out and get a notification to sign in again.</li>
                <li>Their other open applications, and other applicants' open applications for this stall, are closed and those applicants are notified.</li>
              </ul>
            </template>
          </UAlert>
          <UAlert v-if="finalizeError" color="error" icon="i-lucide-triangle-alert" :description="finalizeError" />
          <div class="flex justify-end gap-2">
            <UButton label="Cancel" color="neutral" variant="ghost" :disabled="finalizeSaving" @click="finalizeOpen = false" />
            <UButton data-prominent="true" type="submit" icon="i-lucide-key-round" :loading="finalizeSaving">Finalize lease</UButton>
          </div>
        </form>
      </template>
    </UModal>

    <UModal v-model:open="noShowOpen" class="max-w-lg" title="Mark as no-show" :description="noShowTarget ? `${noShowTarget.user?.username ?? 'The applicant'} did not report for ${propertyName(noShowTarget)}.` : undefined">
      <template #body>
        <form v-if="noShowTarget" class="space-y-4" @submit.prevent="saveNoShow">
          <p class="text-sm text-toned">The application will be declined right away and {{ noShowTarget.user?.username ?? 'the applicant' }} will be notified that they did not report on {{ formatAppearance(noShowTarget.appearanceDate) }}. The stall becomes available to other applicants.</p>
          <UAlert v-if="noShowError" color="error" icon="i-lucide-triangle-alert" :description="noShowError" />
          <div class="flex justify-end gap-2">
            <UButton label="Cancel" color="neutral" variant="ghost" :disabled="noShowSaving" @click="noShowOpen = false" />
            <UButton type="submit" color="error" icon="i-lucide-user-x" :loading="noShowSaving">Decline as no-show</UButton>
          </div>
        </form>
      </template>
    </UModal>

    <UModal v-model:open="rescheduleOpen" class="max-w-lg" title="Reschedule office visit" :description="rescheduleTarget ? `Currently ${formatAppearance(rescheduleTarget.appearanceDate)}.` : undefined">
      <template #body>
        <form v-if="rescheduleTarget" class="space-y-4" @submit.prevent="saveReschedule">
          <UFormField label="New visit day" description="A weekday the office is open. Closed days are listed under Office closures." required>
            <UInput v-model="rescheduleDate" type="date" required :min="todayInManila()" :ui="{ root: 'w-full' }" />
          </UFormField>
          <p class="text-sm text-toned">{{ rescheduleTarget.user?.username ?? 'The applicant' }} gets a notification with the new day. If they do not report by the end of it, the application is declined automatically.</p>
          <UAlert v-if="rescheduleError" color="error" icon="i-lucide-triangle-alert" :description="rescheduleError" />
          <div class="flex justify-end gap-2">
            <UButton label="Cancel" color="neutral" variant="ghost" :disabled="rescheduleSaving" @click="rescheduleOpen = false" />
            <UButton data-prominent="true" type="submit" icon="i-lucide-calendar-check" :loading="rescheduleSaving" :disabled="!rescheduleDate">Move visit</UButton>
          </div>
        </form>
      </template>
    </UModal>

    <StatusHistoryModal
      v-if="historyTarget"
      v-model:open="historyOpen"
      :entity-type="historyTarget.type"
      :entity-id="historyTarget.id"
      :entity-label="historyTarget.label"
    />
    <AppRecordPagination :state="recordsPage" :response="data" :pending="status === 'pending'" />
  </main>
</template>
