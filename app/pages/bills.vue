<script setup lang="ts">
import { prepareUpload } from '~/utils/uploadFile'

definePageMeta({
  middleware: ['auth', 'role'],
  roles: ['current-tenant']
})

type Bill = {
  id: number | string
  documentId?: string
  period?: string
  amount: number | string
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
const toast = useToast()
const { baseURL, $api, getErrorMessage } = useStrapi()
const headers = {}

const recordsPage = useRecordPage([], {  })
const { data: responseData, status, error, refresh } = await useFetch<ListResponse<Bill>>('/api/bills', {
  baseURL,
  headers,
  query: computed(() => ({
    'populate[tenancy][populate][propertySpace]': true,
    'populate[receipt]': true,
    sort: 'period:desc', ...recordsPage.query.value }))
})
const { data, hasLoaded, isInitialLoading, isRefreshing, isInitialError } = useRequestPresentation(responseData, status)


const { data: billingSummaryResponse, status: billingSummaryStatus, error: billingSummaryError, refresh: refreshBillingSummary } = await useFetch<any>('/api/dashboard/billing-summary', { baseURL, headers })
const { data: billingSummary } = useRequestPresentation(billingSummaryResponse, billingSummaryStatus)
watch(responseData, () => { refreshBillingSummary() })
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
    toast.add({
      title: 'Receipt attached',
      description: detected
        ? `Receipt uploaded. Please review the official receipt number (${detected}) before submitting.`
        : 'Receipt uploaded. No official receipt number is available. Enter it below before submitting.',
      color: 'success',
      icon: 'i-lucide-file-check-2'
    })
    await refresh()
  } catch (err) {
    uploadErrors[key] = getErrorMessage(err)
  } finally {
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
    toast.add({
      title: 'Receipt submitted for verification.',
      description: 'The Office of Auxiliary Services will review your submitted receipt.',
      color: 'success',
      icon: 'i-lucide-check-circle-2'
    })
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
    toast.add({
      title: 'Receipt removed',
      description: 'The uploaded receipt has been removed from this bill.',
      color: 'neutral',
      icon: 'i-lucide-trash-2'
    })
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

const canSubmitPayment = (bill: Bill) => bill.status !== 'Verified'
</script>

<template>
  <main class="imapsu-page">
    <AppPageHeader>
      <template #eyebrow>Current tenant</template>
      <template #title>Bills</template>
      <template #description><p class="mt-2 max-w-xl text-muted">Review advance billing information for rent and utilities. Make payments through the University Cashier, then submit the official receipt for verification.</p></template>
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
    <AppLoadingState v-if="isInitialLoading" :count="4" height="h-24" />

    <UAlert v-else-if="isInitialError" color="error" icon="i-lucide-triangle-alert" title="Unable to load bills" description="Please try again." ><template #actions><UButton label="Retry" color="neutral" variant="outline" @click="refresh" /></template></UAlert>

    <UEmpty v-else-if="bills.length === 0" icon="i-lucide-receipt" title="No bills yet" description="Bills for your tenancy will appear here once issued." />

    <div v-else class="space-y-4">
      <UCard v-for="bill in bills" :key="bill.documentId ?? bill.id" :ui="{ body: 'p-5' }">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="font-medium text-highlighted">{{ bill.period || 'Billing period' }}</p>
            <p v-if="bill.tenancy?.propertySpace" class="mt-1 flex items-center gap-1 text-xs text-muted">
              <UIcon name="i-lucide-building-2" class="size-3.5" />
              {{ bill.tenancy.propertySpace.name }}
              <span class="font-mono">({{ bill.tenancy.propertySpace.propertyCode }})</span>
            </p>
          </div>
          <div class="flex items-center gap-2">
            <UBadge v-if="isOverdue(bill) && bill.status !== 'Overdue'" color="error" variant="solid">Overdue</UBadge>
            <UBadge :color="statusColor(bill)" variant="subtle">{{ statusLabel(bill) }}</UBadge>
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
            <dt class="text-xs text-muted">Official Receipt Number</dt>
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

        <div v-if="canSubmitPayment(bill)" class="mt-5 border-t border-default pt-4">
          <h2 class="mb-2 text-base font-semibold text-highlighted">Submit Payment Receipt</h2><p class="mb-4 text-sm text-muted">Upload the official receipt issued by the University Cashier for payment recording and verification.</p>

          <UAlert v-if="bill.status === 'For Verification'" color="info" icon="i-lucide-clock-3" title="For Verification" description="Your receipt has been submitted and is being reviewed by the Office of Auxiliary Services." class="mb-4" />
          <UAlert v-else-if="bill.status === 'Rejected'" color="error" icon="i-lucide-x-circle" title="Receipt rejected" :description="bill.verificationNote || 'Your submitted receipt was not accepted. Please review it and try again.'" class="mb-4" />
          <UAlert v-else-if="bill.status === 'Overdue'" color="warning" icon="i-lucide-alarm-clock" title="Overdue" description="This bill is past its due date. Please settle it as soon as possible." class="mb-4" />

          <template v-if="!bill.receipt">
            <div class="flex flex-wrap items-center gap-3">
              <label class="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-default px-3 py-2 text-sm font-medium text-primary hover:border-primary" :class="{ 'pointer-events-none opacity-60': isUploading(bill) }">
                <UIcon :name="isUploading(bill) ? 'i-lucide-loader-2' : 'i-lucide-file-up'" class="size-4" :class="{ 'animate-spin': isUploading(bill) }" />
                {{ isUploading(bill) ? 'Uploading…' : 'Choose receipt' }}
                <input type="file" accept="image/*,.pdf" class="sr-only" :disabled="isUploading(bill)" @change="(event: Event) => onReceiptSelected(bill, event)" />
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
                <input type="file" accept="image/*,.pdf" class="sr-only" :disabled="isUploading(bill)" @change="(event: Event) => onReceiptSelected(bill, event)" />
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
              <UFormField label="Official Receipt Number" description="Review the receipt number before submitting. Enter or correct it manually if needed." class="min-w-56">
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
  </main>
</template>
