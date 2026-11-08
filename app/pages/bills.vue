<script setup lang="ts">
import { createReusableTemplate, useMediaQuery, useMounted } from '@vueuse/core'
import { prepareUpload } from '~/utils/uploadFile'

definePageMeta({
  middleware: ['auth', 'role'],
  // An aspiring tenant here is a former tenant reading past bills, or someone with none.
  roles: ['current-tenant', 'aspiring-tenant']
})

type Bill = {
  id: number | string
  documentId?: string
  period?: string
  amount: number | string
  electricMeterPrevious?: number | string | null
  electricMeterCurrent?: number | string | null
  electricRate?: number | string | null
  electricCharge?: number | string | null
  waterMeterPrevious?: number | string | null
  waterMeterCurrent?: number | string | null
  waterRate?: number | string | null
  waterCharge?: number | string | null
  additionalCharges?: number | string | null
  dueDate?: string
  overdueFlag?: boolean
  reviewFlags?: string[]
  status: 'Unpaid' | 'For Verification' | 'Verified' | 'Rejected' | 'Overdue'
  verificationNote?: string
  paidAt?: string
  orNumber?: string
  createdAt?: string
  receipt?: { id: number; url?: string; name?: string } | null
  tenancy?: {
    documentId?: string
    propertySpace?: { documentId?: string; name?: string; propertyCode?: string; building?: string } | null
  } | null
}

type ListResponse<T> = { data: T[] }

useHead({ title: 'Bills | iMapSU' })

const auth = useAuth()
const notify = useNotify()
const { baseURL, $api, getErrorMessage } = useStrapi()
const headers = {}

const recordsPage = useRecordPage([], {  })
const { data: responseData, status, error, refresh } = await useFetch<ListResponse<Bill>>('/api/bills', { lazy: true,
  baseURL,
  headers,
  query: computed(() => ({
    'populate[tenancy][populate][propertySpace]': true,
    'populate[receipt]': true,
    sort: 'period:desc', ...recordsPage.query.value }))
})
const { data, hasLoaded, isInitialLoading, isRefreshing, isInitialError } = useRequestPresentation(responseData, status)


const { data: billingSummaryResponse, status: billingSummaryStatus, error: billingSummaryError, refresh: refreshBillingSummary } = await useFetch<any>('/api/dashboard/billing-summary', { lazy: true, baseURL, headers })
const { data: billingSummary } = useRequestPresentation(billingSummaryResponse, billingSummaryStatus)
// The first lazy response arrives alongside the summary request, so only later list changes refresh it.
watch(responseData, (_next, previous) => { if (previous) refreshBillingSummary() })
const bills = computed(() => data.value?.data ?? [])
const totalOutstanding = computed(() => billingSummary.value?.outstanding ?? null)

const uploadingKeys = reactive<Record<string, boolean>>({})
const submittingKeys = reactive<Record<string, boolean>>({})
const removingKeys = reactive<Record<string, boolean>>({})
const selectedFiles = reactive<Record<string, File>>({})
const uploadErrors = reactive<Record<string, string>>({})
const submitErrors = reactive<Record<string, string>>({})

const billKey = (bill: Bill) => String(bill.documentId ?? bill.id)
const isUploading = (bill: Bill) => uploadingKeys[billKey(bill)] === true
const isSubmitting = (bill: Bill) => submittingKeys[billKey(bill)] === true
const isRemoving = (bill: Bill) => removingKeys[billKey(bill)] === true

const orNumberDraft = reactive<Record<string, string>>({})
const orValue = (bill: Bill) => (orNumberDraft[billKey(bill)] ?? '').trim()

watch(bills, (list) => {
  for (const bill of list) {
    const key = billKey(bill)
    if (bill.orNumber && orNumberDraft[key] == null) {
      orNumberDraft[key] = bill.orNumber
    }
  }
}, { immediate: true })

const onReceiptSelected = (bill: Bill, event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  uploadReceipt(bill, file, input)
}

const uploadReceipt = async (bill: Bill, file: File, input?: HTMLInputElement) => {
  const key = billKey(bill)
  uploadingKeys[key] = true
  uploadErrors[key] = ''
  submitErrors[key] = ''
  selectedFiles[key] = file
  const reading = notify.loading('Reading official receipt number…', 'This can take a few seconds.')
  try {
    const form = new FormData()
    form.append('purpose', 'receipt')
    form.append('files', await prepareUpload(file))
    const uploaded = await $api<{ id: number; url?: string }[]>('/api/upload', {
      method: 'POST',
      body: form
    })
    const fileId = uploaded?.[0]?.id
    if (!fileId) throw new Error('Unable to upload the receipt. Please try again.')

    const updated = await $api<{ data: Bill }>(`/api/bills/${key}`, {
      method: 'PUT',
      body: { data: { receipt: fileId } }
    })
    const detected = updated?.data?.orNumber
    orNumberDraft[key] = detected ?? ''
    notify.dismiss(reading)
    notify.success('Receipt attached', {
      description: detected
        ? `Receipt uploaded. Please review the official receipt number (${detected}) before submitting.`
        : 'Receipt uploaded. No official receipt number is available. Enter it below before submitting.'
    })
    await refresh()
  } catch (err) {
    uploadErrors[key] = getErrorMessage(err)
  } finally {
    notify.dismiss(reading)
    uploadingKeys[key] = false
    delete selectedFiles[key]
    if (input) input.value = ''
  }
}

const submitPayment = async (bill: Bill) => {
  const key = billKey(bill)
  const value = orValue(bill)
  if (!value) return
  submittingKeys[key] = true
  submitErrors[key] = ''
  try {
    await $api(`/api/bills/${key}`, {
      method: 'PUT',
      body: { data: { orNumber: value } }
    })
    notify.success('Receipt submitted for verification.', { description: 'The Office of Auxiliary Services will review your submitted receipt.' })
    await refresh()
  } catch (err) {
    submitErrors[key] = getErrorMessage(err)
  } finally {
    submittingKeys[key] = false
  }
}

const removeReceipt = async (bill: Bill) => {
  const key = billKey(bill)
  removingKeys[key] = true
  submitErrors[key] = ''
  try {
    await $api(`/api/bills/${key}`, {
      method: 'PUT',
      body: { data: { receipt: null } }
    })
    delete orNumberDraft[key]
    notify.info('Receipt removed', { description: 'The uploaded receipt has been removed from this bill.' })
    await refresh()
  } catch (err) {
    submitErrors[key] = getErrorMessage(err)
  } finally {
    removingKeys[key] = false
  }
}

const formatCurrency = (amount?: number | string) => amount == null || amount === ''
  ? '—'
  : new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 2 }).format(Number(amount))

const formatDate = (value?: string) => value
  ? new Date(value + 'T00:00:00').toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
  : ''

const formatDateTime = (value?: string) => value
  ? new Date(value).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  : ''

const isOverdue = (bill: Bill) => {
  if (bill.status === 'Verified' || !bill.dueDate) return false
  if (bill.status === 'Overdue' || bill.overdueFlag) return true
  const due = new Date(bill.dueDate + 'T00:00:00')
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return due < today
}

const statusColor = (bill: Bill) => {
  switch (bill.status) {
    case 'Verified': return 'success'
    case 'Rejected':
    case 'Overdue': return 'error'
    case 'For Verification': return 'warning'
    default: return 'secondary'
  }
}

const statusLabel = (bill: Bill) => {
  switch (bill.status) {
    case 'For Verification': return 'For Verification'
    case 'Rejected': return 'Receipt rejected'
    default: return bill.status
  }
}

const readOnly = computed(() => !auth.isCurrentTenant.value)
const canSubmitPayment = (bill: Bill) => !readOnly.value && bill.status !== 'Verified'
// A submitted payment stays locked until the OAS verifies or rejects it.
const isSubmitted = (bill: Bill) => bill.status === 'For Verification'

// Bill breakdown: a dialog on desktop and a bottom sheet on phones. False until
// mounted so the server render and hydration match the desktop.
const mounted = useMounted()
const narrowScreen = useMediaQuery('(max-width: 639px)')
const isMobile = computed(() => mounted.value && narrowScreen.value)
const [DefineDetailsBody, DetailsBody] = createReusableTemplate()
const detailsOpen = ref(false)
const detailsKey = ref<string | null>(null)
// Follows the list so the dialog shows fresh data after a refresh.
const detailsBill = computed(() => bills.value.find(bill => billKey(bill) === detailsKey.value) ?? null)
const openDetails = (bill: Bill) => {
  detailsKey.value = billKey(bill)
  detailsOpen.value = true
}

const hasValue = (value?: number | string | null) => value != null && value !== ''
const num = (value?: number | string | null) => hasValue(value) ? Number(value) : 0
const formatReading = (value?: number | string | null) => hasValue(value)
  ? new Intl.NumberFormat('en-PH', { maximumFractionDigits: 2 }).format(Number(value))
  : '—'
const formatRate = (value?: number | string | null) => hasValue(value)
  ? new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 4 }).format(Number(value))
  : '—'
const consumption = (previous?: number | string | null, current?: number | string | null) => {
  if (!hasValue(previous) || !hasValue(current)) return null
  const used = Number(current) - Number(previous)
  return used < 0 ? null : used
}
const utilities = (bill: Bill) => [
  { label: 'Electricity', icon: 'i-lucide-zap', unit: 'kWh', previous: bill.electricMeterPrevious, current: bill.electricMeterCurrent, rate: bill.electricRate, charge: bill.electricCharge },
  { label: 'Water', icon: 'i-lucide-droplet', unit: 'm³', previous: bill.waterMeterPrevious, current: bill.waterMeterCurrent, rate: bill.waterRate, charge: bill.waterCharge }
]
// Rent is whatever the total holds besides the utilities and additional charges.
const baseRent = (bill: Bill) => num(bill.amount) - num(bill.electricCharge) - num(bill.waterCharge) - num(bill.additionalCharges)
</script>

<template>
  <main class="imapsu-page">
    <AppPageHeader>
      <template #title>{{ readOnly ? 'Past bills' : 'Bills' }}</template>
      <template #description><p class="mt-2 max-w-xl text-muted">{{ readOnly ? 'Review the rent and utility bills from your past tenancy. These records are read-only.' : 'Review advance billing information for rent and utilities. Make payments through the University Cashier, then submit the official receipt for verification.' }}</p></template>
      <template #actions><div v-if="hasLoaded" class="flex gap-3">
        <UCard class="min-w-32" :ui="{ body: 'p-3' }">
          <p class="text-xs text-muted">Bills</p><p class="text-xl font-semibold text-primary">{{ billingSummary?.total ?? '—' }}</p>
        </UCard>
        <UCard class="min-w-32" :ui="{ body: 'p-3' }">
          <p class="text-xs text-muted">Outstanding</p><p class="text-xl font-semibold text-error">{{ formatCurrency(totalOutstanding) }}</p>
        </UCard>
        <div class="flex items-center">
          <UButton label="Refresh" icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="status === 'pending'" @click="refresh" />
        </div>
      </div></template>
    </AppPageHeader>
    <p class="mb-5 rounded-lg border border-default bg-default px-4 py-3 text-sm text-muted">iMapSU provides advance billing notices. Official billing statements remain under the Accounting Office. Payments are made through the University Cashier.</p>

    <UAlert v-if="billingSummaryError" class="mb-4" color="warning" title="Billing totals unavailable" description="Displayed records remain available; retry to confirm totals." />
    <AppRefreshState :refreshing="isRefreshing" :failed="hasLoaded && !!error" @retry="refresh" />
    <AppLoadingState v-if="isInitialLoading" variant="list" :toolbar="false" :count="4" label="Loading your bills…" />

    <UAlert v-else-if="isInitialError" color="error" icon="i-lucide-triangle-alert" title="Unable to load bills" description="Please try again." ><template #actions><UButton label="Retry" color="neutral" variant="outline" @click="refresh" /></template></UAlert>

    <UEmpty v-else-if="bills.length === 0" icon="i-lucide-receipt" :title="readOnly ? 'No past bills' : 'No bills yet'" :description="readOnly ? 'Bills from a past tenancy would appear here.' : 'Bills for your tenancy will appear here once issued.'" />

    <div v-else class="space-y-4">
      <UCard v-for="bill in bills" :key="bill.documentId ?? bill.id" :ui="{ body: 'p-5' }">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="font-medium text-highlighted">{{ bill.period || 'Billing period' }}</p>
            <p v-if="bill.tenancy?.propertySpace" class="mt-1 flex items-center gap-1 text-xs text-muted">
              <UIcon name="i-lucide-building-2" class="size-3.5" />
              {{ bill.tenancy.propertySpace.name }}
              <span>({{ bill.tenancy.propertySpace.propertyCode }})</span>
            </p>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <UBadge v-if="isOverdue(bill) && bill.status !== 'Overdue'" color="error" variant="solid">Overdue</UBadge>
            <UBadge :color="statusColor(bill)" variant="subtle">{{ statusLabel(bill) }}</UBadge>
            <UButton label="View details" icon="i-lucide-file-text" color="neutral" variant="outline" size="sm" @click="openDetails(bill)" />
          </div>
        </div>

        <dl class="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
          <div><dt class="text-xs text-muted">Amount</dt><dd class="font-semibold text-highlighted">{{ formatCurrency(bill.amount) }}</dd></div>
          <div><dt class="text-xs text-muted">Due date</dt><dd class="font-medium text-highlighted">{{ formatDate(bill.dueDate) || '—' }}</dd></div>
          <div v-if="bill.status === 'Verified'">
            <dt class="text-xs text-muted">Verified on</dt>
            <dd class="font-medium text-highlighted">{{ formatDateTime(bill.paidAt) || '—' }}</dd>
          </div>
          <div v-if="bill.receipt">
            <dt class="text-xs text-muted">Official receipt number</dt>
            <dd class="font-semibold font-mono text-highlighted">{{ bill.orNumber || '—' }}</dd>
          </div>
          <div v-if="bill.receipt">
            <dt class="text-xs text-muted">Receipt</dt>
            <dd>
              <a :href="`${baseURL}${bill.receipt.url}`" target="_blank" rel="noopener" class="group inline-flex items-center gap-2 text-primary">
                <img :src="`${baseURL}${bill.receipt.url}`" :alt="bill.receipt.name || 'Payment receipt'" class="h-14 w-11 rounded-md border border-default object-cover" />
                <span class="inline-flex items-center gap-1 font-medium group-hover:underline"><UIcon name="i-lucide-external-link" class="size-3.5" />View</span>
              </a>
            </dd>
          </div>
        </dl>

        <UAlert v-if="readOnly && bill.status !== 'Verified'" class="mt-5" color="info" icon="i-lucide-info" title="Settle this bill with the Office of Auxiliary Services" description="Your tenancy has ended, so receipts can no longer be submitted here." />

        <div v-if="canSubmitPayment(bill) && isSubmitted(bill)" class="mt-5 border-t border-default pt-4">
          <!-- The OR number and receipt above stay read-only until the OAS verifies or rejects them. -->
          <UAlert color="info" icon="i-lucide-lock" title="Submitted — awaiting OAS verification" :description="`Your receipt${bill.orNumber ? ` (OR ${bill.orNumber})` : ''} is locked while the Office of Auxiliary Services reviews it. If it is rejected, you can correct it and submit again.`" />
        </div>

        <div v-else-if="canSubmitPayment(bill)" class="mt-5 border-t border-default pt-4">
          <h2 class="mb-2 text-base font-semibold text-highlighted">Submit payment receipt</h2><p class="mb-4 text-sm text-muted">A clear picture (JPG, PNG or WebP) of the official receipt issued by the University Cashier is required for payment recording and verification.</p>

          <UAlert v-if="bill.status === 'Rejected'" color="error" icon="i-lucide-x-circle" title="Receipt rejected" :description="bill.verificationNote || 'Your submitted receipt was not accepted. Please review it and try again.'" class="mb-4" />
          <UAlert v-else-if="bill.status === 'Overdue'" color="warning" icon="i-lucide-alarm-clock" title="Overdue" description="This bill is past its due date. Please settle it as soon as possible." class="mb-4" />

          <template v-if="!bill.receipt">
            <div class="flex flex-wrap items-center gap-3">
              <label class="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-default px-3 py-2 text-sm font-medium text-primary hover:border-primary" :class="{ 'pointer-events-none opacity-60': isUploading(bill) }">
                <UIcon :name="isUploading(bill) ? 'i-lucide-loader-2' : 'i-lucide-file-up'" class="size-4" :class="{ 'animate-spin': isUploading(bill) }" />
                {{ isUploading(bill) ? 'Uploading…' : 'Upload receipt' }}
                <input type="file" accept="image/jpeg,image/png,image/webp" class="sr-only" :disabled="isUploading(bill)" @change="(event: Event) => onReceiptSelected(bill, event)" />
              </label>
              <span v-if="selectedFiles[billKey(bill)]" class="max-w-64 truncate text-sm text-muted">{{ selectedFiles[billKey(bill)].name }}</span>
              <span v-else-if="isUploading(bill)" class="text-sm text-muted">Reading official receipt number…</span>
            </div>

          </template>

          <template v-else>
            <div class="flex flex-wrap items-center gap-3">
              <a :href="`${baseURL}${bill.receipt.url}`" target="_blank" rel="noopener" class="group inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline">
                <img :src="`${baseURL}${bill.receipt.url}`" :alt="bill.receipt.name || 'Receipt attached'" class="h-10 w-8 rounded border border-default object-cover" />
                {{ bill.receipt.name || 'Receipt attached' }}
              </a>
              <label class="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-default px-2.5 py-1.5 text-xs font-medium text-muted hover:border-primary hover:text-primary" :class="{ 'pointer-events-none opacity-60': isUploading(bill) }">
                <UIcon name="i-lucide-repeat" class="size-3.5" /> Replace
                <input type="file" accept="image/jpeg,image/png,image/webp" class="sr-only" :disabled="isUploading(bill)" @change="(event: Event) => onReceiptSelected(bill, event)" />
              </label>
              <UButton
                icon="i-lucide-trash-2"
                label="Remove file"
                color="neutral"
                variant="ghost"
                size="sm"
                :loading="isRemoving(bill)"
                :disabled="isUploading(bill)"
                @click="removeReceipt(bill)"
              />
            </div>
            <div class="mt-3 flex flex-wrap items-end gap-3">
              <UFormField label="Official receipt number" description="Enter or correct the number if needed, then click Submit receipt to send it for review." class="min-w-56">
                <UInput v-model="orNumberDraft[billKey(bill)]" placeholder="e.g. 8823109" :disabled="isSubmitting(bill)" @keyup.enter="submitPayment(bill)" />
              </UFormField>
              <UButton :loading="isSubmitting(bill)" :disabled="!orValue(bill)" icon="i-lucide-send" @click="submitPayment(bill)">Submit receipt</UButton>
            </div>
            <p v-if="submitErrors[billKey(bill)]" role="alert" class="mt-2 text-sm text-error">Unable to update receipt. {{ submitErrors[billKey(bill)] }}</p>
          </template>
          <p v-if="uploadErrors[billKey(bill)]" role="alert" class="mt-2 text-sm text-error">Unable to upload receipt. {{ uploadErrors[billKey(bill)] }}</p>
        </div>
      </UCard>
    </div>
    <AppRecordPagination :state="recordsPage" :response="data" :pending="status === 'pending'" />

    <DefineDetailsBody>
      <div v-if="detailsBill" class="space-y-5 text-sm">
        <div class="flex flex-wrap items-center gap-2">
          <UBadge :color="statusColor(detailsBill)" variant="subtle">{{ statusLabel(detailsBill) }}</UBadge>
          <UBadge v-if="isOverdue(detailsBill) && detailsBill.status !== 'Overdue'" color="error" variant="solid">Overdue</UBadge>
          <span class="text-muted">Due {{ formatDate(detailsBill.dueDate) || '—' }}</span>
        </div>

        <UAlert v-if="detailsBill.status === 'Rejected'" color="error" icon="i-lucide-x-circle" title="Receipt rejected by the OAS" :description="detailsBill.verificationNote || 'No reason was given.'" />

        <section v-for="utility in utilities(detailsBill)" :key="utility.label" class="rounded-lg border border-default p-4">
          <h3 class="mb-3 flex items-center gap-1.5 font-semibold text-highlighted"><UIcon :name="utility.icon" class="size-4 text-primary" />{{ utility.label }}</h3>
          <dl class="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div><dt class="text-xs text-muted">Reading</dt><dd class="font-medium text-highlighted">{{ formatReading(utility.previous) }} → {{ formatReading(utility.current) }}</dd></div>
            <div><dt class="text-xs text-muted">Consumption</dt><dd class="font-medium text-highlighted">{{ consumption(utility.previous, utility.current) == null ? '—' : `${formatReading(consumption(utility.previous, utility.current))} ${utility.unit}` }}</dd></div>
            <div><dt class="text-xs text-muted">Rate</dt><dd class="font-medium text-highlighted">{{ formatRate(utility.rate) }}<span v-if="hasValue(utility.rate)" class="text-xs text-muted"> / {{ utility.unit }}</span></dd></div>
            <div><dt class="text-xs text-muted">Charge</dt><dd class="font-semibold text-highlighted">{{ formatCurrency(num(utility.charge)) }}</dd></div>
          </dl>
        </section>

        <dl class="divide-y divide-default rounded-lg border border-default">
          <div class="flex items-center justify-between gap-3 px-4 py-2.5"><dt class="text-muted">Rent / base</dt><dd class="font-medium text-highlighted">{{ formatCurrency(baseRent(detailsBill)) }}</dd></div>
          <div class="flex items-center justify-between gap-3 px-4 py-2.5"><dt class="text-muted">Electricity</dt><dd class="font-medium text-highlighted">{{ formatCurrency(num(detailsBill.electricCharge)) }}</dd></div>
          <div class="flex items-center justify-between gap-3 px-4 py-2.5"><dt class="text-muted">Water</dt><dd class="font-medium text-highlighted">{{ formatCurrency(num(detailsBill.waterCharge)) }}</dd></div>
          <div class="flex items-center justify-between gap-3 px-4 py-2.5"><dt class="text-muted">Additional charges</dt><dd class="font-medium text-highlighted">{{ formatCurrency(num(detailsBill.additionalCharges)) }}</dd></div>
          <div class="flex items-center justify-between gap-3 bg-elevated/50 px-4 py-3"><dt class="font-semibold text-highlighted">Total</dt><dd class="text-base font-semibold text-primary">{{ formatCurrency(detailsBill.amount) }}</dd></div>
        </dl>

        <dl class="grid grid-cols-2 gap-4">
          <div><dt class="text-xs text-muted">Official receipt number</dt><dd class="font-mono font-semibold text-highlighted">{{ detailsBill.orNumber || '—' }}</dd></div>
          <div>
            <dt class="text-xs text-muted">Paid / verified on</dt>
            <dd class="font-medium text-highlighted">{{ formatDateTime(detailsBill.paidAt) || 'Not yet verified' }}</dd>
          </div>
          <div class="col-span-2">
            <dt class="text-xs text-muted">Receipt</dt>
            <dd class="mt-1">
              <a v-if="detailsBill.receipt" :href="`${baseURL}${detailsBill.receipt.url}`" target="_blank" rel="noopener" class="group block font-medium text-primary">
                <img :src="`${baseURL}${detailsBill.receipt.url}`" :alt="detailsBill.receipt.name || 'Payment receipt'" class="max-h-64 w-full rounded-md border border-default object-contain" />
                <span class="mt-1 inline-flex items-center gap-1 group-hover:underline"><UIcon name="i-lucide-external-link" class="size-3.5" />View full size</span>
              </a>
              <span v-else class="text-muted">No receipt uploaded yet</span>
            </dd>
          </div>
        </dl>
      </div>
    </DefineDetailsBody>

    <UModal
      v-if="!isMobile"
      v-model:open="detailsOpen"
      class="max-w-2xl"
      :title="`Bill for ${detailsBill?.period || 'this period'}`"
      :description="detailsBill?.tenancy?.propertySpace ? `${detailsBill.tenancy.propertySpace.name} (${detailsBill.tenancy.propertySpace.propertyCode})` : 'Monthly bill breakdown'"
    >
      <template #body><DetailsBody /></template>
    </UModal>
    <UDrawer
      v-else
      v-model:open="detailsOpen"
      :title="`Bill for ${detailsBill?.period || 'this period'}`"
      :description="detailsBill?.tenancy?.propertySpace ? `${detailsBill.tenancy.propertySpace.name} (${detailsBill.tenancy.propertySpace.propertyCode})` : 'Monthly bill breakdown'"
      :ui="{ content: 'max-h-[90dvh]', body: 'overflow-y-auto', container: 'pb-[max(1rem,env(safe-area-inset-bottom))]' }"
    >
      <template #body><DetailsBody /></template>
    </UDrawer>
  </main>
</template>
