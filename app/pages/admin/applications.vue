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
  user?: { id: number; username?: string; email?: string } | null
  propertySpace?: { documentId?: string; name?: string; propertyCode?: string; building?: string; monthlyRent?: number | string | null } | null
  tenancy?: { documentId?: string; startDate?: string; status?: string } | null
}

type RenewalIntent = {
  id: number | string
  documentId?: string
  status: 'Pending' | 'Approved' | 'Rejected'
  message?: string
  createdAt?: string
  letterOfRenewal?: { id: number; url?: string; name?: string } | null
  user?: { id: number; username?: string; email?: string } | null
  tenancy?: { documentId?: string; propertySpace?: { name?: string; propertyCode?: string; building?: string } | null } | null
}

type ApplicationItem = { kind: 'application'; status: RentalApplication['status']; propertySpace?: RentalApplication['propertySpace']; letterOfIntent?: RentalApplication['letterOfIntent']; dtiDocuments?: RentalApplication['dtiDocuments']; birDocuments?: RentalApplication['birDocuments']; businessPermits?: RentalApplication['businessPermits']; productsServices?: RentalApplication['productsServices']; appearanceDate?: RentalApplication['appearanceDate']; appearanceConfirmed?: RentalApplication['appearanceConfirmed']; evaluation?: RentalApplication['evaluation']; recommendation?: RentalApplication['recommendation']; tenancy?: RentalApplication['tenancy'] }
  & Pick<RentalApplication, 'id' | 'documentId' | 'message' | 'createdAt' | 'user'>
type RenewalItem = { kind: 'renewal'; status: RenewalIntent['status']; letterOfRenewal?: RenewalIntent['letterOfRenewal']; tenancy?: RenewalIntent['tenancy'] }
  & Pick<RenewalIntent, 'id' | 'documentId' | 'message' | 'createdAt' | 'user'>
type Item = ApplicationItem | RenewalItem

type ListResponse<T> = { data: T[] }

useHead({ title: 'Review Applications | iMapSU' })

const auth = useAuth()
const toast = useToast()
const { baseURL, $api, getErrorMessage } = useStrapi()
const headers = {}

const filter = ref('all')
const filterSearch = ref('')
const recordsPage = useRecordPage([], { status: { ref: filter, field: 'status' } }, filterSearch)
const { data: responseData, status, error, refresh } = await useFetch<ListResponse<Item>>('/api/dashboard/applications', {
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

const statusOptions = (item: Item) => item.kind === 'renewal' ? RENEWAL_STATUS_OPTIONS : APPLICATION_STATUS_OPTIONS

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
  { key: 'dtiDocuments', label: 'DTI business documents' },
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

const updating = ref<number | string | null>(null)

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

const updateStatus = async (item: Item, statusValue: string) => {
  if (statusValue === item.status) return
  updating.value = item.documentId ?? item.id
  try {
    const path = item.kind === 'renewal' ? '/api/renewal-intents' : '/api/rental-applications'
    await $api(`${path}/${item.documentId ?? item.id}`, {
      method: 'PUT',
      body: { data: { status: statusValue } }
    })
    toast.add({ title: `${item.kind === 'renewal' ? 'Renewal' : 'Application'} ${statusValue}`, color: statusValue === 'Approved' ? 'success' : 'neutral', icon: 'i-lucide-check-circle-2' })
    if (item.kind === 'renewal') {
      await refreshRenewals()
    } else {
      await refresh()
    }
  } catch (err) {
    toast.add({ title: 'Unable to update status', description: getErrorMessage(err), color: 'error', icon: 'i-lucide-triangle-alert' })
  } finally {
    updating.value = null
  }
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
    toast.add({ title: 'Marked as attended', description: 'The applicant\u2019s office visit is recorded.', color: 'success', icon: 'i-lucide-check-circle-2' })
    await refresh()
  } catch (err) {
    toast.add({ title: 'Unable to record the visit', description: getErrorMessage(err), color: 'error', icon: 'i-lucide-triangle-alert' })
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
    toast.add({ title: 'Marked as no-show', description: `The application for ${propertyName(item)} was declined.`, color: 'neutral', icon: 'i-lucide-user-x' })
    noShowOpen.value = false
    await refresh()
  } catch (err) {
    noShowError.value = getErrorMessage(err)
  } finally {
    noShowSaving.value = false
  }
}

// An approved applicant who attended their office visit can be given the
// stall in one step: the server creates the active tenancy, switches the
// account to current tenant and closes the other open applications.
const isLeased = (item: Item) => item.kind === 'application' && !!item.tenancy
const canFinalize = (item: Item) => item.kind === 'application' && item.status === 'Approved' && !!item.appearanceConfirmed && !item.tenancy

const finalizeOpen = ref(false)
const finalizeTarget = ref<ApplicationItem | null>(null)
const finalizeSaving = ref(false)
const finalizeError = ref('')
const finalizeForm = reactive({
  businessName: '',
  productsServices: '',
  operatingDetails: '',
  monthlyRent: '' as string | number,
  startDate: ''
})

const todayIso = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

const openFinalize = (item: Item) => {
  if (item.kind !== 'application') return
  finalizeTarget.value = item
  finalizeForm.businessName = ''
  finalizeForm.productsServices = item.productsServices ?? ''
  finalizeForm.operatingDetails = ''
  finalizeForm.monthlyRent = item.propertySpace?.monthlyRent != null ? Number(item.propertySpace.monthlyRent) : ''
  finalizeForm.startDate = todayIso()
  finalizeError.value = ''
  finalizeOpen.value = true
}

const saveFinalize = async () => {
  const item = finalizeTarget.value
  if (!item) return
  finalizeSaving.value = true
  finalizeError.value = ''
  try {
    const result = await $api<{ data: { promoted: boolean; closed: { cancelled: number; declined: number } } }>(`/api/rental-applications/${item.documentId ?? item.id}/finalize-lease`, {
      method: 'POST',
      body: {
        data: {
          businessName: finalizeForm.businessName.trim(),
          productsServices: finalizeForm.productsServices.trim(),
          operatingDetails: finalizeForm.operatingDetails.trim(),
          monthlyRent: Number(finalizeForm.monthlyRent),
          startDate: finalizeForm.startDate
        }
      }
    })
    const { promoted, closed } = result.data
    const closedCount = closed.cancelled + closed.declined
    const notes = [
      promoted ? `${item.user?.username ?? 'The applicant'} is now a current tenant.` : '',
      closedCount ? `${closedCount} other open application${closedCount === 1 ? ' was' : 's were'} closed.` : ''
    ].filter(Boolean).join(' ')
    toast.add({ title: `Lease active for ${propertyName(item)}`, description: notes || undefined, color: 'success', icon: 'i-lucide-key-round' })
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

const reviewOpen = ref(false)
const reviewTarget = ref<Item | null>(null)
const reviewSaving = ref(false)
const reviewError = ref('')
const reviewForm = reactive({
  status: 'For Review' as string,
  evaluation: '',
  recommendation: ''
})

const openReview = (item: Item) => {
  reviewTarget.value = item
  reviewForm.status = item.status
  reviewForm.evaluation = 'evaluation' in item ? item.evaluation ?? '' : ''
  reviewForm.recommendation = 'recommendation' in item ? item.recommendation ?? '' : ''
  reviewError.value = ''
  reviewOpen.value = true
}

const saveReview = async () => {
  if (!reviewTarget.value || reviewTarget.value.kind !== 'application') return
  const item = reviewTarget.value as ApplicationItem
  reviewSaving.value = true
  reviewError.value = ''
  try {
    await $api(`/api/rental-applications/${item.documentId ?? item.id}`, {
      method: 'PUT',
      body: {
        data: {
          status: reviewForm.status,
          evaluation: reviewForm.evaluation?.trim() || undefined,
          recommendation: reviewForm.recommendation?.trim() || undefined
        }
      }
    })
    toast.add({ title: `Application ${reviewForm.status}`, description: 'Evaluation and recommendation saved.', color: 'success', icon: 'i-lucide-check-circle-2' })
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
 { key: 'status', label: 'Status', value: (item: Item) => isLeased(item) ? 'Lease active' : item.status, badge: true, color: (item: Item) => statusColor(item.status) }
]
</script>

<template>
  <main class="imapsu-page imapsu-page--admin">
    <AppPageHeader>
      <template #eyebrow>Management</template>
      <template #title>Rental Applications</template>
      <template #description><p class="mt-2 max-w-xl text-muted">Review rental applications and renewal requests, track recommendations, and record official application decisions.</p></template>
      <template #actions><UButton label="Refresh" icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="status === 'pending'" @click="refreshAll" /></template>
    </AppPageHeader>

    <AppRefreshState :refreshing="isRefreshing" :failed="hasLoaded && !!error" @retry="refresh" />
    <AppLoadingState v-if="isInitialLoading" :count="4" height="h-28" />

    <UAlert v-else-if="isInitialError" color="error" icon="i-lucide-triangle-alert" title="Unable to load rental applications" description="Please try again." ><template #actions><UButton label="Retry" color="neutral" variant="outline" @click="refresh" /></template></UAlert>

    <UEmpty v-else-if="items.length === 0" icon="i-lucide-clipboard-list" title="No rental applications found" description="Applications and renewal intents will appear here." />

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
        <AppRecordTable :items="filteredItems" :columns="recordColumns" :item-key="item => item.kind + '-' + (item.documentId ?? item.id)" caption="Applications and renewals">
        <template #actions="{ item }"><UButton v-if="item.kind === 'application'" label="Review" icon="i-lucide-clipboard-list" color="primary" variant="subtle" size="sm" @click="openReview(item)" /></template>
        <template #details="{ item: item }"><UCard  :ui="{ body: 'p-5' }">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="flex flex-wrap items-center gap-2 font-medium text-highlighted">
                {{ propertyName(item) }}
                <UBadge v-if="item.kind === 'renewal'" color="primary" variant="subtle">Renewal</UBadge>
              </p>
              <p class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                <span v-if="propertyCode(item)" class="font-mono">{{ propertyCode(item) }}</span>
                <span v-if="item.user" class="flex items-center gap-1"><UIcon name="i-lucide-circle-user-round" class="size-3.5" />{{ item.user.username }} · {{ item.user.email }}</span>
                <span>Submitted {{ formatDate(item.createdAt) }}</span>
              </p>
            </div>
            <UBadge :color="statusColor(item.status)" variant="subtle">{{ isLeased(item) ? 'Lease active' : item.status }}</UBadge>
          </div>

          <div class="mt-4 border-t border-default pt-4">
            <template v-if="item.kind === 'renewal'">
              <p class="mb-2 text-xs font-medium text-muted">Letter of renewal intent</p>
              <a v-if="letter(item)" :href="`${baseURL}${letter(item)!.url}`" target="_blank" rel="noopener" class="inline-flex items-center gap-1.5 font-medium text-primary hover:underline"><UIcon name="i-lucide-file-text" class="size-3.5" />View letter</a>
              <span v-else class="text-sm text-muted">Not uploaded</span>
            </template>
            <template v-else>
              <p class="mb-2 text-xs font-medium text-muted">Submitted documents</p>
              <div class="grid gap-4 sm:grid-cols-2">
                <div v-for="section in applicationDocSections" :key="section.key">
                  <p class="mb-1 text-xs font-medium text-muted">{{ section.label }}</p>
                  <div v-if="docsOf(item, section.key).length" class="space-y-1">
                    <a v-for="doc in docsOf(item, section.key)" :key="doc.id" :href="`${baseURL}${doc.url}`" target="_blank" rel="noopener" class="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"><UIcon name="i-lucide-file-text" class="size-3.5" />View {{ doc.name || 'document' }}</a>
                  </div>
                  <p v-else class="text-sm text-muted">Not uploaded</p>
                </div>
                <div>
                  <p class="mb-1 text-xs font-medium text-muted">Products / services offered</p>
                  <p v-if="item.productsServices" class="text-sm leading-relaxed text-toned">{{ item.productsServices }}</p>
                  <p v-else class="text-sm text-muted">Not provided</p>
                </div>
              </div>
            </template>
          </div>

          <p v-if="item.message" class="mt-4 text-sm leading-relaxed text-toned">{{ item.message }}</p>

          <div v-if="item.kind === 'application' && item.status === 'Approved' && item.appearanceDate" class="mt-4 rounded-lg border p-4" :class="item.appearanceConfirmed ? 'border-success/40 bg-success/5' : 'border-warning/40 bg-warning/5'">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div class="flex flex-wrap items-center gap-2 text-sm">
                <UIcon :name="item.appearanceConfirmed ? 'i-lucide-badge-check' : 'i-lucide-calendar-clock'" class="size-4" :class="item.appearanceConfirmed ? 'text-success' : 'text-warning'" />
                <span class="font-medium text-highlighted">Office visit: {{ formatAppearance(item.appearanceDate) }}</span>
                <UBadge v-if="item.appearanceConfirmed" color="success" variant="subtle">Attended</UBadge>
                <UBadge v-else color="warning" variant="subtle">Not yet arrived</UBadge>
              </div>
              <div v-if="!item.appearanceConfirmed" class="flex flex-wrap items-center gap-2">
                <UTooltip :text="`Available from ${formatAppearance(item.appearanceDate)}`" :disabled="visitDayStarted(item.appearanceDate)">
                  <span><UButton label="Mark as no-show" icon="i-lucide-user-x" size="sm" color="error" variant="ghost" :disabled="!visitDayStarted(item.appearanceDate)" @click="openNoShow(item)" /></span>
                </UTooltip>
                <UButton label="Mark as attended" icon="i-lucide-user-check" size="sm" color="primary" variant="subtle" :loading="confirmingAppearance === String(item.documentId ?? item.id)" @click="markAttended(item)" />
              </div>
              <UButton v-else-if="canFinalize(item)" label="Finalize lease" icon="i-lucide-key-round" size="sm" color="primary" @click="openFinalize(item)" />
            </div>
            <p v-if="!item.appearanceConfirmed" class="mt-3 text-sm text-muted">Mark the applicant as attended only once they are at the office. If no visit is recorded by the end of {{ formatAppearance(item.appearanceDate) }}, the application is declined automatically.<template v-if="!visitDayStarted(item.appearanceDate)"> Mark as no-show becomes available on that day.</template></p>
            <p v-if="item.kind === 'application' && item.tenancy" class="mt-3 flex flex-wrap items-center gap-1.5 text-sm text-toned">
              <UIcon name="i-lucide-key-round" class="size-4 text-success" />
              Lease active since {{ formatDate(item.tenancy.startDate) }}.
              <NuxtLink to="/admin/tenancies" class="font-medium text-primary hover:underline">Manage in Tenancies</NuxtLink>
            </p>
            <p v-else-if="canFinalize(item)" class="mt-3 text-sm text-muted">The applicant attended their office visit. Finalize the lease to give {{ item.user?.username ?? 'the applicant' }} the stall and switch their account to current tenant.</p>
          </div>

          <div v-if="item.kind === 'application' && (item.evaluation || item.recommendation)" class="mt-4 grid gap-3 sm:grid-cols-2">
            <div v-if="item.evaluation" class="rounded-lg bg-primary/5 px-3 py-2">
              <p class="text-xs font-semibold uppercase tracking-wide text-muted">Evaluation</p>
              <p class="mt-1 text-sm leading-relaxed text-toned">{{ item.evaluation }}</p>
            </div>
            <div v-if="item.recommendation" class="rounded-lg bg-gold-50 px-3 py-2">
              <p class="text-xs font-semibold uppercase tracking-wide text-muted">Recommendation</p>
              <p class="mt-1 text-sm leading-relaxed text-toned">{{ item.recommendation }}</p>
            </div>
          </div>

          <div class="mt-4 flex flex-wrap items-center gap-3 border-t border-default pt-4">
            <span class="text-sm font-medium text-highlighted">Update status:</span>
            <USelect
              :model-value="item.status"
              :items="statusOptions(item)"
              class="w-44"
              :disabled="updating === (item.documentId ?? item.id) || isLeased(item)"
              @update:model-value="(value: unknown) => value && updateStatus(item, String(value))"
            />
            <UButton v-if="item.kind === 'application'" label="Review" icon="i-lucide-clipboard-list" color="primary" variant="subtle" size="sm" @click="openReview(item)" />
            <UButton label="History" icon="i-lucide-history" color="neutral" variant="subtle" size="sm" @click="openHistory(item)" />
          </div>
        </UCard></template>
      </AppRecordTable>
      </template>
    </div>

    <UModal v-model:open="reviewOpen" class="max-w-2xl" title="Review application" description="Record your evaluation, recommendation and next status for this application.">
      <template #body>
        <form class="space-y-4" @submit.prevent="saveReview">
          <UFormField label="Status" required>
            <USelect v-model="reviewForm.status" :items="APPLICATION_STATUS_OPTIONS" />
          </UFormField>
          <UFormField label="Evaluation" description="Assessment of the application against the property's requirements.">
            <UTextarea v-model="reviewForm.evaluation" :rows="3" placeholder="e.g. Applicant's business plan is viable; financial capacity is adequate." />
          </UFormField>
          <UFormField label="Recommendation">
            <UTextarea v-model="reviewForm.recommendation" :rows="2" placeholder="e.g. Recommend approval pending background check." />
          </UFormField>
          <UAlert v-if="reviewError" color="error" icon="i-lucide-triangle-alert" :description="reviewError" />
          <div class="flex justify-end gap-2">
            <UButton label="Cancel" color="neutral" variant="ghost" :disabled="reviewSaving" @click="reviewOpen = false" />
            <UButton data-prominent="true" type="submit" :loading="reviewSaving">Save review</UButton>
          </div>
        </form>
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
              <p class="text-xs text-muted"><span class="font-mono">{{ propertyCode(finalizeTarget) }}</span> · {{ finalizeTarget.propertySpace?.building }}</p>
            </div>
          </div>
          <UFormField label="Business name" required>
            <UInput v-model="finalizeForm.businessName" required placeholder="e.g. Campus Bites" :ui="{ root: 'w-full' }" />
          </UFormField>
          <UFormField label="Products / services" description="From the application. Shown on the campus map.">
            <UTextarea v-model="finalizeForm.productsServices" :rows="3" :ui="{ root: 'w-full' }" />
          </UFormField>
          <UFormField label="Operating hours">
            <UInput v-model="finalizeForm.operatingDetails" placeholder="e.g. Mon–Sat 7:00 AM–6:00 PM" :ui="{ root: 'w-full' }" />
          </UFormField>
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField label="Monthly rent (₱)" description="From the stall's listed rent." required>
              <UInput v-model="finalizeForm.monthlyRent" type="number" min="1" step="0.01" required :ui="{ root: 'w-full' }" />
            </UFormField>
            <UFormField label="Start date" required>
              <UInput v-model="finalizeForm.startDate" type="date" required :ui="{ root: 'w-full' }" />
            </UFormField>
          </div>
          <UAlert color="info" variant="subtle" icon="i-lucide-info" title="What happens next">
            <template #description>
              <ul class="mt-1 list-disc space-y-0.5 pl-4 text-sm">
                <li>An active tenancy is created and the stall is marked Occupied on the map.</li>
                <li>{{ finalizeTarget.user?.username ?? 'The applicant' }}'s account switches to current tenant. They are signed out and get a notification to sign in again.</li>
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
