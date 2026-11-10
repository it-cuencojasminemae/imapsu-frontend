<script setup lang="ts">
import type { StrapiFile } from '~/types/auth'
import { prepareUpload } from '~/utils/uploadFile'

definePageMeta({
  middleware: ['auth', 'role'],
  roles: ['oas', 'admin']
})

type Stall = { documentId?: string; name?: string; propertyCode?: string; building?: string }

type MeterReading = {
  id: number | string
  documentId?: string
  period?: string | null
  readingDate: string
  electricMeterPrevious?: number | string | null
  electricMeterReading?: number | string | null
  electricRate?: number | string | null
  electricConsumption?: number | string | null
  electricCharge?: number | string | null
  waterMeterPrevious?: number | string | null
  waterMeterReading?: number | string | null
  waterRate?: number | string | null
  waterConsumption?: number | string | null
  waterCharge?: number | string | null
  reviewFlags?: string[]
  notes?: string
  createdAt?: string
  electricMeterImage?: StrapiFile | null
  waterMeterImage?: StrapiFile | null
  propertySpace?: Stall | null
  // Readings recorded before they moved to stalls still name their tenancy.
  tenancy?: { documentId?: string; user?: { username?: string } | null; propertySpace?: Stall | null } | null
  bills?: { documentId?: string; period?: string; status?: string }[] | null
  recordedBy?: { id: number; username?: string } | null
}

type ListResponse<T> = { data: T[] }

useHead({ title: 'Meter Readings | iMapSU' })

const auth = useAuth()
const notify = useNotify()
const { confirm } = useConfirmDialog()
const { baseURL, $api, getErrorMessage } = useStrapi()
const headers = {}

const filterSearch = ref('')
const recordsPage = useRecordPage(['period', 'propertySpace.name', 'propertySpace.propertyCode'], {}, filterSearch)
const { data: responseData, status, error, refresh } = await useFetch<ListResponse<MeterReading>>('/api/meter-readings', { lazy: true,
  baseURL,
  headers,
  query: computed(() => ({
    'populate[propertySpace]': true,
    'populate[tenancy][populate][propertySpace]': true,
    'populate[tenancy][populate][user]': true,
    'populate[bills][fields][0]': 'period',
    'populate[bills][fields][1]': 'status',
    'populate[recordedBy]': true,
    'populate[electricMeterImage]': true,
    'populate[waterMeterImage]': true,
    'sort[0]': 'period:desc',
    'sort[1]': 'readingDate:desc',
    ...recordsPage.query.value }))
})
const { data, hasLoaded, isInitialLoading, isRefreshing, isInitialError } = useRequestPresentation(responseData, status)

const readings = computed(() => data.value?.data ?? [])

const stallOf = (reading: MeterReading) => reading.propertySpace ?? reading.tenancy?.propertySpace ?? null
const stallLabel = (stall?: Stall | null) => stall ? `${stall.name ?? 'Stall'}${stall.propertyCode ? ` (${stall.propertyCode})` : ''}` : 'No stall'
const isBilled = (reading: MeterReading) => (reading.bills?.length ?? 0) > 0

const todayInManila = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const thisMonth = () => todayInManila().slice(0, 7)

const blankForm = () => ({
  propertySpace: '',
  period: thisMonth(),
  readingDate: todayInManila(),
  electricPrevious: '',
  electricCurrent: '',
  electricRate: '',
  waterPrevious: '',
  waterCurrent: '',
  waterRate: '',
  notes: '',
  correctionReason: ''
})
const form = reactive(blankForm())

const submitting = ref(false)
const formError = ref('')
const editing = ref<MeterReading | null>(null)
const editingStall = ref<Stall | null>(null)
const stallFallback = computed(() => editingStall.value?.documentId ? [{ label: stallLabel(editingStall.value), value: editingStall.value.documentId }] : [])

const electricPhoto = ref<File | null>(null)
const waterPhoto = ref<File | null>(null)
const electricRemoved = ref(false)
const waterRemoved = ref(false)
const electricInitialSrc = ref<string | null>(null)
const waterInitialSrc = ref<string | null>(null)

const resetPhotos = () => {
  electricPhoto.value = null
  waterPhoto.value = null
  electricRemoved.value = false
  waterRemoved.value = false
  electricInitialSrc.value = null
  waterInitialSrc.value = null
}

const asText = (value?: number | string | null) => value == null ? '' : String(value)

const openEdit = (reading: MeterReading) => {
  editing.value = reading
  editingStall.value = stallOf(reading)
  Object.assign(form, {
    propertySpace: stallOf(reading)?.documentId ?? '',
    period: reading.period ?? reading.readingDate?.slice(0, 7) ?? thisMonth(),
    readingDate: reading.readingDate ?? todayInManila(),
    electricPrevious: asText(reading.electricMeterPrevious),
    electricCurrent: asText(reading.electricMeterReading),
    electricRate: asText(reading.electricRate),
    waterPrevious: asText(reading.waterMeterPrevious),
    waterCurrent: asText(reading.waterMeterReading),
    waterRate: asText(reading.waterRate),
    notes: reading.notes ?? '',
    correctionReason: ''
  })
  resetPhotos()
  electricInitialSrc.value = reading.electricMeterImage ? `${baseURL}${reading.electricMeterImage.url}` : null
  waterInitialSrc.value = reading.waterMeterImage ? `${baseURL}${reading.waterMeterImage.url}` : null
  formError.value = ''
  existingReading.value = null
  // The carried-over note is for new readings only.
  carryRequest++
  carriedFrom.value = null
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

const cancelEdit = () => {
  editing.value = null
  editingStall.value = null
  Object.assign(form, blankForm())
  resetPhotos()
  formError.value = ''
  carriedFrom.value = null
  existingReading.value = null
}

// A billed reading is part of a bill's record, so only its notes and photos change.
const locked = computed(() => !!editing.value && isBilled(editing.value))

// A new reading starts where the stall's last one ended, at the same rates.
// Only blank fields are filled, so nothing typed by hand is replaced.
const carriedFrom = ref<MeterReading | null>(null)
let carryRequest = 0
const carryOver = async () => {
  const request = ++carryRequest
  carriedFrom.value = null
  if (editing.value || !form.propertySpace || !/^\d{4}-\d{2}$/.test(form.period)) return
  try {
    const result = await $api<ListResponse<MeterReading>>('/api/meter-readings', {
      query: {
        'filters[propertySpace][documentId][$eq]': form.propertySpace,
        'filters[period][$lt]': form.period,
        'sort[0]': 'period:desc',
        'sort[1]': 'readingDate:desc',
        'pagination[pageSize]': 1
      }
    })
    if (request !== carryRequest) return
    const last = result.data[0]
    if (!last) return
    carriedFrom.value = last
    if (form.electricPrevious === '' && last.electricMeterReading != null) form.electricPrevious = String(last.electricMeterReading)
    if (form.waterPrevious === '' && last.waterMeterReading != null) form.waterPrevious = String(last.waterMeterReading)
    if (form.electricRate === '' && last.electricRate != null) form.electricRate = String(last.electricRate)
    if (form.waterRate === '' && last.waterRate != null) form.waterRate = String(last.waterRate)
  } catch {
    // Best effort: the OAS can always type the previous reading and rate.
  }
}
watch(() => form.propertySpace, (stall, previous) => {
  if (editing.value) return
  // Another stall's meters have nothing to do with this one's.
  if (previous) Object.assign(form, { electricPrevious: '', waterPrevious: '', electricRate: '', waterRate: '' })
  carryOver()
})
watch(() => form.period, carryOver)

// A stall has one reading per billing period, holding both its electricity and
// water. Picking a stall and period that already has one points the OAS to it,
// and the server refuses a second one either way.
const DUPLICATE_READING = 'A meter reading for this stall and billing period already exists. Please view the existing record instead of creating another one.'
const existingReading = ref<MeterReading | null>(null)
let existingRequest = 0
const findExisting = async () => {
  const request = ++existingRequest
  existingReading.value = null
  if (editing.value || !form.propertySpace || !/^\d{4}-\d{2}$/.test(form.period)) return
  try {
    const result = await $api<ListResponse<MeterReading>>('/api/meter-readings', {
      query: {
        'filters[propertySpace][documentId][$eq]': form.propertySpace,
        'filters[period][$eq]': form.period,
        'populate[propertySpace]': true,
        'populate[bills][fields][0]': 'period',
        'populate[bills][fields][1]': 'status',
        'populate[recordedBy]': true,
        'populate[electricMeterImage]': true,
        'populate[waterMeterImage]': true,
        'pagination[pageSize]': 1
      }
    })
    if (request === existingRequest) existingReading.value = result.data[0] ?? null
  } catch {
    // Best effort: the server still refuses a second reading.
  }
}
watch(() => [form.propertySpace, form.period], findExisting)
const viewExisting = () => {
  if (existingReading.value) openEdit(existingReading.value)
}

// Filling in a blank value adds to a reading; changing a saved one is a
// correction and needs a reason for the audit log.
const corrections = computed(() => {
  const reading = editing.value
  if (!reading) return []
  const changed = (saved: number | string | null | undefined, value: string, label: string) =>
    saved != null && saved !== '' && (value === '' || Number(value) !== Number(saved)) ? [label] : []
  return [
    ...(stallOf(reading)?.documentId && form.propertySpace !== stallOf(reading)?.documentId ? ['stall'] : []),
    ...(reading.period && form.period !== reading.period ? ['billing period'] : []),
    ...changed(reading.electricMeterPrevious, form.electricPrevious, 'previous electric reading'),
    ...changed(reading.electricMeterReading, form.electricCurrent, 'current electric reading'),
    ...changed(reading.electricRate, form.electricRate, 'electric rate'),
    ...changed(reading.waterMeterPrevious, form.waterPrevious, 'previous water reading'),
    ...changed(reading.waterMeterReading, form.waterCurrent, 'current water reading'),
    ...changed(reading.waterRate, form.waterRate, 'water rate')
  ]
})

// Preview of what saving works out. The saved reading holds the figures bills use.
const usageOf = (previous: string, current: string) => {
  if (previous === '' || current === '') return null
  const usage = Number(current) - Number(previous)
  return usage > 0 ? Math.round(usage * 1000) / 1000 : 0
}
const chargeOf = (usage: number | null, rate: string) => usage == null || rate === '' ? null : Math.round(usage * Number(rate) * 100) / 100
const electricUsage = computed(() => usageOf(form.electricPrevious, form.electricCurrent))
const waterUsage = computed(() => usageOf(form.waterPrevious, form.waterCurrent))
const electricCharge = computed(() => chargeOf(electricUsage.value, form.electricRate))
const waterCharge = computed(() => chargeOf(waterUsage.value, form.waterRate))
const utilityTotal = computed(() => (electricCharge.value ?? 0) + (waterCharge.value ?? 0))
const wentBackwards = (previous: string, current: string) => previous !== '' && current !== '' && Number(current) < Number(previous)

const uploadPhoto = async (photo: File) => {
  const upload = new FormData()
  upload.append('purpose', 'meter')
  upload.append('files', await prepareUpload(photo))
  const uploaded = await $api<StrapiFile[]>('/api/upload', { method: 'POST', body: upload })
  return uploaded[0]!.id
}

const save = async () => {
  formError.value = ''
  if (!form.propertySpace) {
    formError.value = 'Please choose a stall.'
    return
  }
  if (!/^\d{4}-\d{2}$/.test(form.period)) {
    formError.value = 'Please choose the billing period.'
    return
  }
  if (form.electricCurrent === '' && form.waterCurrent === '') {
    formError.value = 'Provide at least one current meter reading (electric or water).'
    return
  }
  if (!editing.value && existingReading.value) {
    formError.value = DUPLICATE_READING
    return
  }
  if (corrections.value.length && !form.correctionReason.trim()) {
    formError.value = 'Give the reason for correcting this reading.'
    return
  }
  submitting.value = true
  try {
    let electricMeterImage: number | null = editing.value?.electricMeterImage?.id ?? null
    let waterMeterImage: number | null = editing.value?.waterMeterImage?.id ?? null
    if (electricPhoto.value) electricMeterImage = await uploadPhoto(electricPhoto.value)
    else if (electricRemoved.value) electricMeterImage = null
    if (waterPhoto.value) waterMeterImage = await uploadPhoto(waterPhoto.value)
    else if (waterRemoved.value) waterMeterImage = null

    // An edit has to send cleared values, or the reading keeps its old ones.
    const blank = editing.value ? null : undefined
    const number = (value: string) => value === '' ? blank : Number(value)
    const body = {
      data: {
        propertySpace: form.propertySpace,
        period: form.period,
        readingDate: form.readingDate,
        electricMeterPrevious: number(form.electricPrevious),
        electricMeterReading: number(form.electricCurrent),
        electricRate: number(form.electricRate),
        waterMeterPrevious: number(form.waterPrevious),
        waterMeterReading: number(form.waterCurrent),
        waterRate: number(form.waterRate),
        notes: form.notes?.trim() || blank,
        electricMeterImage,
        waterMeterImage
      },
      ...(corrections.value.length ? { correctionReason: form.correctionReason.trim() } : {})
    }
    const saved = editing.value
      ? await $api<{ data: MeterReading }>(`/api/meter-readings/${editing.value.documentId ?? editing.value.id}`, { method: 'PUT', body })
      : await $api<{ data: MeterReading }>('/api/meter-readings', { method: 'POST', body })
    const flags = saved?.data?.reviewFlags ?? []
    const title = editing.value ? (corrections.value.length ? 'Meter reading corrected' : 'Meter reading updated') : 'Meter reading recorded'
    if (flags.length) notify.warning(title, { description: flags.join('; ') })
    else notify.success(title)
    cancelEdit()
    await refresh()
  } catch (err) {
    formError.value = getErrorMessage(err)
    // Someone else saved this stall's reading for the period first.
    if (!editing.value && formError.value === DUPLICATE_READING) await findExisting()
  } finally {
    submitting.value = false
  }
}

// The row's Delete button spins while its record is being removed.
const deleting = ref<string | number | null>(null)
const remove = async (reading: MeterReading) => {
  const label = `${stallLabel(stallOf(reading))}${reading.period ? ` for ${reading.period}` : ''}`
  if (!await confirm({ title: 'Delete meter reading?', description: `The meter reading of ${label} will be permanently removed.`, confirmLabel: 'Delete reading', icon: 'i-lucide-trash-2' })) return
  deleting.value = reading.documentId ?? reading.id
  try {
    await $api(`/api/meter-readings/${reading.documentId ?? reading.id}`, { method: 'DELETE' })
    notify.success('Meter reading deleted')
    if (editing.value && (editing.value.documentId ?? editing.value.id) === (reading.documentId ?? reading.id)) cancelEdit()
    await refresh()
  } catch (err) {
    notify.error('Unable to delete meter reading', { description: getErrorMessage(err) })
  } finally {
    deleting.value = null
  }
}

const formatDate = (value?: string) => value
  ? new Date(value + (value.length === 10 ? 'T00:00:00' : '')).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  : ''

const formatDateTime = (value?: string) => value
  ? new Date(value).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  : ''

const formatPeriod = (value?: string | null) => {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) return value || '—'
  return new Date(`${value}-01T00:00:00`).toLocaleDateString(undefined, { year: 'numeric', month: 'long' })
}

const formatCurrency = (amount?: number | string | null) => amount == null || amount === ''
  ? '—'
  : new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 2 }).format(Number(amount))

// Utility rates can carry up to four decimals (e.g. ₱11.0307 per kWh).
const formatRate = (rate?: number | string | null) => rate == null || rate === ''
  ? '—'
  : new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(Number(rate))

const formatUsage = (value?: number | string | null, unit = '') => value == null || value === '' ? '—' : `${Number(value).toLocaleString()}${unit ? ` ${unit}` : ''}`

const readingTotal = (reading: MeterReading) =>
  reading.electricCharge == null && reading.waterCharge == null ? null : Number(reading.electricCharge ?? 0) + Number(reading.waterCharge ?? 0)

const utilityRows = (reading: MeterReading) => [
  { key: 'electric', label: 'Electricity', icon: 'i-lucide-zap', unit: 'kWh', previous: reading.electricMeterPrevious, current: reading.electricMeterReading, rate: reading.electricRate, consumption: reading.electricConsumption, charge: reading.electricCharge },
  { key: 'water', label: 'Water', icon: 'i-lucide-droplets', unit: 'm³', previous: reading.waterMeterPrevious, current: reading.waterMeterReading, rate: reading.waterRate, consumption: reading.waterConsumption, charge: reading.waterCharge }
]

const isMine = (reading: MeterReading) => reading.recordedBy?.id === auth.user.value?.id
const recordColumns = [
  { key: 'space', label: 'Stall', value: (reading: MeterReading) => stallLabel(stallOf(reading)) },
  { key: 'period', label: 'Billing period', value: (reading: MeterReading) => formatPeriod(reading.period) },
  { key: 'electric', label: 'Electricity', value: (reading: MeterReading) => reading.electricConsumption != null ? `${formatUsage(reading.electricConsumption, 'kWh')} · ${formatCurrency(reading.electricCharge)}` : '—' },
  { key: 'water', label: 'Water', value: (reading: MeterReading) => reading.waterConsumption != null ? `${formatUsage(reading.waterConsumption, 'm³')} · ${formatCurrency(reading.waterCharge)}` : '—' },
  { key: 'amount', label: 'Utility charges', value: (reading: MeterReading) => formatCurrency(readingTotal(reading)) },
  { key: 'status', label: 'Status', value: (reading: MeterReading) => isBilled(reading) ? 'Billed' : 'Not billed', badge: true, color: (reading: MeterReading) => isBilled(reading) ? 'success' : 'neutral' }
]
</script>

<template>
  <main class="imapsu-page imapsu-page--admin">
    <AppPageHeader>
      <template #title>Meter readings</template>
      <template #description><p class="mt-2 max-w-xl text-muted">Save each stall's previous and current electricity and water readings for a billing period. Consumption and charges are worked out here, and Issue Bill uses them for the stall's tenant.</p></template>
      <template #actions><UButton label="Refresh" icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="status === 'pending'" @click="refresh" /></template>
    </AppPageHeader>

    <div class="grid items-start gap-6">
      <UCard>
        <template #header>
          <h2 class="text-lg font-semibold text-highlighted">{{ editing ? 'Edit reading' : 'Record reading' }}</h2>
          <p v-if="!editing" class="mt-1 text-sm text-muted">Each stall has one reading per billing period, with its electricity and water together.</p>
        </template>
        <form class="space-y-4" @submit.prevent="save">
          <UAlert v-if="locked" color="info" icon="i-lucide-lock" title="A bill was issued from this reading" description="Its stall, period and meter values are part of that bill's record. You can still change the reading date, notes and photos." />

          <div class="grid gap-4 sm:grid-cols-3">
            <UFormField label="Stall" required help="Only occupied stalls are listed, since vacant stalls are not billed." class="sm:col-span-3">
              <AppRecordLookup v-model="form.propertySpace" endpoint="/api/property-spaces" :fields="['name','propertyCode','building']" :label="item => `${item.name || 'Stall'} (${item.propertyCode || '—'}) — ${item.building || 'Building'}`" :value="item => item.documentId" :query="{ 'sort[0]': 'propertyCode:asc', 'fields[0]': 'name', 'fields[1]': 'propertyCode', 'fields[2]': 'building', 'filters[space_status][$eq]': 'Occupied' }" :fallback="stallFallback" placeholder="Search stalls…" :class="{ 'pointer-events-none opacity-60': locked }" />
            </UFormField>
            <UFormField label="Billing period" required>
              <UInput v-model="form.period" type="month" required :disabled="locked" />
            </UFormField>
            <UFormField label="Reading date" required>
              <UInput v-model="form.readingDate" type="date" required />
            </UFormField>
          </div>

          <UAlert v-if="existingReading && !editing" color="warning" icon="i-lucide-copy-x" title="This stall already has a reading for this period" :description="`${DUPLICATE_READING} Open it to add a missing value or correct it.`">
            <template #actions>
              <UButton label="View existing reading" icon="i-lucide-eye" color="neutral" variant="outline" size="sm" @click="viewExisting" />
            </template>
          </UAlert>

          <UAlert v-if="carriedFrom && !existingReading" color="neutral" variant="subtle" icon="i-lucide-history" title="Previous readings carried over" :description="`From this stall's ${formatPeriod(carriedFrom.period)} reading. Change them if the meter was replaced.`" />

          <div class="grid gap-4 lg:grid-cols-2">
            <div class="rounded-lg border border-default p-4">
              <p class="flex items-center gap-1.5 text-xs font-medium text-muted"><UIcon name="i-lucide-zap" class="size-3.5" />Electricity (kWh)</p>
              <div class="mt-3 grid grid-cols-3 gap-3">
                <UFormField label="Previous"><UInput v-model="form.electricPrevious" type="number" min="0" step="any" placeholder="e.g. 1000" :disabled="locked" /></UFormField>
                <UFormField label="Current"><UInput v-model="form.electricCurrent" type="number" min="0" step="any" placeholder="e.g. 1045" :disabled="locked" /></UFormField>
                <UFormField label="Rate (₱)"><UInput v-model="form.electricRate" type="number" min="0" step="0.0001" placeholder="e.g. 11.0307" :disabled="locked" /></UFormField>
              </div>
              <UAlert v-if="wentBackwards(form.electricPrevious, form.electricCurrent)" class="mt-3" color="warning" icon="i-lucide-triangle-alert" description="The current reading is lower than the previous one, so no electricity is charged. Check for a meter replacement or rollover." />
              <dl class="mt-3 flex justify-between text-sm"><dt class="text-muted">{{ formatUsage(electricUsage, 'kWh') }} × {{ formatRate(form.electricRate) }}</dt><dd class="font-medium text-highlighted">{{ formatCurrency(electricCharge) }}</dd></dl>
            </div>
            <div class="rounded-lg border border-default p-4">
              <p class="flex items-center gap-1.5 text-xs font-medium text-muted"><UIcon name="i-lucide-droplets" class="size-3.5" />Water (m³)</p>
              <div class="mt-3 grid grid-cols-3 gap-3">
                <UFormField label="Previous"><UInput v-model="form.waterPrevious" type="number" min="0" step="any" placeholder="e.g. 500" :disabled="locked" /></UFormField>
                <UFormField label="Current"><UInput v-model="form.waterCurrent" type="number" min="0" step="any" placeholder="e.g. 512" :disabled="locked" /></UFormField>
                <UFormField label="Rate (₱)"><UInput v-model="form.waterRate" type="number" min="0" step="0.0001" placeholder="e.g. 25" :disabled="locked" /></UFormField>
              </div>
              <UAlert v-if="wentBackwards(form.waterPrevious, form.waterCurrent)" class="mt-3" color="warning" icon="i-lucide-triangle-alert" description="The current reading is lower than the previous one, so no water is charged. Check for a meter replacement or rollover." />
              <dl class="mt-3 flex justify-between text-sm"><dt class="text-muted">{{ formatUsage(waterUsage, 'm³') }} × {{ formatRate(form.waterRate) }}</dt><dd class="font-medium text-highlighted">{{ formatCurrency(waterCharge) }}</dd></dl>
            </div>
          </div>
          <div class="flex items-center justify-between rounded-lg bg-muted/30 px-4 py-3 text-sm">
            <span class="font-medium text-highlighted">Utility charges for {{ formatPeriod(form.period) }}</span>
            <span class="text-base font-semibold text-highlighted">{{ formatCurrency(utilityTotal) }}</span>
          </div>

          <div class="grid gap-4 sm:grid-cols-2">
            <MeterPhotoField
              title="Electric meter"
              hint="Upload a meter photo, review the detected value, and enter or correct the reading as needed."
              unit="kWh"
              icon="i-lucide-zap"
              :initial-src="electricInitialSrc"
              @file-change="file => (electricPhoto = file)"
              @remove-image="electricRemoved = true"
              @reading="value => { if (!locked) form.electricCurrent = String(value) }"
            />
            <MeterPhotoField
              title="Water meter"
              hint="Upload a meter photo, review the detected value, and enter or correct the reading as needed."
              unit="m³"
              icon="i-lucide-droplets"
              :initial-src="waterInitialSrc"
              @file-change="file => (waterPhoto = file)"
              @remove-image="waterRemoved = true"
              @reading="value => { if (!locked) form.waterCurrent = String(value) }"
            />
          </div>

          <UFormField label="Notes">
            <UTextarea v-model="form.notes" :rows="2" placeholder="Anything unusual about the meters…" />
          </UFormField>

          <UFormField v-if="corrections.length" label="Reason for correction" required :help="`Changing the saved ${corrections.join(', ')} is recorded in the audit log with this reason.`">
            <UTextarea v-model="form.correctionReason" :rows="2" maxlength="500" placeholder="e.g. Misread the last digit of the electric meter" />
          </UFormField>

          <UAlert v-if="formError && !(formError === DUPLICATE_READING && existingReading && !editing)" color="error" icon="i-lucide-triangle-alert" :description="formError" />

          <div class="flex gap-2">
            <UButton data-prominent="true" type="submit" block :loading="submitting" :disabled="!editing && !!existingReading">
              {{ editing ? (corrections.length ? 'Save correction' : 'Save changes') : 'Record reading' }}
            </UButton>
            <UButton v-if="editing" label="Cancel" color="neutral" variant="ghost" :disabled="submitting" @click="cancelEdit" />
          </div>
        </form>
      </UCard>

      <div class="space-y-4">
        <UInput v-model="filterSearch" class="w-full sm:max-w-sm" placeholder="Search stall, code or period…" icon="i-lucide-search" aria-label="Search meter readings" />
        <AppRefreshState :refreshing="isRefreshing" :failed="hasLoaded && !!error" @retry="refresh" />
        <AppLoadingState v-if="isInitialLoading" variant="table" :toolbar="false" :count="6" label="Loading meter readings…" />

        <UAlert v-else-if="isInitialError" color="error" icon="i-lucide-triangle-alert" title="Unable to load meter readings" description="Please try again."><template #actions><UButton label="Retry" color="neutral" variant="outline" @click="refresh" /></template></UAlert>

        <UEmpty v-else-if="readings.length === 0" icon="i-lucide-gauge" :title="filterSearch ? 'No matching readings' : 'No meter readings'" :description="filterSearch ? 'No readings match your search.' : 'Readings you record will appear here.'" />

        <AppRecordTable v-else :items="readings" :columns="recordColumns" :item-key="reading => reading.documentId ?? reading.id" caption="Meter readings">
          <template #details="{ item: reading }">
            <UAlert v-if="reading.reviewFlags?.length" class="mb-3" color="warning" title="Reading review flags" :description="reading.reviewFlags.join('; ')" />
            <UCard :ui="{ body: 'p-5' }">
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div class="min-w-0">
                  <p class="font-medium text-highlighted">{{ stallLabel(stallOf(reading)) }} · {{ formatPeriod(reading.period) }}</p>
                  <p class="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                    <span class="flex items-center gap-1"><UIcon name="i-lucide-calendar-days" class="size-3.5" />Read {{ formatDate(reading.readingDate) }}</span>
                    <span class="flex items-center gap-1"><UIcon name="i-lucide-circle-user-round" class="size-3.5" />{{ reading.recordedBy?.username ?? 'Staff' }}</span>
                    <span class="flex items-center gap-1"><UIcon name="i-lucide-clock-3" class="size-3.5" />{{ formatDateTime(reading.createdAt) }}</span>
                  </p>
                </div>
                <div class="flex flex-wrap items-center gap-2">
                  <UBadge v-if="isBilled(reading)" color="success" variant="subtle" icon="i-lucide-receipt">Billed</UBadge>
                  <UBadge v-if="isMine(reading)" color="primary" variant="subtle">Recorded by you</UBadge>
                  <template v-if="auth.isOas.value">
                    <UButton label="Edit" icon="i-lucide-pencil" color="neutral" variant="subtle" size="sm" @click="openEdit(reading)" />
                    <UButton v-if="!isBilled(reading)" label="Delete" icon="i-lucide-trash-2" color="error" variant="ghost" size="sm" :loading="deleting === (reading.documentId ?? reading.id)" :disabled="deleting !== null" @click="remove(reading)" />
                  </template>
                </div>
              </div>

              <div class="mt-4 overflow-x-auto">
                <table class="w-full min-w-[32rem] text-sm">
                  <thead class="text-left text-xs text-muted">
                    <tr><th class="py-1.5 font-medium">Utility</th><th class="py-1.5 font-medium">Previous</th><th class="py-1.5 font-medium">Current</th><th class="py-1.5 font-medium">Consumption</th><th class="py-1.5 font-medium">Rate</th><th class="py-1.5 text-right font-medium">Charge</th></tr>
                  </thead>
                  <tbody class="divide-y divide-default">
                    <tr v-for="row in utilityRows(reading)" :key="row.key">
                      <td class="py-2"><span class="flex items-center gap-1.5 font-medium text-highlighted"><UIcon :name="row.icon" class="size-3.5 text-muted" />{{ row.label }}</span></td>
                      <td class="py-2">{{ formatUsage(row.previous) }}</td>
                      <td class="py-2">{{ formatUsage(row.current) }}</td>
                      <td class="py-2">{{ formatUsage(row.consumption, row.unit) }}</td>
                      <td class="py-2">{{ formatRate(row.rate) }}</td>
                      <td class="py-2 text-right font-medium text-highlighted">{{ formatCurrency(row.charge) }}</td>
                    </tr>
                    <tr><td colspan="5" class="py-2 font-medium text-highlighted">Utility charges</td><td class="py-2 text-right font-semibold text-highlighted">{{ formatCurrency(readingTotal(reading)) }}</td></tr>
                  </tbody>
                </table>
              </div>

              <p v-if="isBilled(reading)" class="mt-3 text-xs text-muted">Billed for {{ reading.bills!.map(bill => bill.period).filter(Boolean).join(', ') || 'this period' }}. Its meter values can no longer change.</p>
              <p v-else-if="!reading.period" class="mt-3 text-xs text-muted">Recorded before readings had a billing period. Edit it to set one so Issue Bill can use it.</p>

              <div v-if="reading.electricMeterImage || reading.waterMeterImage" class="mt-3 grid grid-cols-2 gap-2">
                <a v-if="reading.electricMeterImage" :href="`${baseURL}${reading.electricMeterImage.url}`" target="_blank" rel="noopener">
                  <img :src="`${baseURL}${reading.electricMeterImage.url}`" :alt="reading.electricMeterImage.name || 'Electric meter photo'" class="h-24 w-full rounded-lg object-cover transition-transform hover:scale-[1.02]" />
                </a>
                <a v-if="reading.waterMeterImage" :href="`${baseURL}${reading.waterMeterImage.url}`" target="_blank" rel="noopener">
                  <img :src="`${baseURL}${reading.waterMeterImage.url}`" :alt="reading.waterMeterImage.name || 'Water meter photo'" class="h-24 w-full rounded-lg object-cover transition-transform hover:scale-[1.02]" />
                </a>
              </div>

              <p v-if="reading.notes" class="mt-4 rounded-lg bg-muted/20 px-3 py-2 text-sm text-muted">{{ reading.notes }}</p>
            </UCard>
          </template>
        </AppRecordTable>
      </div>
    </div>
    <AppRecordPagination :state="recordsPage" :response="data" :pending="status === 'pending'" />
  </main>
</template>
