<script setup lang="ts">
import { activeDashboardQueues, canPresentAllClear } from '~/utils/dashboardPresentation'
type CountResponse<T> = { data: T[]; meta?: { pagination?: { total?: number } } }
type ListResponse<T> = { data: T[] }

type Tenancy = {
  documentId?: string
  status?: string
  endDate?: string
  monthlyRent?: number | string
  user?: { username?: string } | null
  propertySpace?: { name?: string; propertyCode?: string } | null
}

type Property = {
  id: number | string
  space_status?: 'Vacant' | 'Occupied'
}

type Bill = {
  id: number | string
  documentId?: string
  period?: string
  amount: number | string
  status?: 'Unpaid' | 'For Verification' | 'Verified' | 'Rejected' | 'Overdue'
  dueDate?: string
  overdueFlag?: boolean
  reviewFlags?: string[]
  tenancy?: {
    propertySpace?: { name?: string } | null
    user?: { username?: string } | null
  } | null
}

type Announcement = {
  id: number | string
  documentId?: string
  title: string
  body?: string
  audience?: string
  pinned?: boolean
  publishedAt?: string
  publishAt?: string
  expireAt?: string
  createdAt?: string
}

const auth = useAuth()
const { baseURL } = useStrapi()
const headers = {}

const { data: summaryResponse, status: summaryStatus, error: summaryError, refresh: refreshSummary } = await useFetch<any>('/api/dashboard/oas-summary', { baseURL, headers })
const { data: summary } = useRequestPresentation(summaryResponse, summaryStatus)
const propertyDataStatus = summaryStatus, propertyDataError = summaryError, refreshPropertyData = refreshSummary
const tenancyDataStatus = summaryStatus, tenancyDataError = summaryError, refreshTenancyData = refreshSummary
const applicationDataStatus = summaryStatus, applicationDataError = summaryError, refreshApplicationData = refreshSummary
const ticketDataStatus = summaryStatus, ticketDataError = summaryError, refreshTicketData = refreshSummary
const feedbackDataStatus = summaryStatus, feedbackDataError = summaryError, refreshFeedbackData = refreshSummary
const readingDataStatus = summaryStatus, readingDataError = summaryError, refreshReadingData = refreshSummary
const { data: billDataResponse, status: billDataStatus, error: billDataError, refresh: refreshBillData } = await useFetch<ListResponse<Bill>>('/api/bills', { baseURL, headers, query: { sort: 'createdAt:desc', 'pagination[pageSize]': 4, 'populate[tenancy][populate][user]': true, 'populate[tenancy][populate][propertySpace]': true } })
const { data: billData } = useRequestPresentation(billDataResponse, billDataStatus)
const { data: announcementDataResponse, status: announcementDataStatus, refresh: refreshAnnouncementData, error: announcementDataError } = await useFetch<ListResponse<Announcement>>('/api/announcements', {
  baseURL,
  headers,
  query: { sort: 'pinned:desc,publishedAt:desc', 'pagination[pageSize]': 5 }
})
const { data: announcementData } = useRequestPresentation(announcementDataResponse, announcementDataStatus)

const properties = computed(() => [])
const occupiedSpaces = computed(() => summary.value?.properties?.occupied ?? 0)
const vacantSpaces = computed(() => summary.value?.properties?.vacant ?? 0)
const occupancy = computed(() => (summary.value?.properties?.total > 0 ? Math.round((occupiedSpaces.value / summary.value.properties.total) * 100) : 0))

const tenancies = computed(() => [])
const activeTenancies = computed(() => summary.value?.tenancies?.active ?? 0)
const tenancyCount = computed(() => summary.value?.tenancies?.total ?? 0)

const bills = computed(() => billData.value?.data ?? [])
const unverifiedBills = computed(() => bills.value.filter(bill => bill.status !== 'Verified'))
const verifiedBills = computed(() => bills.value.filter(bill => bill.status === 'Verified'))
const outstandingTotal = computed(() => summary.value?.billing?.outstanding ?? 0)
const collectedTotal = computed(() => summary.value?.billing?.collected ?? 0)

const applications = computed(() => [])
const pendingApplications = computed(() => summary.value?.applications?.pending ?? 0)

const tickets = computed(() => [])
const activeTickets = computed(() => summary.value?.maintenance?.active ?? 0)

const feedbacks = computed(() => [])
const unreviewedFeedback = computed(() => summary.value?.feedback?.unreviewed ?? 0)

const utilitySubmissions = computed(() => summary.value?.readings ?? 0)

const announcements = computed(() => announcementData.value?.data ?? [])
const announcementCount = computed(() => summary.value?.announcements ?? 0)

const todayDate = () => {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  return date
}

const isOverdue = (bill: Bill) => {
  if (bill.status === 'Verified' || !bill.dueDate) return false
  if (bill.status === 'Overdue' || bill.overdueFlag) return true
  const due = new Date(bill.dueDate + 'T00:00:00')
  return due < todayDate()
}

const overdueBills = computed(() => bills.value.filter(isOverdue))
const overdueAccounts = computed(() => summary.value?.billing?.overdueAccounts ?? 0)
const overdueTotal = computed(() => summary.value?.billing?.overdueTotal ?? 0)

const expiringContracts = computed(() => summary.value?.tenancies?.expiring ?? [])

const cards = computed(() => [
  { label: 'Occupied spaces', value: occupiedSpaces.value, icon: 'i-lucide-store', to: '/admin/properties', accent: 'bg-maroon-100 text-maroon-800', sub: `${vacantSpaces.value} vacant` },
  { label: 'Pending applications', value: pendingApplications.value, icon: 'i-lucide-clipboard-list', to: '/admin/applications?status=unanswered', accent: 'bg-gold-100 text-gold-700', sub: `${summary.value?.applications?.total ?? 0} total` },
  { label: 'Receipts for verification', value: summary.value?.billing?.forVerification ?? 0, icon: 'i-lucide-file-check-2', to: '/admin/bills?status=For%20Verification', accent: 'bg-gold-50 text-gold-700', sub: 'awaiting review' },
  { label: 'Overdue accounts', value: overdueAccounts.value, icon: 'i-lucide-triangle-alert', to: '/admin/bills?overdue=true', accent: 'bg-maroon-50 text-maroon-700', sub: `${formatCurrency(overdueTotal.value)} due` },
  { label: 'Active maintenance tickets', value: activeTickets.value, icon: 'i-lucide-wrench', to: '/admin/maintenance', accent: 'bg-maroon-50 text-maroon-800', sub: `${summary.value?.maintenance?.total ?? 0} total` },
  { label: 'Unreviewed feedback', value: unreviewedFeedback.value, icon: 'i-lucide-message-square-text', to: '/admin/feedback?unreviewed=true', accent: 'bg-gold-100 text-gold-700', sub: 'needs action' },
  { label: 'Utility Readings', value: utilitySubmissions.value, icon: 'i-lucide-gauge', to: '/admin/bills', accent: 'bg-maroon-100 text-maroon-800', sub: 'recorded readings' },
  { label: 'Tenancies', value: tenancyCount.value, icon: 'i-lucide-key-round', to: '/admin/tenancies', accent: 'bg-gold-50 text-gold-700', sub: `${activeTenancies.value} active` },
  { label: 'Announcements', value: announcementCount.value, icon: 'i-lucide-megaphone', to: '/admin/announcements', accent: 'bg-maroon-50 text-maroon-800', sub: 'recorded' }
])

const recentBills = computed(() => bills.value.slice(0, 4))
const recentAnnouncements = computed(() => announcements.value.slice(0, 3))

const dashboardNow = useState('dashboard-now', () => new Date().toISOString())
const attentionCards = computed(() => activeDashboardQueues([
  { ...cards.value[3]!, priority: 1, tone: 'error' as const, action: 'Review overdue bills' },
  { ...cards.value[2]!, priority: 2, tone: 'warning' as const, action: 'Verify receipts' },
  { ...cards.value[4]!, priority: 3, tone: 'warning' as const, action: 'Review maintenance' },
  { ...cards.value[1]!, priority: 4, tone: 'neutral' as const, action: 'Review applications' },
  { ...cards.value[5]!, priority: 5, tone: 'neutral' as const, action: 'Review feedback' }
]))
const summaryCards = computed(() => cards.value.filter((_, index) => [0, 6, 7, 8].includes(index)))
const summaryActions: Record<string, string> = { 'Occupied spaces': 'View property spaces', 'Utility Readings': 'View bills', Tenancies: 'View tenancies', Announcements: 'View announcements' }

const formatCurrency = (amount?: number | string) => amount == null || amount === ''
  ? '—'
  : new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 }).format(Number(amount))

const formatDate = (value?: string) => value
  ? new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  : ''

const statusColor = (status?: string) => {
  switch (status) {
    case 'Verified': return 'success'
    case 'For Verification': return 'warning'
    case 'Rejected': return 'error'
    case 'Overdue': return 'error'
    default: return 'warning'
  }
}

const audienceColor = (audience?: string) => {
  switch (audience) {
    case 'Students': return 'secondary'
    case 'Tenants': return 'primary'
    default: return 'neutral'
  }
}
const dashboardRefreshing = computed(() => propertyDataStatus.value === 'pending' || tenancyDataStatus.value === 'pending' || billDataStatus.value === 'pending' || applicationDataStatus.value === 'pending' || announcementDataStatus.value === 'pending' || ticketDataStatus.value === 'pending' || feedbackDataStatus.value === 'pending' || readingDataStatus.value === 'pending')
const dashboardRefreshFailed = computed(() => !!propertyDataError.value || !!tenancyDataError.value || !!billDataError.value || !!applicationDataError.value || !!announcementDataError.value || !!ticketDataError.value || !!feedbackDataError.value || !!readingDataError.value)
const refreshAll = () => Promise.all([refreshSummary(), refreshBillData(), refreshAnnouncementData()])
const dashboard = useDashboardPresentation([propertyDataStatus, tenancyDataStatus, billDataStatus, applicationDataStatus, announcementDataStatus, ticketDataStatus, feedbackDataStatus, readingDataStatus])
</script>

<template>
  <div class="oas-dashboard">
    <AppPageHeader eyebrow="Management">
      <template #title>Office of Auxiliary Services</template>
      <template #description>Monitor campus stalls, rental applications, tenant accounts, and operational requests.</template>

      <template #actions><UButton label="Refresh" icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="dashboardRefreshing" @click="refreshAll" /></template>
    </AppPageHeader>
    <AppRefreshState :refreshing="dashboard.loaded.value && dashboardRefreshing" :failed="dashboard.loaded.value && dashboardRefreshFailed" @retry="refreshAll" />
    <AppLoadingState v-if="dashboard.loading.value" :count="4" height="h-36" />
    <UAlert v-else-if="dashboard.failed.value" color="error" icon="i-lucide-triangle-alert" title="Unable to load the dashboard" description="Some records are unavailable. Retry to load the overview."><template #actions><UButton label="Retry" color="neutral" variant="outline" @click="refreshAll" /></template></UAlert>
    <template v-else>

    <section aria-labelledby="oas-attention-title">
      <h2 id="oas-attention-title" class="mb-3 text-base font-semibold text-highlighted">Requires Attention</h2>
      <div v-if="canPresentAllClear(attentionCards.length, dashboardRefreshing, dashboardRefreshFailed)" class="flex items-start gap-3 rounded-xl border border-default bg-default px-5 py-4">
        <span class="grid size-9 shrink-0 place-items-center rounded-lg bg-success/10 text-success"><UIcon name="i-lucide-check-circle-2" class="size-5" aria-hidden="true" /></span>
        <div><h3 class="text-sm font-semibold text-highlighted">All clear</h3><p class="mt-1 text-sm text-muted">No pending items require attention.</p></div>
      </div>
      <UAlert v-else-if="!attentionCards.length" color="neutral" icon="i-lucide-info" :title="dashboardRefreshing ? 'Checking pending items…' : 'Pending items could not be confirmed'" description="The last available records remain below. All-clear status requires every data source to load successfully." />
      <div v-else class="grid gap-3 sm:grid-cols-2" :class="attentionCards.length >= 3 ? 'xl:grid-cols-3' : ''">
        <DashboardMetricCard v-for="(card, index) in attentionCards" :key="card.label" v-bind="card" :class="attentionCards.length === 5 && index === 0 ? 'sm:col-span-2' : ''" />
      </div>
    </section>
    <section class="mt-8" aria-labelledby="oas-overview-title"><h2 id="oas-overview-title" class="mb-3 text-base font-semibold text-highlighted">Campus Operations Overview</h2><div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <AppMotionReveal v-for="(card, index) in summaryCards" :key="card.to + card.label" :index="index" >
        <DashboardMetricCard v-bind="card" :action="summaryActions[card.label] ?? 'Open workspace'" />
      </AppMotionReveal>
    </div></section>
    <section class="mt-8" aria-labelledby="oas-reports-title">
    <h2 id="oas-reports-title" class="mb-3 text-base font-semibold text-highlighted">Reports and recent activity</h2>

    <div class="grid gap-4 lg:grid-cols-3">
      <UCard :ui="{ body: 'p-5' }">
        <template #header>
          <h3 class="text-base font-semibold text-highlighted">Operational Summary</h3>
        </template>
        <dl class="space-y-5">
          <div>
            <div class="flex items-center justify-between text-sm">
              <dt class="flex items-center gap-1.5 text-muted"><UIcon name="i-lucide-clock-3" class="size-4" :class="outstandingTotal > 0 ? 'text-warning' : 'text-muted'" aria-hidden="true" />Outstanding</dt>
              <dd class="font-semibold" :class="outstandingTotal > 0 ? 'text-warning' : 'text-highlighted'">{{ formatCurrency(outstandingTotal) }}</dd>
            </div>
            <p class="mt-0.5 text-xs text-muted">{{ unverifiedBills.length }} unverified bill{{ unverifiedBills.length === 1 ? '' : 's' }}</p>
          </div>
          <div>
            <div class="flex items-center justify-between text-sm">
              <dt class="flex items-center gap-1.5 text-muted"><UIcon name="i-lucide-badge-check" class="size-4 text-success" aria-hidden="true" />Collected</dt>
              <dd class="font-semibold text-success">{{ formatCurrency(collectedTotal) }}</dd>
            </div>
            <p class="mt-0.5 text-xs text-muted">{{ verifiedBills.length }} verified bill{{ verifiedBills.length === 1 ? '' : 's' }}</p>
          </div>
          <div>
            <div class="flex items-center justify-between text-sm">
              <dt class="flex items-center gap-1.5 text-muted"><UIcon name="i-lucide-store" class="size-4 text-primary" />Occupancy</dt>
              <dd class="font-semibold text-highlighted">{{ occupancy }}%</dd>
            </div>
            <UProgress :model-value="occupancy" aria-label="Occupied property spaces" class="mt-2" />
            <p class="mt-1 text-xs text-muted">{{ occupiedSpaces }} of {{ properties.length }} spaces occupied</p>
          </div>
        </dl>
      </UCard>

      <UCard :ui="{ body: 'p-0' }">
        <template #header>
          <div class="flex items-center justify-between">
            <h3 class="text-base font-semibold text-highlighted">Recent bills</h3>
            <NuxtLink to="/admin/bills" aria-label="View all bills" class="inline-flex items-center gap-1 text-sm font-medium text-toned hover:underline">View all<UIcon name="i-lucide-arrow-right" class="size-3.5" aria-hidden="true" /></NuxtLink>
          </div>
        </template>
        <ul v-if="recentBills.length" class="divide-y divide-default">
          <li v-for="bill in recentBills" :key="bill.documentId ?? bill.id">
            <NuxtLink to="/admin/bills" class="block space-y-2 px-5 py-4 transition-colors hover:bg-elevated" :aria-label="`Review bill for ${bill.period || 'billing period'}, ${formatCurrency(bill.amount)}`">
              <div class="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                <p class="text-sm font-medium text-highlighted">{{ bill.period || 'Billing period' }}</p>
                <span class="text-sm font-semibold tabular-nums text-highlighted">{{ formatCurrency(bill.amount) }}</span>
              </div>
              <p class="text-sm text-muted">{{ bill.tenancy?.propertySpace?.name ?? bill.tenancy?.user?.username ?? '—' }}</p>
              <div class="flex flex-wrap items-center gap-2">
                <UBadge v-if="isOverdue(bill) && bill.status !== 'Overdue'" color="error" variant="subtle">Overdue</UBadge>
                <UBadge :color="statusColor(bill.status)" variant="subtle">{{ bill.status }}</UBadge>
                <UIcon name="i-lucide-chevron-right" class="ml-auto size-4 shrink-0 text-muted" aria-hidden="true" />
              </div>
            </NuxtLink>
          </li>
        </ul>
        <p v-else class="px-5 py-6 text-sm text-muted">No bills yet.</p>
      </UCard>

      <UCard :ui="{ body: 'p-0' }">
        <template #header>
          <div class="flex items-center justify-between">
            <h3 class="text-base font-semibold text-highlighted">Contract Expirations</h3>
            <NuxtLink to="/admin/tenancies" aria-label="View all tenancies" class="inline-flex items-center gap-1 text-sm font-medium text-toned hover:underline">View all<UIcon name="i-lucide-arrow-right" class="size-3.5" aria-hidden="true" /></NuxtLink>
          </div>
        </template>
        <ul v-if="expiringContracts.length" class="divide-y divide-default">
          <li v-for="tenancy in expiringContracts.slice(0, 5)" :key="tenancy.documentId">
            <NuxtLink to="/admin/tenancies" class="flex flex-wrap items-start justify-between gap-3 px-5 py-4 transition-colors hover:bg-elevated">
              <div class="min-w-0">
                <p class="text-sm font-medium text-highlighted">{{ tenancy.user?.username ?? 'Tenant' }}</p>
                <p class="mt-1 text-sm text-muted">{{ tenancy.propertySpace?.name ?? 'Space' }}</p>
              </div>
              <span class="shrink-0 text-xs font-medium text-warning">{{ formatDate(tenancy.endDate) }}</span>
            </NuxtLink>
          </li>
        </ul>
        <p v-else class="px-5 py-6 text-sm text-muted">No contracts expiring within 30 days.</p>
      </UCard>
    </div>

    <UCard class="mt-4">
      <template #header>
          <h3 class="text-base font-semibold text-highlighted">Quick actions</h3>
      </template>
      <div class="flex flex-wrap gap-3">
        <UButton to="/admin/properties" icon="i-lucide-plus" label="Add property space" />
        <UButton to="/admin/tenancies" icon="i-lucide-key-round" label="Create tenancy" color="neutral" variant="subtle" />
        <UButton to="/admin/bills" icon="i-lucide-receipt" label="Issue bill" color="neutral" variant="subtle" />
        <UButton to="/admin/announcements" icon="i-lucide-megaphone" label="New announcement" color="neutral" variant="subtle" />
      </div>
    </UCard>
    </section>
    </template>
  </div>
</template>

<style scoped>
.oas-dashboard { --ui-success: var(--color-green-700); --ui-warning: var(--color-amber-700); --ui-error: var(--color-red-700); }
:global(.dark) .oas-dashboard { --ui-success: var(--color-green-400); --ui-warning: var(--color-amber-300); --ui-error: var(--color-red-400); }
</style>
