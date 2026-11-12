<script setup lang="ts">
import { MAX_FILE_BYTES, MAX_FILE_MB, uploadInBatches } from '~/utils/uploadFile'
import { businessTypeItems } from '~/utils/businessTypes'

definePageMeta({
  middleware: ['auth', 'role'],
  roles: ['aspiring-tenant', 'current-tenant']
})

type MediaDoc = { id: number; url?: string; name?: string }
type DocField = 'letterOfIntent' | 'dtiDocuments' | 'birDocuments' | 'businessPermits'

type RentalApplication = {
  id: number | string
  documentId?: string
  status: 'Pending' | 'For Review' | 'For Recommendation' | 'Approved' | 'Declined' | 'Cancelled'
  message?: string
  createdAt?: string
  letterOfIntent?: MediaDoc | null
  dtiDocuments?: MediaDoc[] | null
  birDocuments?: MediaDoc[] | null
  businessPermits?: MediaDoc[] | null
  productsServices?: string
  businessName?: string
  businessType?: string
  appearanceDate?: string
  appearanceConfirmed?: boolean
  propertySpace?: { documentId?: string; name?: string; propertyCode?: string; building?: string } | null
  tenancy?: { documentId?: string } | null
}

type PropertySpace = { documentId: string; name: string; propertyCode: string; building: string; monthlyRent?: number | string; inReview?: boolean }
type ListResponse<T> = { data: T[] }

useHead({ title: 'Rental Applications | iMapSU' })

const auth = useAuth()
const notify = useNotify()
const { confirm } = useConfirmDialog()
const route = useRoute()
const { baseURL, $api, getErrorMessage } = useStrapi()
const headers = {}

const recordsPage = useRecordPage([], {  })
const { data: responseData, status, error, refresh } = await useFetch<ListResponse<RentalApplication>>('/api/rental-applications', { lazy: true,
  baseURL,
  headers,
  query: computed(() => ({
    'populate[propertySpace]': true,
    'populate[tenancy]': true,
    'populate[letterOfIntent]': true,
    'populate[dtiDocuments]': true,
    'populate[birDocuments]': true,
    'populate[businessPermits]': true,
    sort: 'createdAt:desc', ...recordsPage.query.value }))
})
const { data, hasLoaded, isInitialLoading, isRefreshing, isInitialError } = useRequestPresentation(responseData, status)


const { data: propertyData, status: propertyStatus } = await useCompleteFetch<ListResponse<PropertySpace>>('/api/properties', { lazy: true,
  baseURL,
  headers,
  query: {
    'fields[0]': 'name',
    'fields[1]': 'propertyCode',
    'fields[2]': 'building',
    'fields[3]': 'monthlyRent',
    'filters[space_status][$eq]': 'Vacant',
    'pagination[pageSize]': 100
  }
})

// Types of business occupied stalls already run. The OAS allows one stall per
// type on campus, so an aspiring tenant cannot pick these. A current tenant may
// be moving their own business, so the server decides for them.
const { data: occupiedData } = await useCompleteFetch<ListResponse<{ businessType?: string | null }>>('/api/properties', { lazy: true,
  baseURL,
  headers,
  query: {
    'fields[0]': 'businessType',
    'filters[space_status][$eq]': 'Occupied',
    'pagination[pageSize]': 100
  }
})
const takenBusinessTypes = computed(() => (occupiedData.value?.data ?? []).map(stall => stall.businessType).filter((type): type is string => !!type))
const businessTypeOptions = computed(() => businessTypeItems(takenBusinessTypes.value, auth.isCurrentTenant.value))

// Stalls the applicant already has an open application for. Only one open
// application per stall is allowed, so the lookup greys these out.
const OPEN_STATUSES = ['Pending', 'For Review', 'For Recommendation', 'Approved']
const { data: openData, status: openStatus, refresh: refreshOpen } = await useCompleteFetch<ListResponse<RentalApplication>>('/api/rental-applications', { lazy: true,
  baseURL,
  headers,
  query: {
    'fields[0]': 'status',
    'populate[propertySpace][fields][0]': 'name',
    'populate[tenancy][fields][0]': 'status',
    ...Object.fromEntries(OPEN_STATUSES.map((value, index) => [`filters[status][$in][${index}]`, value]))
  }
})
const appliedStallIds = computed(() => new Set(
  (openData.value?.data ?? [])
    .filter(item => OPEN_STATUSES.includes(item.status) && !item.tenancy && item.propertySpace?.documentId)
    .map(item => item.propertySpace!.documentId!)
))
// The application being edited may keep its own stall.
const alreadyApplied = (documentId?: string) => !!documentId && appliedStallIds.value.has(documentId) && documentId !== editing.value?.propertySpace?.documentId
// A stall the OAS is reviewing someone else's application for is closed to
// new applications. The applicant's own stalls read "already applied" instead.
const inReview = (item?: PropertySpace | null) => !!item?.inReview && !appliedStallIds.value.has(item.documentId) && item.documentId !== editing.value?.propertySpace?.documentId
const unavailable = (item: PropertySpace) => alreadyApplied(item.documentId) || inReview(item)
const stallLabel = (item: PropertySpace) => `${item.name} (${item.propertyCode})${alreadyApplied(item.documentId) ? ' · already applied' : inReview(item) ? ' · in review' : ''}`

// Applications accept PDF, Word, JPG and PNG only; the server checks the
// file contents as well.
const ALLOWED_EXTENSIONS = /\.(pdf|docx?|jpe?g|png)$/i
const FILE_ACCEPT = '.pdf,.doc,.docx,.jpg,.jpeg,.png'
const allowedFiles = (files: File[]) => {
  const rejected = files.filter(file => !ALLOWED_EXTENSIONS.test(file.name))
  if (rejected.length === 0) return withinSizeLimit(files)
  notify.error('Unsupported file type', { description: `${rejected.map(file => file.name).join(', ')} cannot be attached. Upload PDF, Word (.doc, .docx), JPG or PNG files only.` })
  return false
}
const withinSizeLimit = (files: File[]) => {
  const tooLarge = files.filter(file => file.size > MAX_FILE_BYTES)
  if (tooLarge.length === 0) return true
  notify.error('File is too large', { description: `${tooLarge.map(file => file.name).join(', ')} cannot be attached. Each file must be ${MAX_FILE_MB} MB or smaller.` })
  return false
}

// The stall rules and regulations every applicant accepts when applying.
const rulesAccepted = ref(false)
const rulesOpen = ref(false)
const { data: rulesData, status: rulesStatus, refresh: refreshRules } = await useFetch<{ data: { stallRules: string } }>('/api/system-settings/stall-rules', {
  baseURL,
  headers,
  lazy: true,
  server: false
})
const stallRules = computed(() => rulesData.value?.data?.stallRules ?? '')
const openRules = () => {
  rulesOpen.value = true
  if (!stallRules.value) refreshRules()
}

const applications = computed(() => data.value?.data ?? [])
const vacantProperties = computed(() => propertyData.value?.data ?? [])
const propertyOptions = computed(() => vacantProperties.value.map(property => ({
  label: `${property.name} (${property.propertyCode})${property.monthlyRent ? ` · ₱${Number(property.monthlyRent).toLocaleString()}` : ''}`,
  value: property.documentId
})))

// The lookup only fetches 25 stalls at a time, so the full vacant list backs the
// chosen stall's name. A stall can also stop being vacant after applying, so the
// edit form adds the application's own stall to keep its name.
const lookupFallback = computed(() => {
  const stall = editing.value?.propertySpace
  return stall?.documentId && !propertyOptions.value.some(option => option.value === stall.documentId)
    ? [...propertyOptions.value, { label: `${stall.name} (${stall.propertyCode})`, value: stall.documentId }]
    : propertyOptions.value
})
const chosenStall = computed(() => vacantProperties.value.find(property => property.documentId === selectedProperty.value) ?? null)

const docSections: { key: DocField; label: string; hint: string }[] = [
  { key: 'letterOfIntent', label: 'Letter of intent', hint: 'Signed letter of intent as a PDF, Word, JPG or PNG file.' },
  { key: 'dtiDocuments', label: 'SEC/DTI business documents', hint: 'e.g. DTI business name registration or SEC certificate of incorporation.' },
  { key: 'birDocuments', label: 'BIR business documents', hint: 'e.g. BIR Certificate of Registration (2303), latest tax returns.' },
  { key: 'businessPermits', label: 'Business permits', hint: 'e.g. city/municipal business permit, fire safety inspection certificate.' }
]
// Mid-sentence labels keep acronyms such as SEC/DTI and BIR in capitals.
const inSentence = (label: string) => /^[A-Z][a-z]/.test(label) ? label[0]!.toLowerCase() + label.slice(1) : label
const stagedSections = computed(() => docSections.filter(section => section.key !== 'letterOfIntent') as { key: Exclude<DocField, 'letterOfIntent'>; label: string; hint: string }[])

const docsOf = (item: RentalApplication, key: DocField) => {
  const value = item[key]
  if (Array.isArray(value)) return value.filter(Boolean)
  return value ? [value] : []
}

const selectedProperty = ref<string>()
// Arriving from Apply on a stall fixes the application to that stall.
const stallLocked = ref(false)
const message = ref('')
const productsServices = ref('')
const businessName = ref('')
const businessType = ref<string>()
const letterFile = ref<File>()
const letterFormKey = ref(0)
const submitting = ref(false)
const errorMessage = ref('')
const formOpen = ref(false)

type StagedFile = { key: number; file: File }
const staged = reactive<Record<Exclude<DocField, 'letterOfIntent'>, StagedFile[]>>({
  dtiDocuments: [],
  birDocuments: [],
  businessPermits: []
})
let stagedKey = 0
const addFiles = (field: Exclude<DocField, 'letterOfIntent'>, files?: FileList) => {
  if (!files) return
  const list = Array.from(files)
  if (!allowedFiles(list)) return
  list.forEach(file => staged[field].push({ key: stagedKey++, file }))
}
const removeFile = (field: Exclude<DocField, 'letterOfIntent'>, key: number) => {
  staged[field] = staged[field].filter(entry => entry.key !== key)
}

// Editing keeps the files already on the application and adds any new ones.
const editing = ref<RentalApplication | null>(null)
const kept = reactive<Record<DocField, MediaDoc[]>>({
  letterOfIntent: [],
  dtiDocuments: [],
  birDocuments: [],
  businessPermits: []
})
const removeKept = (field: DocField, id: number) => {
  kept[field] = kept[field].filter(doc => doc.id !== id)
}

const resetForm = () => {
  editing.value = null
  selectedProperty.value = undefined
  stallLocked.value = false
  message.value = ''
  productsServices.value = ''
  businessName.value = ''
  businessType.value = undefined
  letterFile.value = undefined
  letterFormKey.value++
  staged.dtiDocuments = []
  staged.birDocuments = []
  staged.businessPermits = []
  docSections.forEach(section => { kept[section.key] = [] })
  rulesAccepted.value = false
  errorMessage.value = ''
  step.value = 'documents'
}

const chooseLetter = (input: HTMLInputElement) => {
  const file = input.files?.[0]
  if (file && allowedFiles([file])) letterFile.value = file
  input.value = ''
}

// The stall from ?property stays the application's stall for as long as it can
// still be applied for, so reopening the form keeps it. Once the applicant has
// applied for it, or it stops being available, the form offers the full list.
const openNew = () => {
  resetForm()
  const stall = vacantProperties.value.find(property => property.documentId === preselectProperty.value)
  if (stall && !unavailable(stall)) {
    selectedProperty.value = stall.documentId
    stallLocked.value = true
  }
  formOpen.value = true
}

const openEdit = (item: RentalApplication) => {
  resetForm()
  editing.value = item
  selectedProperty.value = item.propertySpace?.documentId
  message.value = item.message ?? ''
  productsServices.value = item.productsServices ?? ''
  businessName.value = item.businessName ?? ''
  businessType.value = item.businessType || undefined
  docSections.forEach(section => { kept[section.key] = [...docsOf(item, section.key)] })
  formOpen.value = true
}

// The OAS starts work once an application leaves Pending, so edits and
// cancelling stop there.
const canEdit = (item: RentalApplication) => item.status === 'Pending'
const canCancel = (item: RentalApplication) => item.status === 'Pending' && !item.tenancy
const underReview = (item: RentalApplication) => ['For Review', 'For Recommendation', 'Approved'].includes(item.status) && !item.tenancy

const cancellingId = ref<string | number | null>(null)
const cancelApplication = async (item: RentalApplication) => {
  const docId = item.documentId ?? item.id
  const stall = item.propertySpace?.name ?? 'this space'
  if (!await confirm({
    title: 'Cancel this application?',
    description: `Your application for ${stall} will be closed and the OAS will stop processing it. To rent it later you would need to apply again.`,
    confirmLabel: 'Cancel application',
    cancelLabel: 'Keep application',
    icon: 'i-lucide-circle-x'
  })) return
  cancellingId.value = docId
  try {
    await $api(`/api/rental-applications/${docId}/cancel`, { method: 'PUT', body: {} })
    notify.success('Application cancelled', { description: `Your application for ${stall} was cancelled.` })
    await Promise.all([refresh(), refreshOpen()])
  } catch (err) {
    notify.error('Could not cancel the application', { description: getErrorMessage(err) })
    await refresh()
  } finally {
    cancellingId.value = null
  }
}

// Apply on Rentable spaces links here with ?property=<documentId>. The stall
// list and the open applications load lazily, so the form waits for both
// before it opens with that stall already chosen.
const preselectProperty = computed(() => typeof route.query.property === 'string' ? route.query.property : '')
let handledPreselect = ''
const applyPreselect = () => {
  const id = preselectProperty.value
  if (!id || id === handledPreselect) return
  if (propertyStatus.value === 'idle' || propertyStatus.value === 'pending' || openStatus.value === 'idle' || openStatus.value === 'pending') return
  handledPreselect = id
  const stall = vacantProperties.value.find(property => property.documentId === id)
  if (!stall) {
    notify.warning('That space is no longer vacant', { description: 'Choose another vacant space for your application.' })
    return
  }
  if (alreadyApplied(id)) {
    notify.info(`You already applied for ${stall.name}`, { description: 'Your open application for this stall is listed below.' })
    return
  }
  if (inReview(stall)) {
    notify.warning(`${stall.name} is in review`, { description: 'The OAS is reviewing another application for this stall. Choose another vacant space.' })
    return
  }
  resetForm()
  selectedProperty.value = id
  stallLocked.value = true
  formOpen.value = true
}
onMounted(() => {
  watch([preselectProperty, propertyStatus, openStatus], applyPreselect, { immediate: true })
})

// The form has two steps. The business details open only once the stall is
// chosen and all four documents are attached.
type FormStep = 'documents' | 'business'
const step = ref<FormStep>('documents')
const documentsIssue = () => {
  if (!selectedProperty.value) return 'Please choose a vacant property.'
  if (alreadyApplied(selectedProperty.value)) return 'You already have an open application for this stall. Please choose another stall.'
  if (inReview(chosenStall.value)) return 'This stall is being reviewed for another applicant. Please choose another stall.'
  if (!letterFile.value && kept.letterOfIntent.length === 0) return 'Please attach your signed letter of intent.'
  const missing = stagedSections.value.find(section => staged[section.key].length === 0 && kept[section.key].length === 0)
  return missing ? `Please attach your ${inSentence(missing.label)}.` : ''
}
const documentsReady = computed(() => !documentsIssue())
const stepTabs = computed(() => [
  { label: '1. Stall and documents', short: '1. Documents', value: 'documents', icon: 'i-lucide-folder-up' },
  { label: '2. Business details', short: '2. Business', value: 'business', icon: 'i-lucide-store', disabled: !documentsReady.value }
])
const goToStep = (target: FormStep) => {
  errorMessage.value = target === 'business' ? documentsIssue() : ''
  if (!errorMessage.value) step.value = target
}

const submit = async () => {
  // Enter on the first step moves on instead of submitting.
  if (step.value === 'documents') return goToStep('business')
  errorMessage.value = documentsIssue()
  if (errorMessage.value) {
    step.value = 'documents'
    return
  }
  if (!businessType.value) {
    errorMessage.value = 'Please choose the type of business.'
    return
  }
  if (!productsServices.value.trim()) {
    errorMessage.value = 'Please describe the products or services you plan to offer.'
    return
  }
  if (!businessName.value.trim()) {
    errorMessage.value = 'Please enter your business name.'
    return
  }
  if (!editing.value && !rulesAccepted.value) {
    errorMessage.value = 'Please confirm that you have read and will follow the Rules and Regulations.'
    return
  }

  submitting.value = true
  try {
    const uploadFiles = async (files: File[]) => {
      if (files.length === 0) return [] as { id: number }[]
      return uploadInBatches(files, batch => {
        const form = new FormData()
        form.append('purpose', 'application')
        batch.forEach(file => form.append('files', file))
        return $api<{ id: number }[]>('/api/upload', { method: 'POST', body: form })
      })
    }
    const [letterUploaded, dtiUploaded, birUploaded, permitUploaded] = await Promise.all([
      uploadFiles(letterFile.value ? [letterFile.value] : []),
      uploadFiles(staged.dtiDocuments.map(entry => entry.file)),
      uploadFiles(staged.birDocuments.map(entry => entry.file)),
      uploadFiles(staged.businessPermits.map(entry => entry.file))
    ])
    const letterId = letterUploaded[0]?.id ?? kept.letterOfIntent[0]?.id
    if (!letterId) throw new Error('Upload failed')
    const withKept = (field: DocField, uploaded: { id: number }[]) => [...kept[field].map(doc => doc.id), ...uploaded.map(file => file.id)]
    const fields = {
      propertySpace: selectedProperty.value,
      letterOfIntent: letterId,
      dtiDocuments: withKept('dtiDocuments', dtiUploaded),
      birDocuments: withKept('birDocuments', birUploaded),
      businessPermits: withKept('businessPermits', permitUploaded),
      businessType: businessType.value,
      productsServices: productsServices.value.trim(),
      businessName: businessName.value.trim()
    }

    const updating = editing.value
    if (updating) {
      await $api(`/api/rental-applications/${updating.documentId ?? updating.id}`, {
        method: 'PUT',
        body: { data: { ...fields, message: message.value.trim() || null } }
      })
      notify.success('Application updated', { description: 'Your changes were saved.' })
    } else {
      await $api('/api/rental-applications', {
        method: 'POST',
        body: { ...fields, message: message.value || undefined, rulesAccepted: true }
      })
      notify.success('Application submitted', { description: 'The OAS will review your application.' })
    }
    // The next open resets the form; doing it now would flip the title while the dialog fades out.
    formOpen.value = false
    await Promise.all([refresh(), refreshOpen()])
  } catch (err) {
    notify.error(editing.value ? 'Could not save your changes' : 'Could not submit the application', { description: getErrorMessage(err) })
    // The OAS may have started on it while the form was open, which locks the
    // card, and another tab may have applied for the same stall.
    await Promise.all([editing.value ? refresh() : Promise.resolve(), refreshOpen()])
  } finally {
    submitting.value = false
  }
}

const statusColor = (status: RentalApplication['status']) => {
  switch (status) {
    case 'Approved':
      return 'success'
    case 'Declined':
    case 'Cancelled':
      return 'error'
    case 'For Review':
    case 'For Recommendation':
      return 'info'
    default:
      return 'secondary'
  }
}

const missingKey = ref<string | null>(null)
const missingError = ref('')

const uploadMissing = async (item: RentalApplication, field: DocField, files?: FileList) => {
  if (!files || files.length === 0) return
  if (!allowedFiles(Array.from(files))) return
  const docId = item.documentId ?? item.id
  missingKey.value = `${docId}:${field}`
  missingError.value = ''
  try {
    const uploaded = await uploadInBatches(Array.from(files), batch => {
      const form = new FormData()
      form.append('purpose', 'application')
      batch.forEach(file => form.append('files', file))
      return $api<{ id: number }[]>('/api/upload', {
        method: 'POST',
        body: form
      })
    })
    const newIds = uploaded.map(file => file.id)
    const existingIds = docsOf(item, field).map(doc => doc.id)
    const value = field === 'letterOfIntent' ? newIds[0] : [...existingIds, ...newIds]
    if (!value || (Array.isArray(value) && value.length === 0)) throw new Error('Upload failed')

    await $api(`/api/rental-applications/${docId}`, {
      method: 'PUT',
      body: { data: { [field]: value } }
    })
    const section = docSections.find(entry => entry.key === field)
    notify.success(`${section?.label ?? 'Documents'} added`, { description: `Your ${section ? inSentence(section.label) : 'documents'} were attached to this application.` })
    await refresh()
  } catch (err) {
    missingError.value = getErrorMessage(err)
  } finally {
    missingKey.value = null
  }
}

const formatDate = (value?: string) => {
  if (!value) return ''
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(value + 'T00:00:00') : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

const formatAppearance = (value?: string) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
}

const appearanceDayPassed = (value?: string) => {
  if (!value) return false
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return false
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1)
  return Date.now() >= end.getTime()
}
</script>

<template>
  <main class="imapsu-page">
    <AppPageHeader>
      <template #title>Rental applications</template>
      <template #description><p class="mt-2 max-w-xl text-muted">Submit a rental application for a vacant space and track its review status. Applications follow the university's established approval process.</p></template>
      <template #actions><div class="flex items-center gap-2">
        <UButton label="Refresh" icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="status === 'pending'" @click="refresh" />
        <UButton label="New application" icon="i-lucide-plus" @click="openNew" />
      </div></template>
    </AppPageHeader>

    <div>
        <AppRefreshState :refreshing="isRefreshing" :failed="hasLoaded && !!error" @retry="refresh" />
    <AppLoadingState v-if="isInitialLoading" variant="list" :toolbar="false" :count="4" label="Loading your applications…" />

        <UAlert v-else-if="isInitialError" color="error" icon="i-lucide-triangle-alert" title="Unable to load rental applications" description="Please try again." ><template #actions><UButton label="Retry" color="neutral" variant="outline" @click="refresh" /></template></UAlert>

        <UEmpty v-else-if="applications.length === 0" icon="i-lucide-clipboard-list" title="No rental applications found" description="Applications you submit will appear here." />

        <div v-else class="space-y-4">
          <UCard v-for="item in applications" :key="item.documentId ?? item.id" :ui="{ body: 'p-5' }">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <p v-if="item.propertySpace" class="font-medium text-highlighted">
                  {{ item.propertySpace.name }}
                  <span class="text-xs text-muted">({{ item.propertySpace.propertyCode }})</span>
                </p>
                <p v-else class="text-sm text-muted">Property removed</p>
                <p class="mt-1 text-xs text-muted">Submitted {{ formatDate(item.createdAt) }}</p>
              </div>
              <UBadge :color="statusColor(item.status)" variant="subtle">{{ item.status }}</UBadge>
            </div>

            <dl class="mt-4 grid gap-4 text-sm sm:grid-cols-2">
              <div><dt class="text-xs text-muted">Property</dt><dd class="font-medium text-highlighted">{{ item.propertySpace?.name ?? '—' }}</dd></div>
              <div><dt class="text-xs text-muted">Documents</dt><dd class="font-medium text-highlighted">{{ docSections.filter(section => docsOf(item, section.key).length).length }} of {{ docSections.length }} complete</dd></div>
            </dl>

            <div v-if="item.status === 'Approved' && item.appearanceDate" class="mt-4 rounded-lg border p-4" :class="item.appearanceConfirmed ? 'border-success/40 bg-success/5' : 'border-warning/40 bg-warning/5'">
              <div class="flex items-start gap-2.5">
                <UIcon :name="item.appearanceConfirmed ? 'i-lucide-badge-check' : 'i-lucide-calendar-check'" class="mt-0.5 size-4 shrink-0" :class="item.appearanceConfirmed ? 'text-success' : 'text-warning'" />
                <div>
                  <p class="text-sm font-medium text-highlighted">{{ item.appearanceConfirmed ? `Visit recorded on ${formatAppearance(item.appearanceDate)}` : `Report to the OAS office on ${formatAppearance(item.appearanceDate)}` }}</p>
                  <p class="mt-0.5 text-xs text-muted">
                    <template v-if="item.tenancy">The OAS finalized your lease for this stall.<NuxtLink v-if="auth.isCurrentTenant.value" to="/tenancy" class="ml-1 font-medium text-primary hover:underline">View my tenancy</NuxtLink></template>
                    <template v-else-if="item.appearanceConfirmed">The OAS recorded your office visit and is finalizing your lease. You will be notified once it is active.</template>
                    <template v-else-if="appearanceDayPassed(item.appearanceDate)">The scheduled visit day has passed without a recorded visit. Please contact the OAS office.</template>
                    <template v-else>Bring a valid ID and the original copies of your documents. OAS staff will record your visit when you arrive. If you do not report on this day, your application will be declined automatically.</template>
                  </p>
                </div>
              </div>
            </div>

            <p v-if="item.status === 'Declined' && item.appearanceDate && !item.appearanceConfirmed" class="mt-3 flex items-center gap-1.5 text-xs text-muted"><UIcon name="i-lucide-clock-3" class="size-3.5" />Declined. No office visit was recorded for {{ formatAppearance(item.appearanceDate) }}.</p>

            <p v-if="item.message" class="mt-4 text-sm leading-relaxed text-toned">{{ item.message }}</p>

            <div class="mt-4 border-t border-default pt-4">
              <p class="mb-2 text-xs font-medium text-muted">Application documents</p>
              <div class="grid gap-4 sm:grid-cols-2">
                <div v-for="section in docSections" :key="section.key">
                  <p class="mb-1 text-xs font-medium text-muted">{{ section.label }}</p>
                  <div v-if="docsOf(item, section.key).length" class="space-y-1">
                    <a v-for="doc in docsOf(item, section.key)" :key="doc.id" :href="`${baseURL}${doc.url}`" target="_blank" rel="noopener" class="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"><UIcon name="i-lucide-file-text" class="size-3.5" />View {{ doc.name || 'document' }}</a>
                  </div>
                  <p v-else-if="!canEdit(item)" class="text-sm text-muted">Not provided</p>
                  <label v-else class="inline-flex w-fit cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-default px-3 py-2 text-sm font-medium text-primary hover:border-primary" :class="{ 'pointer-events-none opacity-60': missingKey === `${item.documentId ?? item.id}:${section.key}` }">
                    <UIcon name="i-lucide-folder-up" class="size-4" />
                    {{ section.key === 'letterOfIntent' ? 'Attach file' : 'Attach files' }}
                    <input type="file" :accept="FILE_ACCEPT" :multiple="section.key !== 'letterOfIntent'" class="sr-only" :disabled="missingKey === `${item.documentId ?? item.id}:${section.key}`" @change="(event: Event) => { const input = event.target as HTMLInputElement; uploadMissing(item, section.key, input.files).then(() => { input.value = '' }) }" />
                  </label>
                </div>
              </div>
              <p v-if="missingKey" class="mt-2 text-xs text-muted">Uploading…</p>
              <p v-if="missingError" class="mt-2 text-xs text-error">{{ missingError }}</p>
              <div v-if="item.businessName" class="mt-4">
                <p class="mb-1 text-xs font-medium text-muted">Business name</p>
                <p class="text-sm font-medium text-highlighted">{{ item.businessName }}</p>
              </div>
              <div v-if="item.businessType" class="mt-4">
                <p class="mb-1 text-xs font-medium text-muted">Type of business</p>
                <p class="text-sm font-medium text-highlighted">{{ item.businessType }}</p>
              </div>
              <div v-if="item.productsServices" class="mt-4">
                <p class="mb-1 text-xs font-medium text-muted">Products / services offered</p>
                <p class="text-sm leading-relaxed text-toned">{{ item.productsServices }}</p>
              </div>
            </div>

            <div v-if="canCancel(item)" class="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-default pt-4">
              <p class="flex items-center gap-1.5 text-xs text-muted">
                <UIcon name="i-lucide-pencil-line" class="size-3.5 shrink-0" />
                You can edit or cancel this application until the OAS starts reviewing it.
              </p>
              <div class="flex flex-wrap gap-2">
                <UButton v-if="canEdit(item)" label="Edit" icon="i-lucide-pencil" color="neutral" variant="outline" size="sm" :disabled="cancellingId === (item.documentId ?? item.id)" @click="openEdit(item)" />
                <UButton label="Cancel application" icon="i-lucide-circle-x" color="error" variant="outline" size="sm" :loading="cancellingId === (item.documentId ?? item.id)" @click="cancelApplication(item)" />
              </div>
            </div>
            <p v-else-if="underReview(item)" class="mt-4 flex items-center gap-1.5 border-t border-default pt-4 text-xs text-muted">
              <UIcon name="i-lucide-lock" class="size-3.5 shrink-0" />
              The OAS is already reviewing this application, so it can no longer be edited or cancelled.
            </p>
          </UCard>
        </div>
    </div>

    <UModal
      v-model:open="formOpen"
      class="max-w-3xl"
      :title="editing ? 'Edit application' : 'New application'"
      :description="editing ? 'Update your application while it is still pending.' : 'Apply to rent a vacant campus space.'"
      :ui="{ body: 'p-5 sm:p-7', footer: 'px-5 py-4 sm:px-7' }"
    >
      <template #body>
        <UTabs :model-value="step" :items="stepTabs" :content="false" variant="pill" color="neutral" class="mb-7 w-full" aria-label="Application steps" :ui="{ trigger: 'max-sm:py-2.5' }" @update:model-value="goToStep($event as FormStep)">
          <!-- Phones get the short label so neither tab is cut off. -->
          <template #default="{ item }"><span class="sm:hidden">{{ item.short }}</span><span class="max-sm:hidden">{{ item.label }}</span></template>
        </UTabs>
        <form id="application-form" class="space-y-8" @submit.prevent="submit">
          <section v-show="step === 'documents'" class="space-y-4">
            <h3 class="text-sm font-semibold text-highlighted">Stall</h3>
            <UFormField v-if="stallLocked && chosenStall" label="Vacant property" name="propertySpace" required>
              <UInput :model-value="`${chosenStall.name} (${chosenStall.propertyCode})`" readonly icon="i-lucide-lock" aria-label="Chosen stall" class="w-full" :ui="{ base: 'cursor-default bg-elevated/50 text-toned' }" />
              <p class="mt-2 text-xs text-muted">This is the stall you chose to apply for. To apply for a different one, close this form and pick another from <NuxtLink to="/properties" class="font-medium text-primary hover:underline">Rentable spaces</NuxtLink>.</p>
            </UFormField>
            <UFormField v-else label="Vacant property" name="propertySpace" required>
              <AppRecordLookup v-model="selectedProperty" endpoint="/api/properties" :fields="['name','propertyCode','building']" :label="stallLabel" :value="item => item.documentId" :is-disabled="unavailable" :query="{ 'filters[space_status][$eq]': 'Vacant' }" :fallback="lookupFallback" placeholder="Search vacant stalls…" />
              <p v-if="vacantProperties.length === 0" class="mt-2 text-xs text-muted">No vacant spaces are currently available.</p>
              <p v-else class="mt-2 text-xs text-muted">Stalls marked "in review" are being reviewed for another applicant and cannot be chosen.<template v-if="appliedStallIds.size"> Stalls you already have an open application for cannot be chosen again.</template></p>
            </UFormField>
            <div v-if="chosenStall" class="flex flex-wrap items-center gap-x-8 gap-y-3 rounded-lg border border-default bg-elevated/40 px-4 py-3.5 text-sm">
              <div class="min-w-0">
                <p class="text-xs text-muted">{{ chosenStall.propertyCode }}</p>
                <p class="font-medium text-highlighted">{{ chosenStall.name }}</p>
              </div>
              <div>
                <p class="text-xs text-muted">Location</p>
                <p class="font-medium text-highlighted">{{ chosenStall.building || 'Not set' }}</p>
              </div>
              <div>
                <p class="text-xs text-muted">Monthly rent</p>
                <p class="font-semibold text-primary">{{ chosenStall.monthlyRent ? `₱${Number(chosenStall.monthlyRent).toLocaleString()}` : 'Not set' }}</p>
              </div>
            </div>
          </section>

          <section v-show="step === 'documents'" class="space-y-4 border-t border-default pt-7">
            <div>
              <h3 class="text-sm font-semibold text-highlighted">Required documents</h3>
              <p class="mt-1 text-sm text-muted">All four are required. Accepted files: PDF, Word (.doc, .docx), JPG and PNG, up to 5 MB each.</p>
            </div>
            <div class="grid gap-4 sm:grid-cols-2">
              <div class="flex min-w-0 flex-col gap-3 rounded-lg border border-default p-4">
                <div>
                  <p class="text-sm font-medium text-highlighted">Letter of intent <span class="text-error">*</span></p>
                  <p class="mt-1 text-xs leading-relaxed text-muted">Your signed letter of intent, as one file.</p>
                </div>
                <ul v-if="letterFile || kept.letterOfIntent.length" class="space-y-1.5">
                  <li v-for="doc in (letterFile ? [] : kept.letterOfIntent)" :key="doc.id" class="flex items-center justify-between gap-2 rounded-md bg-elevated/60 py-1 pl-2.5 pr-1 text-sm">
                    <span class="flex min-w-0 items-center gap-1.5 text-toned"><UIcon name="i-lucide-file-text" class="size-3.5 shrink-0" /><span class="truncate">{{ doc.name || 'Current letter of intent' }}</span></span>
                    <UButton icon="i-lucide-x" color="neutral" variant="ghost" size="xs" :aria-label="`Remove ${doc.name || 'letter of intent'}`" :disabled="submitting" @click="removeKept('letterOfIntent', doc.id)" />
                  </li>
                  <li v-if="letterFile" class="flex items-center justify-between gap-2 rounded-md bg-elevated/60 py-1 pl-2.5 pr-1 text-sm">
                    <span class="flex min-w-0 items-center gap-1.5 text-toned"><UIcon name="i-lucide-file-text" class="size-3.5 shrink-0" /><span class="truncate">{{ letterFile.name }}</span></span>
                    <UButton icon="i-lucide-x" color="neutral" variant="ghost" size="xs" :aria-label="`Remove ${letterFile.name}`" :disabled="submitting" @click="letterFile = undefined" />
                  </li>
                </ul>
                <label class="mt-auto flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed border-default px-3 py-2.5 text-sm font-medium text-primary hover:border-primary hover:bg-primary/5" :class="{ 'pointer-events-none opacity-60': submitting }">
                  <UIcon name="i-lucide-folder-up" class="size-4" />
                  {{ letterFile || kept.letterOfIntent.length ? 'Replace file' : 'Choose file' }}
                  <input :key="letterFormKey" type="file" :accept="FILE_ACCEPT" class="sr-only" :disabled="submitting" @change="(event: Event) => chooseLetter(event.target as HTMLInputElement)" />
                </label>
              </div>

              <div v-for="section in stagedSections" :key="section.key" class="flex min-w-0 flex-col gap-3 rounded-lg border border-default p-4">
                <div>
                  <p class="text-sm font-medium text-highlighted">{{ section.label }} <span class="text-error">*</span></p>
                  <p class="mt-1 text-xs leading-relaxed text-muted">{{ section.hint }}</p>
                </div>
                <ul v-if="staged[section.key].length || kept[section.key].length" class="space-y-1.5">
                  <li v-for="doc in kept[section.key]" :key="doc.id" class="flex items-center justify-between gap-2 rounded-md bg-elevated/60 py-1 pl-2.5 pr-1 text-sm">
                    <span class="flex min-w-0 items-center gap-1.5 text-toned"><UIcon name="i-lucide-file-text" class="size-3.5 shrink-0" /><span class="truncate">{{ doc.name || 'Current document' }}</span></span>
                    <UButton icon="i-lucide-x" color="neutral" variant="ghost" size="xs" :aria-label="`Remove ${doc.name || 'document'}`" :disabled="submitting" @click="removeKept(section.key, doc.id)" />
                  </li>
                  <li v-for="entry in staged[section.key]" :key="entry.key" class="flex items-center justify-between gap-2 rounded-md bg-elevated/60 py-1 pl-2.5 pr-1 text-sm">
                    <span class="flex min-w-0 items-center gap-1.5 text-toned"><UIcon name="i-lucide-file-text" class="size-3.5 shrink-0" /><span class="truncate">{{ entry.file.name }}</span></span>
                    <UButton icon="i-lucide-x" color="neutral" variant="ghost" size="xs" :aria-label="`Remove ${entry.file.name}`" :disabled="submitting" @click="removeFile(section.key, entry.key)" />
                  </li>
                </ul>
                <label class="mt-auto flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed border-default px-3 py-2.5 text-sm font-medium text-primary hover:border-primary hover:bg-primary/5" :class="{ 'pointer-events-none opacity-60': submitting }">
                  <UIcon name="i-lucide-folder-up" class="size-4" />
                  {{ staged[section.key].length || kept[section.key].length ? 'Add more files' : 'Choose files' }}
                  <input type="file" :accept="FILE_ACCEPT" multiple class="sr-only" :disabled="submitting" @change="(event: Event) => { const input = event.target as HTMLInputElement; addFiles(section.key, input.files); input.value = '' }" />
                </label>
              </div>
            </div>
          </section>

          <section v-if="step === 'business'" class="space-y-5">
            <h3 class="text-sm font-semibold text-highlighted">Your business</h3>
            <UFormField label="Type of business" name="businessType" required description="The OAS allows only one stall of each type on campus, so types that already have a stall cannot be chosen." :ui="{ description: 'mb-2' }">
              <USelect v-model="businessType" :items="businessTypeOptions" placeholder="Choose the type of business" class="w-full" :disabled="submitting" />
            </UFormField>
            <UFormField label="Products / services" name="productsServices" required description="Describe what your business will offer from this space." :ui="{ description: 'mb-2' }">
              <UTextarea v-model="productsServices" required class="w-full" :rows="4" autoresize placeholder="e.g. A coffee shop and bakery offering specialty drinks, pastries, and light meals." :disabled="submitting" />
            </UFormField>
            <UFormField label="Business name" name="businessName" required description="The name your stall will go by. It is shown on the campus map once your lease starts." :ui="{ description: 'mb-2' }">
              <UInput v-model="businessName" required maxlength="120" class="w-full" placeholder="e.g. Campus Bites" :disabled="submitting" />
            </UFormField>
            <UFormField label="Message" name="message" hint="Optional">
              <UTextarea v-model="message" class="w-full" placeholder="Anything else the OAS should know?" :rows="4" autoresize :disabled="submitting" />
            </UFormField>
          </section>

          <div v-if="!editing && step === 'business'" class="rounded-lg border border-default px-4 py-3.5">
            <UCheckbox v-model="rulesAccepted" name="rulesAccepted" :disabled="submitting">
              <template #label>
                I have read and will follow the
                <button type="button" class="font-medium text-primary underline-offset-2 hover:underline" @click.stop.prevent="openRules">Rules and Regulations</button>
              </template>
            </UCheckbox>
          </div>

          <UAlert v-if="errorMessage" color="error" icon="i-lucide-triangle-alert" :description="errorMessage" />
        </form>
      </template>
      <template #footer>
        <div class="flex w-full flex-wrap items-center justify-end gap-2">
          <!-- On phones the footer is two equal, taller buttons. The second step drops Close there, since the X in the header does the same. -->
          <UButton v-if="step === 'business'" label="Back" icon="i-lucide-arrow-left" color="neutral" variant="outline" class="mr-auto max-sm:flex-1 max-sm:justify-center max-sm:py-2.5" :disabled="submitting" @click="goToStep('documents')" />
          <UButton :label="editing ? 'Discard changes' : 'Close'" color="neutral" variant="ghost" class="max-sm:flex-1 max-sm:justify-center max-sm:py-2.5" :class="{ 'max-sm:hidden': step === 'business' }" :disabled="submitting" @click="formOpen = false" />
          <UButton v-if="step === 'documents'" data-prominent="true" label="Next" trailing-icon="i-lucide-arrow-right" class="max-sm:flex-1 max-sm:justify-center max-sm:py-2.5" @click="goToStep('business')" />
          <UButton v-else data-prominent="true" type="submit" form="application-form" class="max-sm:flex-1 max-sm:justify-center max-sm:py-2.5" :loading="submitting">{{ editing ? 'Save changes' : 'Submit application' }}</UButton>
        </div>
      </template>
    </UModal>

    <UModal v-model:open="rulesOpen" class="max-w-2xl" title="Rules and regulations" description="Every stall lessee agrees to follow these rules for the whole term of the lease.">
      <template #body>
        <AppLoadingState v-if="rulesStatus === 'pending' && !stallRules" :count="3" height="h-6" />
        <UAlert v-else-if="!stallRules" color="error" icon="i-lucide-triangle-alert" title="Unable to load the rules" description="Please try again."><template #actions><UButton label="Retry" color="neutral" variant="outline" @click="refreshRules()" /></template></UAlert>
        <UEditor v-else :model-value="stallRules" content-type="markdown" :editable="false" :ui="{ base: 'sm:px-0' }" />
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton label="Close" color="neutral" variant="ghost" @click="rulesOpen = false" />
          <UButton v-if="formOpen && !editing && !rulesAccepted" data-prominent="true" label="I agree" icon="i-lucide-check" @click="rulesAccepted = true; rulesOpen = false" />
        </div>
      </template>
    </UModal>
    <AppRecordPagination :state="recordsPage" :response="data" :pending="status === 'pending'" />
  </main>
</template>