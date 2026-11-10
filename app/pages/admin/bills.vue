<script setup lang="ts">
import { createReusableTemplate } from '@vueuse/core'

definePageMeta({
  middleware: ['auth', 'role'],
  roles: ['oas']
})

type BillStatus = 'Unpaid' | 'For Verification' | 'Verified' | 'Rejected' | 'Overdue' | 'Void'
type ReceiptFile = { id: number; url?: string; name?: string }
type LinkedBill = { documentId?: string; period?: string; status?: BillStatus; amount?: number | string } | null

type Bill = {
  id: number | string
  documentId?: string
  period?: string
  amount: number | string
  rentCharge?: number | string | null
  electricMeterPrevious?: number | string
  electricMeterCurrent?: number | string
  electricRate?: number | string
  electricCharge?: number | string
  waterMeterPrevious?: number | string
  waterMeterCurrent?: number | string
  waterRate?: number | string
  waterCharge?: number | string
  additionalCharges?: number | string
  dueDate?: string
  overdueFlag?: boolean
  reviewFlags?: string[]
  status: BillStatus
  verificationNote?: string
  paidAt?: string
  orNumber?: string
  orSource?: 'ocr' | 'manual' | null
  receipt?: ReceiptFile | null
  // Every receipt ever submitted for this bill, kept as payment evidence.
  receiptHistory?: ReceiptFile[] | null
  voidReason?: string | null
  voidedAt?: string | null
  correctionOf?: LinkedBill
  correction?: LinkedBill
  tenancy?: {
    documentId?: string
    monthlyRent?: number | string
    user?: { id: number; username?: string } | null
    propertySpace?: { documentId?: string; name?: string; propertyCode?: string } | null
  } | null
}

type ListResponse<T> = { data: T[] }

type Utility = { previous: number | null; current: number | null; rate: number | null; consumption: number | null; charge: number | null }

// What the server would put on a bill for a tenancy and period: rent and the
// utility charges saved with the stall's meter reading.
type ChargePreview = {
  period: string
  stall: { documentId?: string; name?: string; propertyCode?: string } | null
  rent: number
  reading: { documentId: string; readingDate?: string | null; period?: string | null } | null
  electric: Utility
  water: Utility
  utilities: number
  subtotal: number
  dueDate: string
  existingBill: { documentId: string; status: string; period: string } | null
  // Why the tenancy cannot be billed (a vacant stall or an ended tenancy).
  notBillable?: string | null
}

useHead({ title: 'Manage Bills | iMapSU' })

const notify = useNotify()
const { baseURL, $api, getErrorMessage } = useStrapi()
const headers = {}

const filterSearch = ref('')
const filterTenancy = ref('all')
const filterStatus = ref('All')
const filterPeriod = ref('')
const recordsPage = useRecordPage(["period","orNumber","tenancy.propertySpace.name","tenancy.propertySpace.propertyCode","tenancy.user.username"], { tenancy: { ref: filterTenancy, field: 'tenancy.documentId' }, status: { ref: filterStatus, field: 'status' }, period: { ref: filterPeriod, field: 'period', operation: '$containsi' } }, filterSearch)
const { data: responseData, status, error, refresh } = await useFetch<ListResponse<Bill>>('/api/bills', { lazy: true,
  baseURL,
  headers,
  query: computed(() => ({
    'populate[tenancy][populate][propertySpace]': true,
    'populate[tenancy][populate][user][populate][avatar]': true,
    'populate[receipt]': true,
    'populate[receiptHistory]': true,
    'populate[correctionOf][fields][0]': 'period',
    'populate[correctionOf][fields][1]': 'status',
    'populate[correctionOf][fields][2]': 'amount',
    'populate[correction][fields][0]': 'period',
    'populate[correction][fields][1]': 'status',
    'populate[correction][fields][2]': 'amount',
    sort: 'period:desc', ...recordsPage.query.value }))
})
const { data, hasLoaded, isInitialLoading, isRefreshing, isInitialError } = useRequestPresentation(responseData, status)


const { data: tenancyData } = await useCompleteFetch<ListResponse<{ documentId: string; status: string; monthlyRent?: number | string; user?: { username?: string } | null; propertySpace?: { name?: string; propertyCode?: string } | null }>>('/api/tenancies', { lazy: true,
  baseURL,
  headers,
  query: { 'populate[user]': true, 'populate[propertySpace]': true, 'pagination[pageSize]': 100 }
})

const { data: billingSummaryResponse, status: billingSummaryStatus, error: billingSummaryError, refresh: refreshBillingSummary } = await useFetch<any>('/api/dashboard/billing-summary', { lazy: true, baseURL, headers })
const { data: billingSummary } = useRequestPresentation(billingSummaryResponse, billingSummaryStatus)
// The first lazy response arrives alongside the summary request, so only later list changes refresh it.
watch(responseData, (_next, previous) => { if (previous) refreshBillingSummary() })
const bills = computed(() => data.value?.data ?? [])
const tenancyOptions = computed(() => (tenancyData.value?.data ?? []).map(tenancy => ({
  label: `${tenancy.propertySpace?.name ?? 'Property'} — ${tenancy.user?.username ?? 'No user'}`,
  value: tenancy.documentId
})))
const filterTenancyOptions = computed(() => [{ label: 'All tenants', value: 'all' }, ...tenancyOptions.value])


const filteredBills = computed(() => {
  const query = filterSearch.value.trim().toLowerCase()
  return bills.value.filter(bill => {
    if (filterTenancy.value !== 'all' && bill.tenancy?.documentId !== filterTenancy.value) return false
    if (filterStatus.value !== 'All' && bill.status !== filterStatus.value) return false
    if (filterPeriod.value.trim() && !(bill.period ?? '').toLowerCase().includes(filterPeriod.value.trim().toLowerCase())) return false
    if (query) {
      const haystack = [bill.period, bill.orNumber, bill.tenancy?.propertySpace?.name, bill.tenancy?.propertySpace?.propertyCode, bill.tenancy?.user?.username].join(' ').toLowerCase()
      if (!haystack.includes(query)) return false
    }
    return true
  })
})

const filterCount = computed(() => {
  let count = 0
  if (filterTenancy.value !== 'all') count++
  if (filterStatus.value !== 'All') count++
  if (filterPeriod.value.trim()) count++
  if (filterSearch.value.trim()) count++
  return count
})

const clearFilters = () => {
  filterTenancy.value = 'all'
  filterStatus.value = 'All'
  filterPeriod.value = ''
  filterSearch.value = ''
}

const toggleVerificationFilter = () => {
  filterStatus.value = filterStatus.value === 'For Verification' ? 'All' : 'For Verification'
}

const STATUS_FILTER_OPTIONS = [
  { label: 'All statuses', value: 'All' },
  { label: 'Unpaid', value: 'Unpaid' },
  { label: 'For Verification', value: 'For Verification' },
  { label: 'Verified', value: 'Verified' },
  { label: 'Rejected', value: 'Rejected' },
  { label: 'Overdue', value: 'Overdue' },
  { label: 'Void', value: 'Void' }
]

const isVerified = (bill: Bill) => bill.status === 'Verified'
const isVoid = (bill: Bill) => bill.status === 'Void'

const isOverdue = (bill: Bill) => {
  if (isVerified(bill) || isVoid(bill) || !bill.dueDate) return false
  if (bill.status === 'Overdue' || bill.overdueFlag) return true
  const due = new Date(bill.dueDate + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return due < today
}

const outstandingTotal = computed(() => billingSummary.value?.outstanding ?? null)
const collectedTotal = computed(() => billingSummary.value?.collected ?? null)
const overdueTotal = computed(() => billingSummary.value?.overdueTotal ?? null)

const formatCurrency = (amount?: number | string | null) => amount == null || amount === ''
  ? '—'
  : new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 2 }).format(Number(amount))

const formatDate = (value?: string) => value
  ? new Date(value + 'T00:00:00').toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  : ''

const formatDateTime = (value?: string | null) => value
  ? new Date(value).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  : ''

// Bills keep the rent they were issued with. Older bills hold it inside the total.
const billRent = (bill: Bill) => {
  if (bill.rentCharge != null && bill.rentCharge !== '') return Number(bill.rentCharge)
  const electric = Number(bill.electricCharge ?? 0)
  const water = Number(bill.waterCharge ?? 0)
  const additional = Number(bill.additionalCharges ?? 0)
  const derived = Number(bill.amount) - electric - water - additional
  return derived > 0 ? derived : 0
}

const usage = (previous?: number | string, current?: number | string) => {
  const prev = Number(previous ?? 0)
  const curr = Number(current ?? 0)
  if (previous == null || current == null || previous === '' || current === '' || curr < prev) return 0
  return curr - prev
}

const statusColor = (bill: Bill) => {
  switch (bill.status) {
    case 'Verified': return 'success'
    case 'Rejected':
    case 'Overdue': return 'error'
    case 'For Verification': return 'warning'
    case 'Void': return 'neutral'
    default: return 'secondary'
  }
}

const billKey = (bill: Bill) => String(bill.documentId ?? bill.id)
const billLabel = (bill: Bill) => `${formatCurrency(bill.amount)} bill${bill.period ? ` for ${formatPeriod(bill.period)}` : ''}`

// ------------------------------------------------------------ what each status allows
// An issued bill is read-only. The OAS reviews the receipts tenants submit and
// voids a wrong bill so a corrected one can be issued. The API enforces the
// same rules.
const awaitsPayment = (bill: Bill) => ['Unpaid', 'Overdue', 'Rejected'].includes(bill.status)
const canVoid = awaitsPayment
const canCorrect = (bill: Bill) => isVoid(bill) && !bill.correction?.documentId

// Receipts the tenant submitted before the current one (or before it was removed).
const earlierReceipts = (bill: Bill) => (bill.receiptHistory ?? []).filter(file => file.id !== bill.receipt?.id)

const billMenuItems = (bill: Bill) => [
  [
    { label: 'View bill', icon: 'i-lucide-file-text', onSelect: () => openView(bill) },
    ...(bill.receipt ? [{ label: 'View receipt', icon: 'i-lucide-image', onSelect: () => viewReceipt(bill.receipt) }] : []),
    { label: 'History', icon: 'i-lucide-history', onSelect: () => openHistory(bill) }
  ],
  ...(canVoid(bill) ? [[{ label: 'Void bill', icon: 'i-lucide-ban', color: 'error' as const, onSelect: () => openVoid(bill) }]] : [])
]

const billContext = (bill: Bill) => [
  bill.tenancy?.user?.username ? bill.tenancy?.propertySpace?.name : null,
  bill.status === 'For Verification' && bill.orNumber ? `OR ${bill.orNumber}` : null,
  bill.status === 'For Verification' && !bill.receipt ? 'No receipt picture' : null,
  bill.status === 'For Verification' && !bill.orNumber ? 'No receipt number' : null,
  bill.correctionOf?.documentId ? 'Corrected bill' : null,
  isVoid(bill) && bill.correction?.documentId ? 'Corrected bill issued' : null
].filter(Boolean).join(' · ')

// Why a bill under review cannot be verified yet, if anything.
const verifyBlocked = (bill: Bill) => {
  if (!bill.receipt) return 'No receipt picture yet. Reject the payment so the tenant can upload one.'
  if (!bill.orNumber) return 'No official receipt number yet. Reject the payment so the tenant can add it.'
  return undefined
}

// ------------------------------------------------------------ issue a bill
const formOpen = ref(false)
// The voided bill a new bill corrects, if any.
const correcting = ref<Bill | null>(null)
const saving = ref(false)
const formError = ref('')
const thisMonth = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7)
const form = reactive({
  tenancy: '',
  period: '',
  additionalCharges: '',
})

const openCreate = () => {
  correcting.value = null
  Object.assign(form, {
    tenancy: '',
    period: thisMonth(),
    additionalCharges: ''
  })
  formError.value = ''
  fallbackTenancy.value = null
  formOpen.value = true
}

// A corrected bill starts from the voided bill's tenancy and period. The
// server works out the charges again; only the additional charges are typed.
const openCorrection = (bill: Bill) => {
  correcting.value = bill
  Object.assign(form, {
    tenancy: bill.tenancy?.documentId ?? '',
    period: bill.period ?? thisMonth(),
    additionalCharges: bill.additionalCharges != null && Number(bill.additionalCharges) !== 0 ? String(bill.additionalCharges) : ''
  })
  formError.value = ''
  fallbackTenancy.value = bill.tenancy ?? null
  viewOpen.value = false
  formOpen.value = true
}

// The lookup shows the corrected bill's tenancy before its search results load.
const fallbackTenancy = ref<Bill['tenancy']>(null)
const tenancyFallback = computed(() => {
  const tenancy = fallbackTenancy.value
  return tenancy?.documentId ? [{ label: `${tenancy.propertySpace?.name ?? 'Property'} — ${tenancy.user?.username ?? 'Tenant'}`, value: tenancy.documentId }, ...tenancyOptions.value] : tenancyOptions.value
})

// Bills go to tenants who hold a stall: active tenancies on occupied stalls.
const billableTenancyQuery = {
  'populate[user]': true,
  'populate[propertySpace]': true,
  'filters[status][$eq]': 'Active',
  'filters[propertySpace][space_status][$eq]': 'Occupied'
}

const validPeriod = (period: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(period.trim())

// The Issue Bill form shows what the server will bill; it never works out
// utility charges itself. Those come from the stall's meter reading.
const preview = ref<ChargePreview | null>(null)
const previewError = ref('')
const loadingPreview = ref(false)
let previewRequest = 0
const loadPreview = async () => {
  const request = ++previewRequest
  preview.value = null
  previewError.value = ''
  if (!formOpen.value || !form.tenancy || !validPeriod(form.period)) {
    loadingPreview.value = false
    return
  }
  loadingPreview.value = true
  try {
    const result = await $api<{ data: ChargePreview }>('/api/bills/charges/preview', {
      query: { tenancy: form.tenancy, period: form.period.trim(), ...(correcting.value?.documentId ? { correctionOf: correcting.value.documentId } : {}) }
    })
    if (request === previewRequest) preview.value = result.data
  } catch (err) {
    if (request === previewRequest) previewError.value = getErrorMessage(err)
  } finally {
    if (request === previewRequest) loadingPreview.value = false
  }
}
watch(() => [formOpen.value, form.tenancy, form.period], loadPreview)

const additionalChargesNum = computed(() => Number(form.additionalCharges) || 0)
const shownRent = computed(() => preview.value?.rent ?? 0)
const shownElectric = computed(() => Number(preview.value?.electric.charge ?? 0))
const shownWater = computed(() => Number(preview.value?.water.charge ?? 0))
const totalAmount = computed(() => Math.round((shownRent.value + shownElectric.value + shownWater.value + additionalChargesNum.value) * 100) / 100)
const duplicateBill = computed(() => preview.value?.existingBill ?? null)
const notBillable = computed(() => preview.value?.notBillable || '')

const formatReadingDate = (value?: string | null) => value
  ? new Date(value + 'T00:00:00').toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  : ''

const formatPeriod = (value?: string | null) => value && validPeriod(value)
  ? new Date(`${value}-01T00:00:00`).toLocaleDateString(undefined, { year: 'numeric', month: 'long' })
  : value || 'this period'

// Bills are always due on the 10th of the month after the billing period, so
// the due date is shown as a fixed preview instead of a picker.
const dueDatePreview = computed(() => preview.value?.dueDate ? formatReadingDate(preview.value.dueDate) : '—')

const save = async () => {
  formError.value = ''
  if (!form.tenancy) {
    formError.value = 'Please choose a tenancy.'
    return
  }
  if (!validPeriod(form.period)) {
    formError.value = 'Please choose the billing period.'
    return
  }
  if (notBillable.value) {
    formError.value = notBillable.value
    return
  }
  if (duplicateBill.value) {
    formError.value = `A bill for ${formatPeriod(form.period)} was already issued to this tenancy.`
    return
  }
  saving.value = true
  try {
    // The server adds rent and the stall's utility charges and works out the
    // total. Every new bill starts Unpaid; the tenant adds the receipt.
    await $api('/api/bills', {
      method: 'POST',
      body: {
        data: {
          tenancy: form.tenancy,
          period: form.period.trim(),
          additionalCharges: Number(additionalChargesNum.value.toFixed(2)),
          ...(correcting.value?.documentId ? { correctionOf: correcting.value.documentId } : {})
        }
      }
    })
    notify.success(correcting.value ? 'Corrected bill issued' : 'Bill issued')
    formOpen.value = false
    await refresh()
  } catch (err) {
    formError.value = getErrorMessage(err)
  } finally {
    saving.value = false
  }
}

// ------------------------------------------------------------ viewing
const [DefineBillSummary, BillSummary] = createReusableTemplate<{ bill: Bill }>()

const viewOpen = ref(false)
const viewKey = ref<string | null>(null)
// Follows the list so the dialog shows fresh data after a refresh.
const viewBill = computed(() => bills.value.find(bill => billKey(bill) === viewKey.value) ?? null)
const openView = (bill: Bill) => {
  viewKey.value = billKey(bill)
  viewOpen.value = true
}
// Opens a linked bill (original or correction) when it is on the current page.
const openLinked = (link: LinkedBill) => {
  const found = bills.value.find(bill => bill.documentId === link?.documentId)
  if (found) openView(found)
  else notify.info('That bill is on another page', { description: `Filter by ${formatPeriod(link?.period)} to find it.` })
}

// Receipts open in a centered viewer on this page instead of a new tab.
const receiptViewerOpen = ref(false)
const viewedReceipt = ref<{ url: string; name?: string | null } | null>(null)
const viewReceipt = (receipt?: ReceiptFile | null) => {
  if (!receipt?.url) return
  viewedReceipt.value = { url: receipt.url, name: receipt.name }
  receiptViewerOpen.value = true
}
// The history modal mounts after the viewer and would cover it.
const viewHistoryReceipt = (receipt: { url: string; name?: string | null }) => {
  historyOpen.value = false
  viewedReceipt.value = { url: receipt.url, name: receipt.name }
  receiptViewerOpen.value = true
}

const historyOpen = ref(false)
const historyTarget = ref<{ type: 'bill'; id: string; label: string } | null>(null)

const openHistory = (bill: Bill) => {
  historyTarget.value = {
    type: 'bill',
    id: billKey(bill),
    label: `${bill.period || 'Bill'} — ${bill.tenancy?.propertySpace?.name ?? 'bill'}`
  }
  historyOpen.value = true
}

// ------------------------------------------------------------ payment workflow
const workflowBusy = ref<string | null>(null)
const isBusy = (bill: Bill) => workflowBusy.value === billKey(bill)

// One workflow step on the server: verify, reject or void.
const runStep = async (bill: Bill, step: 'verify' | 'reject' | 'void', data: Record<string, unknown> = {}) => {
  workflowBusy.value = billKey(bill)
  try {
    const result = await $api<{ data: Bill }>(`/api/bills/${billKey(bill)}/${step}`, { method: 'POST', body: { data } })
    await refresh()
    return result
  } finally {
    workflowBusy.value = null
  }
}

const verifyOpen = ref(false)
const verifyTarget = ref<Bill | null>(null)
const verifyError = ref('')

const verifyBill = (bill: Bill) => {
  verifyTarget.value = bill
  verifyError.value = ''
  verifyOpen.value = true
}

const confirmVerify = async () => {
  const bill = verifyTarget.value
  if (!bill) return
  verifyError.value = ''
  try {
    await runStep(bill, 'verify')
    notify.success('Payment verified')
    verifyOpen.value = false
  } catch (err) {
    verifyError.value = getErrorMessage(err)
  }
}

const rejectOpen = ref(false)
const rejectTarget = ref<Bill | null>(null)
const rejectReason = ref('')
const rejectError = ref('')

const openReject = (bill: Bill) => {
  rejectTarget.value = bill
  rejectReason.value = bill.receipt ? '' : 'Please upload a clear picture of your official receipt.'
  rejectError.value = ''
  rejectOpen.value = true
}

const confirmReject = async () => {
  const bill = rejectTarget.value
  if (!bill) return
  const reason = rejectReason.value.trim()
  rejectError.value = reason ? '' : 'Give the reason for rejecting this payment.'
  if (rejectError.value) return
  try {
    await runStep(bill, 'reject', { reason })
    notify.info('Payment rejected', { description: 'The tenant was told why and can upload a corrected receipt.' })
    rejectOpen.value = false
  } catch (err) {
    rejectError.value = getErrorMessage(err)
  }
}

// Voiding cancels a wrong bill but keeps it on record. A corrected bill can be
// issued straight after, linked to it.
const voidOpen = ref(false)
const voidTarget = ref<Bill | null>(null)
const voidReason = ref('')
const voidThenCorrect = ref(true)
const voidError = ref('')

const openVoid = (bill: Bill) => {
  voidTarget.value = bill
  voidReason.value = ''
  voidThenCorrect.value = true
  voidError.value = ''
  voidOpen.value = true
}

const confirmVoid = async () => {
  const bill = voidTarget.value
  if (!bill) return
  const reason = voidReason.value.trim()
  voidError.value = reason ? '' : 'Give the reason for voiding this bill.'
  if (voidError.value) return
  try {
    const result = await runStep(bill, 'void', { reason })
    notify.info('Bill voided', { description: 'It stays on record with your reason.' })
    voidOpen.value = false
    if (voidThenCorrect.value) openCorrection({ ...bill, ...(result?.data ?? {}), status: 'Void', tenancy: bill.tenancy })
  } catch (err) {
    voidError.value = getErrorMessage(err)
  }
}

const recordColumns = [
 { key: 'period', label: 'Period', value: (bill: Bill) => bill.period || 'Billing period' },
 { key: 'tenant', label: 'Tenant / space', value: (bill: Bill) => bill.tenancy?.user?.username || bill.tenancy?.propertySpace?.name || '—' },
 { key: 'amount', label: 'Total', value: (bill: Bill) => formatCurrency(bill.amount) },
 { key: 'due', label: 'Due', value: (bill: Bill) => formatDate(bill.dueDate) || '—' },
 { key: 'status', label: 'Status', value: (bill: Bill) => bill.status || 'Unknown', badge: true, color: (bill: Bill) => statusColor(bill) }
]
</script>

<template>
  <main class="imapsu-page imapsu-page--admin">
    <!-- The read-only bill, shared by the row details, the phone cards and the View bill dialog. -->
    <DefineBillSummary v-slot="{ bill }">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <p class="font-medium text-highlighted">{{ bill.period || 'Billing period' }}</p>
          <p v-if="bill.tenancy" class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
            <span v-if="bill.tenancy.propertySpace">{{ bill.tenancy.propertySpace.name }} <span>({{ bill.tenancy.propertySpace.propertyCode }})</span></span>
            <span v-if="bill.tenancy.user" class="flex items-center gap-1.5"><AppUserAvatar :user="bill.tenancy.user" />{{ bill.tenancy.user.username }}</span>
          </p>
        </div>
        <div class="flex items-center gap-2">
          <UBadge v-if="isOverdue(bill) && bill.status !== 'Overdue'" color="error" variant="solid">Overdue</UBadge>
          <UBadge :color="statusColor(bill)" variant="subtle">{{ bill.status }}</UBadge>
        </div>
      </div>

      <UAlert v-if="isVoid(bill)" class="mt-4" color="neutral" variant="subtle" icon="i-lucide-ban" title="Voided" :description="`${bill.voidReason || 'No reason recorded.'}${bill.voidedAt ? ` · ${formatDateTime(bill.voidedAt)}` : ''}`">
        <template v-if="bill.correction?.documentId" #actions>
          <UButton :label="`Corrected bill · ${formatCurrency(bill.correction.amount)}`" icon="i-lucide-arrow-right" color="neutral" variant="outline" size="xs" @click="openLinked(bill.correction)" />
        </template>
      </UAlert>
      <UAlert v-if="bill.correctionOf?.documentId" class="mt-4" color="info" variant="subtle" icon="i-lucide-file-pen-line" title="Corrected bill" :description="`Replaces a voided ${formatCurrency(bill.correctionOf.amount)} bill for ${formatPeriod(bill.correctionOf.period)}.`">
        <template #actions>
          <UButton label="Original bill" icon="i-lucide-arrow-left" color="neutral" variant="outline" size="xs" @click="openLinked(bill.correctionOf)" />
        </template>
      </UAlert>

      <dl class="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
        <div><dt class="text-xs text-muted">Total</dt><dd class="font-semibold text-highlighted" :class="{ 'line-through decoration-muted': isVoid(bill) }">{{ formatCurrency(bill.amount) }}</dd></div>
        <div><dt class="text-xs text-muted">Rent</dt><dd class="font-medium text-highlighted">{{ formatCurrency(billRent(bill)) }}</dd></div>
        <div><dt class="text-xs text-muted">Electric</dt><dd class="font-medium text-highlighted">{{ formatCurrency(bill.electricCharge) }} <span v-if="bill.electricMeterCurrent != null" class="text-xs text-muted">({{ usage(bill.electricMeterPrevious, bill.electricMeterCurrent) }} units)</span></dd></div>
        <div><dt class="text-xs text-muted">Water</dt><dd class="font-medium text-highlighted">{{ formatCurrency(bill.waterCharge) }} <span v-if="bill.waterMeterCurrent != null" class="text-xs text-muted">({{ usage(bill.waterMeterPrevious, bill.waterMeterCurrent) }} units)</span></dd></div>
        <div><dt class="text-xs text-muted">Additional charges</dt><dd class="font-medium text-highlighted">{{ formatCurrency(bill.additionalCharges) }}</dd></div>
        <div><dt class="text-xs text-muted">Due date</dt><dd class="font-medium text-highlighted">{{ formatDate(bill.dueDate) || '—' }}</dd></div>
        <div v-if="bill.status === 'Verified'"><dt class="text-xs text-muted">Verified on</dt><dd class="font-medium text-highlighted">{{ formatDateTime(bill.paidAt) || '—' }}</dd></div>
        <div>
          <dt class="text-xs text-muted">Official receipt number</dt>
          <dd class="font-mono font-medium text-highlighted">{{ bill.orNumber || '—' }}</dd>
          <dd v-if="bill.orNumber && bill.orSource" class="mt-0.5 inline-flex items-center gap-1 text-xs text-muted"><UIcon :name="bill.orSource === 'ocr' ? 'i-lucide-scan-text' : 'i-lucide-keyboard'" class="size-3.5" />{{ bill.orSource === 'ocr' ? 'Read by OCR' : 'Typed by tenant' }}</dd>
        </div>
        <div>
          <dt class="text-xs text-muted">Receipt</dt>
          <dd>
            <button v-if="bill.receipt" type="button" class="group inline-flex items-center gap-2 font-medium text-primary" @click="viewReceipt(bill.receipt)">
              <img :src="`${baseURL}${bill.receipt.url}`" :alt="bill.receipt.name || 'Payment receipt'" class="h-14 w-11 rounded-md border border-default object-cover" />
              <span class="inline-flex items-center gap-1 group-hover:underline"><UIcon name="i-lucide-maximize-2" class="size-3.5" />View</span>
            </button>
            <span v-else class="text-muted">—</span>
          </dd>
        </div>
        <div v-if="earlierReceipts(bill).length" class="col-span-2 sm:col-span-4">
          <dt class="text-xs text-muted">Earlier receipts submitted</dt>
          <dd class="mt-1 flex flex-wrap gap-2">
            <button v-for="file in earlierReceipts(bill)" :key="file.id" type="button" :aria-label="`View ${file.name || 'earlier receipt'}`" :title="file.name || 'Earlier receipt'" @click="viewReceipt(file)">
              <img :src="`${baseURL}${file.url}`" :alt="file.name || 'Earlier receipt'" class="h-14 w-11 rounded-md border border-default object-cover opacity-80 hover:opacity-100" />
            </button>
          </dd>
        </div>
        <div v-if="bill.verificationNote" class="col-span-2 sm:col-span-4">
          <dt class="text-xs text-muted">{{ bill.status === 'Rejected' ? 'Rejection reason' : 'Verification note' }}</dt>
          <dd class="mt-0.5 rounded-lg bg-warning/10 px-3 py-2 text-sm text-toned">{{ bill.verificationNote }}</dd>
        </div>
      </dl>
    </DefineBillSummary>

    <AppPageHeader>
      <template #title>Bills</template>
      <template #description><p class="mt-2 max-w-xl text-muted">Review advance billing information for rent, electricity, and water charges. Verify official receipts issued by the University Cashier.</p></template>
      <template #actions><div class="flex items-center gap-3">
        <UButton label="Refresh" icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="status === 'pending'" @click="refresh" />
        <UButton data-prominent="true" label="Issue bill" icon="i-lucide-plus" @click="openCreate" />
      </div></template>
    </AppPageHeader>
    <p class="mb-5 rounded-lg border border-default bg-default px-4 py-3 text-sm text-muted">iMapSU provides advance billing notices. Official billing statements remain under the Accounting Office. Payments are made through the University Cashier. Issued bills cannot be edited or deleted: a wrong bill is voided and a corrected bill is issued in its place.</p>

    <UAlert v-if="billingSummaryError" class="mb-4" color="warning" title="Billing totals unavailable" description="Displayed records remain available; retry to confirm totals." />
    <AppRefreshState :refreshing="isRefreshing" :failed="hasLoaded && !!error" @retry="refresh" />
    <AppLoadingState v-if="isInitialLoading" variant="table" :count="6" label="Loading bills…" />

    <UAlert v-else-if="isInitialError" color="error" icon="i-lucide-triangle-alert" title="Unable to load bills" description="Please try again." ><template #actions><UButton label="Retry" color="neutral" variant="outline" @click="refresh" /></template></UAlert>

    <UEmpty v-else-if="bills.length === 0 && filterCount === 0" icon="i-lucide-receipt" title="No bills yet" description="Advance billing records will appear here once issued." />

    <div v-else class="space-y-4">
      <!-- On phones the peso totals take a full row each, so a long amount never breaks mid-number. -->
      <div class="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <UCard class="max-sm:col-span-2" :ui="{ body: 'p-3' }">
          <p class="text-xs text-muted">Outstanding</p>
          <p class="mt-1 text-xl font-semibold text-error">{{ formatCurrency(outstandingTotal) }}</p>
          <p class="text-xs text-muted">{{ billingSummary?.unverifiedBills ?? '—' }} unverified</p>
        </UCard>
        <UCard class="max-sm:col-span-2" :ui="{ body: 'p-3' }">
          <p class="text-xs text-muted">Collected</p>
          <p class="mt-1 text-xl font-semibold text-success-600">{{ formatCurrency(collectedTotal) }}</p>
          <p class="text-xs text-muted">{{ billingSummary?.verifiedBills ?? '—' }} verified</p>
        </UCard>
        <UCard class="relative transition-colors hover:bg-elevated" :class="{ 'ring-2 ring-warning': filterStatus === 'For Verification' }" :ui="{ body: 'p-3' }">
          <p class="flex items-start justify-between gap-2 text-xs text-muted">Receipts for Verification<UIcon name="i-lucide-list-filter" class="size-3.5 shrink-0" /></p>
          <p class="mt-1 text-xl font-semibold text-warning">{{ billingSummary?.forVerification ?? '—' }}</p>
          <p class="text-xs text-muted">receipts to review</p>
          <button type="button" class="absolute inset-0 cursor-pointer rounded-[inherit] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" :aria-pressed="filterStatus === 'For Verification'" aria-label="Show only bills with receipts to review" @click="toggleVerificationFilter" />
        </UCard>
        <UCard class="" :ui="{ body: 'p-3' }">
          <p class="text-xs text-muted">Overdue</p>
          <p class="mt-1 text-xl font-semibold text-error">{{ billingSummary?.overdueBills ?? '—' }}</p>
          <p class="text-xs text-muted">{{ formatCurrency(overdueTotal) }} total</p>
        </UCard>
        <UCard class="max-sm:col-span-2" :ui="{ body: 'p-3' }">
          <p class="text-xs text-muted">Bills</p>
          <p class="mt-1 text-xl font-semibold text-highlighted">{{ billingSummary?.total ?? '—' }}</p>
          <p class="text-xs text-muted">all periods, not counting voided</p>
        </UCard>
      </div>

      <UCard :ui="{ body: 'p-4' }">
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <UFormField label="Tenant">
            <USelect v-model="filterTenancy" :items="filterTenancyOptions" searchable />
          </UFormField>
          <UFormField label="Status">
            <USelect v-model="filterStatus" :items="STATUS_FILTER_OPTIONS" />
          </UFormField>
          <UFormField label="Period">
            <UInput v-model="filterPeriod" placeholder="e.g. 2026-08" />
          </UFormField>
          <UFormField label="Search">
            <UInput v-model="filterSearch" placeholder="Tenant, space, code…" icon="i-lucide-search" />
          </UFormField>
        </div>
        <div class="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p class="text-sm text-muted">Showing {{ filteredBills.length }} of {{ bills.length }} bills</p>
          <UButton v-if="filterCount > 0" label="Clear filters" icon="i-lucide-x" color="neutral" variant="ghost" size="sm" @click="clearFilters" />
        </div>
      </UCard>

      <UEmpty v-if="filteredBills.length === 0" icon="i-lucide-list-filter" title="No matching bills" description="No bills match the current filters." />
      <template v-else>
        <AppRecordTable :items="filteredBills" :columns="recordColumns" :item-key="bill => bill.documentId ?? bill.id" caption="Bills" compact-actions actions-label="Action">
        <template #cell-tenant="{ item }">
          <div class="flex items-center gap-2">
            <AppUserAvatar v-if="item.tenancy?.user" :user="item.tenancy.user" size="xs" />
            <div class="min-w-0">
              <p class="text-toned">{{ item.tenancy?.user?.username || item.tenancy?.propertySpace?.name || '—' }}</p>
              <p v-if="billContext(item)" class="mt-0.5 text-xs text-muted">{{ billContext(item) }}</p>
            </div>
          </div>
        </template>
        <template #cell-status="{ item }">
          <div class="flex flex-wrap items-center gap-1">
            <UBadge :color="statusColor(item)" variant="subtle">{{ item.status || 'Unknown' }}</UBadge>
            <UBadge v-if="isOverdue(item) && item.status !== 'Overdue'" color="error" variant="solid">Overdue</UBadge>
          </div>
        </template>
        <template #actions="{ item }">
          <template v-if="item.status === 'For Verification'">
            <UButton label="Verify" icon="i-lucide-file-check-2" color="success" variant="subtle" size="sm" :loading="isBusy(item)" :disabled="!!verifyBlocked(item)" :title="verifyBlocked(item)" @click="verifyBill(item)" />
            <UButton label="Reject" icon="i-lucide-x-circle" color="error" variant="subtle" size="sm" :disabled="isBusy(item)" @click="openReject(item)" />
          </template>
          <UButton v-else-if="canCorrect(item)" label="Issue corrected bill" icon="i-lucide-file-pen-line" color="neutral" variant="subtle" size="sm" @click="openCorrection(item)" />
          <UDropdownMenu :items="billMenuItems(item)" :content="{ align: 'end' }">
            <UButton icon="i-lucide-ellipsis" color="neutral" variant="ghost" size="sm" aria-label="More actions" title="More actions" :disabled="isBusy(item)" />
          </UDropdownMenu>
        </template>
        <template #details="{ item: bill }">
          <UAlert v-if="bill.reviewFlags?.length" class="mb-3" color="warning" title="Billing review flags" :description="bill.reviewFlags.join('; ')" />
          <UCard :ui="{ body: 'p-5' }">
            <BillSummary :bill="bill" />

            <!-- Phones have no table row, so their cards keep the full set of actions. -->
            <div class="mt-4 flex flex-wrap gap-2 border-t border-default pt-4 lg:hidden">
              <template v-if="bill.status === 'For Verification'">
                <UButton label="Verify payment" icon="i-lucide-file-check-2" color="success" size="sm" :loading="isBusy(bill)" :disabled="!!verifyBlocked(bill)" :title="verifyBlocked(bill)" @click="verifyBill(bill)" />
                <UButton label="Reject payment" icon="i-lucide-x-circle" color="error" variant="subtle" size="sm" :disabled="isBusy(bill)" @click="openReject(bill)" />
              </template>
              <UButton v-if="canCorrect(bill)" label="Issue corrected bill" icon="i-lucide-file-pen-line" color="neutral" variant="subtle" size="sm" @click="openCorrection(bill)" />
              <UButton label="History" icon="i-lucide-history" color="neutral" variant="subtle" size="sm" @click="openHistory(bill)" />
              <UButton v-if="canVoid(bill)" label="Void bill" icon="i-lucide-ban" color="error" variant="ghost" size="sm" :disabled="isBusy(bill)" @click="openVoid(bill)" />
            </div>
          </UCard>
        </template>
      </AppRecordTable>
      </template>
    </div>

    <UModal v-model:open="viewOpen" class="max-w-3xl" title="Bill" :description="viewBill ? `${viewBill.tenancy?.propertySpace?.name ?? 'Bill'} · ${formatPeriod(viewBill.period)}` : 'Bill details'">
      <template #body>
        <div v-if="viewBill" class="space-y-4">
          <UAlert v-if="viewBill.reviewFlags?.length" color="warning" title="Billing review flags" :description="viewBill.reviewFlags.join('; ')" />
          <BillSummary :bill="viewBill" />
          <div class="flex flex-wrap justify-end gap-2 border-t border-default pt-4">
            <UButton label="History" icon="i-lucide-history" color="neutral" variant="ghost" @click="openHistory(viewBill)" />
            <UButton v-if="canCorrect(viewBill)" label="Issue corrected bill" icon="i-lucide-file-pen-line" color="neutral" variant="subtle" @click="openCorrection(viewBill)" />
            <UButton label="Close" color="neutral" variant="subtle" @click="viewOpen = false" />
          </div>
        </div>
      </template>
    </UModal>

    <UModal v-model:open="verifyOpen" class="max-w-xl" title="Verify payment" description="Check the receipt against this bill before marking it as paid.">
      <template #body>
        <form v-if="verifyTarget" class="space-y-4" @submit.prevent="confirmVerify">
          <UAlert v-if="verifyTarget.reviewFlags?.length" color="warning" icon="i-lucide-triangle-alert" title="Billing review flags" :description="verifyTarget.reviewFlags.join('; ')" />
          <div class="space-y-4">
            <dl class="grid grid-cols-2 content-start gap-4 text-sm">
              <div><dt class="text-xs text-muted">Tenant</dt><dd class="font-medium text-highlighted">{{ verifyTarget.tenancy?.user?.username || '—' }}</dd></div>
              <div><dt class="text-xs text-muted">Stall</dt><dd class="font-medium text-highlighted">{{ verifyTarget.tenancy?.propertySpace?.name || '—' }}</dd></div>
              <div><dt class="text-xs text-muted">Period</dt><dd class="font-medium text-highlighted">{{ verifyTarget.period || '—' }}</dd></div>
              <div><dt class="text-xs text-muted">Total</dt><dd class="font-semibold text-highlighted">{{ formatCurrency(verifyTarget.amount) }}</dd></div>
              <div class="col-span-2"><dt class="text-xs text-muted">Official receipt number</dt><dd class="font-mono font-medium text-highlighted">{{ verifyTarget.orNumber || '—' }}</dd><dd v-if="verifyTarget.orNumber && verifyTarget.orSource" class="mt-0.5 inline-flex items-center gap-1 text-xs text-muted"><UIcon :name="verifyTarget.orSource === 'ocr' ? 'i-lucide-scan-text' : 'i-lucide-keyboard'" class="size-3.5" />{{ verifyTarget.orSource === 'ocr' ? 'Read by OCR' : 'Typed by tenant' }}</dd></div>
            </dl>
            <button v-if="verifyTarget.receipt" type="button" class="group block w-full text-left text-sm font-medium text-primary" @click="viewReceipt(verifyTarget.receipt)">
              <img :src="`${baseURL}${verifyTarget.receipt.url}`" :alt="verifyTarget.receipt.name || 'Payment receipt'" class="max-h-72 w-full rounded-md border border-default object-contain" />
              <span class="mt-1 inline-flex items-center gap-1 group-hover:underline"><UIcon name="i-lucide-maximize-2" class="size-3.5" />View full size</span>
            </button>
          </div>
          <p class="text-sm text-muted">Verifying marks the bill as paid. The bill and its receipt then become a permanent record.</p>
          <UAlert v-if="verifyError" color="error" icon="i-lucide-triangle-alert" :description="verifyError" />
          <div class="flex justify-end gap-2">
            <UButton label="Cancel" color="neutral" variant="ghost" :disabled="isBusy(verifyTarget)" @click="verifyOpen = false" />
            <UButton data-prominent="true" type="submit" color="success" icon="i-lucide-file-check-2" :loading="isBusy(verifyTarget)">Verify payment</UButton>
          </div>
        </form>
      </template>
    </UModal>

    <UModal v-model:open="rejectOpen" class="max-w-xl" title="Reject payment" description="The tenant sees the reason and can upload a corrected receipt.">
      <template #body>
        <form class="space-y-4" @submit.prevent="confirmReject">
          <UAlert color="warning" icon="i-lucide-triangle-alert" title="Bill will be marked Rejected" :description="rejectTarget ? `The ${billLabel(rejectTarget)} leaves verification. Its receipt stays in the bill's history.` : ''" />
          <UFormField label="Rejection reason" description="Visible to the tenant and kept in the bill's history." required>
            <UTextarea v-model="rejectReason" :rows="3" :maxlength="500" class="w-full" placeholder="e.g. OR number does not match the receipt amount." />
          </UFormField>
          <UAlert v-if="rejectError" color="error" icon="i-lucide-triangle-alert" :description="rejectError" />
          <div class="flex justify-end gap-2">
            <UButton label="Cancel" color="neutral" variant="ghost" :disabled="!!rejectTarget && isBusy(rejectTarget)" @click="rejectOpen = false" />
            <UButton data-prominent="true" type="submit" color="error" :loading="!!rejectTarget && isBusy(rejectTarget)">Reject payment</UButton>
          </div>
        </form>
      </template>
    </UModal>

    <UModal v-model:open="voidOpen" class="max-w-xl" title="Void bill" description="Cancel a bill issued with wrong details. It stays on record and cannot be paid.">
      <template #body>
        <form class="space-y-4" @submit.prevent="confirmVoid">
          <UAlert color="error" variant="subtle" icon="i-lucide-ban" title="This cannot be undone" :description="voidTarget ? `The ${billLabel(voidTarget)} is kept with your reason, your name and the time. The tenant is told it was voided.` : ''" />
          <UFormField label="Reason" description="What is wrong with this bill." required>
            <UTextarea v-model="voidReason" :rows="3" :maxlength="500" class="w-full" placeholder="e.g. Issued with last month's water reading." />
          </UFormField>
          <UCheckbox v-model="voidThenCorrect" label="Issue a corrected bill next" description="Opens the Issue bill form for the same tenancy and period, linked to this bill." />
          <UAlert v-if="voidError" color="error" icon="i-lucide-triangle-alert" :description="voidError" />
          <div class="flex justify-end gap-2">
            <UButton label="Cancel" color="neutral" variant="ghost" :disabled="!!voidTarget && isBusy(voidTarget)" @click="voidOpen = false" />
            <UButton data-prominent="true" type="submit" color="error" icon="i-lucide-ban" :loading="!!voidTarget && isBusy(voidTarget)">Void bill</UButton>
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
      @view-receipt="viewHistoryReceipt"
    />

    <UModal v-model:open="formOpen" class="max-w-3xl" :title="correcting ? 'Issue corrected bill' : 'Issue bill'" description="Rent comes from the tenancy and utility charges from the stall's meter reading for the period.">
      <template #body>
        <form class="space-y-4" @submit.prevent="save">
          <UAlert v-if="correcting" color="info" variant="subtle" icon="i-lucide-file-pen-line" title="Corrects a voided bill" :description="`Replaces the voided ${billLabel(correcting)}${correcting.voidReason ? `: ${correcting.voidReason}` : '.'}`" />
          <UFormField label="Tenancy" help="Only active tenancies on occupied stalls can be billed." required>
            <AppRecordLookup v-model="form.tenancy" class="w-full" endpoint="/api/tenancies" :fields="['user.username','propertySpace.name','propertySpace.propertyCode']" :label="item => (item.propertySpace?.name || 'Property') + ' — ' + (item.user?.username || 'Tenant')" :value="item => item.documentId" :query="billableTenancyQuery" :fallback="tenancyFallback" placeholder="Search by stall or tenant" />
          </UFormField>

          <div class="grid items-start gap-4 sm:grid-cols-2">
            <UFormField label="Billing period" required>
              <UInput v-model="form.period" type="month" class="w-full" required />
            </UFormField>
            <UFormField label="Due date">
              <UInput :model-value="dueDatePreview" class="w-full" disabled />
            </UFormField>
            <UFormField label="Additional charges (PHP)" class="sm:col-span-2" help="Maintenance and other fees. A negative amount records a credit.">
              <UInput v-model="form.additionalCharges" type="number" step="0.01" class="w-full" placeholder="e.g. 150" />
            </UFormField>
          </div>
          <p class="-mt-2 text-xs text-muted">Bills are due on the 10th of the following month. The tenant adds the official receipt number when they upload their receipt. Once issued, a bill cannot be edited.</p>

          <UAlert v-if="notBillable" color="error" icon="i-lucide-store" title="Stall is not occupied" :description="notBillable" />
          <UAlert v-else-if="duplicateBill" color="error" icon="i-lucide-copy-x" title="Already billed" :description="`This tenancy already has a ${duplicateBill.status.toLowerCase()} bill for ${formatPeriod(duplicateBill.period)}. Void that bill first if it needs to be corrected.`" />
          <UAlert v-else-if="previewError" color="error" icon="i-lucide-triangle-alert" title="Charges unavailable" :description="previewError"><template #actions><UButton label="Retry" color="neutral" variant="outline" size="sm" @click="loadPreview" /></template></UAlert>
          <UAlert v-else-if="preview && !preview.reading" color="warning" icon="i-lucide-gauge" title="No meter reading for this period" :description="`Record ${preview.stall?.name ?? 'the stall'}'s meter readings for ${formatPeriod(form.period)} first, or this bill covers rent and additional charges only.`"><template #actions><UButton to="/admin/meter-readings" label="Open meter readings" color="neutral" variant="outline" size="sm" icon="i-lucide-gauge" /></template></UAlert>

          <div class="rounded-lg border border-default p-4">
            <div class="flex items-start justify-between gap-3">
              <p class="text-xs font-medium text-muted">Charges</p>
              <p v-if="preview?.reading" class="text-right text-xs text-muted">From the meter reading of {{ formatReadingDate(preview.reading.readingDate) }}</p>
            </div>
            <p v-if="!form.tenancy || !validPeriod(form.period)" class="mt-2 text-sm text-muted">Choose a tenancy and billing period to see the charges.</p>
            <p v-else-if="loadingPreview" class="mt-2 flex items-center gap-2 text-sm text-muted"><UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" />Getting the charges for {{ formatPeriod(form.period) }}…</p>
            <dl v-else-if="preview" class="mt-2 space-y-1 text-sm">
              <div class="flex items-center justify-between gap-3"><dt class="text-muted">Rent</dt><dd class="font-medium text-highlighted">{{ formatCurrency(shownRent) }}</dd></div>
              <div class="flex items-center justify-between gap-3"><dt class="text-muted">Electricity<span v-if="preview.electric.consumption != null"> ({{ preview.electric.consumption }} kWh)</span></dt><dd class="font-medium text-highlighted">{{ formatCurrency(shownElectric) }}</dd></div>
              <div class="flex items-center justify-between gap-3"><dt class="text-muted">Water<span v-if="preview.water.consumption != null"> ({{ preview.water.consumption }} m³)</span></dt><dd class="font-medium text-highlighted">{{ formatCurrency(shownWater) }}</dd></div>
              <div class="flex items-center justify-between gap-3"><dt class="text-muted">Additional charges</dt><dd class="font-medium text-highlighted">{{ formatCurrency(additionalChargesNum) }}</dd></div>
              <div class="flex items-center justify-between gap-3 border-t border-default pt-2"><dt class="font-semibold text-highlighted">Total amount due</dt><dd class="text-lg font-semibold text-highlighted">{{ formatCurrency(totalAmount) }}</dd></div>
            </dl>
          </div>

          <UAlert v-if="formError" color="error" icon="i-lucide-triangle-alert" :description="formError" />

          <div class="flex justify-end gap-2">
            <UButton label="Cancel" color="neutral" variant="ghost" :disabled="saving" @click="formOpen = false" />
            <UButton data-prominent="true" type="submit" :loading="saving" :disabled="!!duplicateBill || !!notBillable || loadingPreview">{{ correcting ? 'Issue corrected bill' : 'Issue bill' }}</UButton>
          </div>
        </form>
      </template>
    </UModal>
    <ReceiptViewer v-model:open="receiptViewerOpen" :receipt="viewedReceipt" />
    <AppRecordPagination :state="recordsPage" :response="data" :pending="status === 'pending'" />
  </main>
</template>
