<script setup lang="ts">
import {
  formatReviewDate as formatDate,
  isLeaseActive as leaseActive,
  isReviewLocked as statusLocked,
  reviewPropertyCode as propertyCode,
  reviewPropertyName as propertyName,
  reviewStatusBadgeColor as statusBadgeColor,
  reviewStatusLabel as statusLabel,
  reviewStatusNote as statusNote,
  reviewStatusOptions as statusOptions,
  type ApplicationItem,
  type ReviewItem as Item
} from '~/utils/applicationReview'

definePageMeta({
  middleware: ['auth', 'role'],
  roles: ['oas'],
  validate: route => ['application', 'renewal'].includes(String(route.params.kind)) && /^[a-zA-Z0-9]+$/.test(String(route.params.id))
})

const route = useRoute()
const notify = useNotify()
const { confirm } = useConfirmDialog()
const { baseURL, $api, getErrorMessage } = useStrapi()
const headers = {}

const kind = computed(() => String(route.params.kind) as Item['kind'])
const documentId = computed(() => String(route.params.id))

const { data: responseData, status, error, refresh } = await useFetch<{ data: Item }>(() => `/api/dashboard/applications/${kind.value}/${documentId.value}`, {
  lazy: true,
  baseURL,
  headers
})
const { data, hasLoaded, isInitialLoading, isRefreshing, isInitialError } = useRequestPresentation(responseData, status)
const item = computed(() => data.value?.data ?? null)
const application = computed(() => item.value?.kind === 'application' ? item.value : null)
const notFound = computed(() => (error.value as { statusCode?: number } | null)?.statusCode === 404)

useHead({ title: computed(() => `${item.value ? propertyName(item.value) : 'Review'} | iMapSU`) })

// The list passes its filters along so going back lands on the same view.
const backTo = computed(() => ({ path: '/admin/applications', query: route.query }))

const kindLabel = computed(() => kind.value === 'renewal' ? 'Renewal request' : 'Rental application')

// The Office visit & lease tab only applies once an application is approved,
// and stays for the lease it became.
const hasVisitTab = computed(() => !!application.value && (application.value.status === 'Approved' || !!application.value.tenancy))
const tab = ref('application')
const tabs = computed(() => [
  { label: 'Application', value: 'application', slot: 'application' as const },
  { label: 'Evaluation', value: 'evaluation', slot: 'evaluation' as const },
  ...(hasVisitTab.value ? [{ label: 'Office visit & lease', value: 'visit', slot: 'visit' as const }] : []),
  { label: 'History', value: 'history', slot: 'history' as const }
])
watch(hasVisitTab, visible => { if (!visible && tab.value === 'visit') tab.value = 'evaluation' })

const letter = (value: Item) => value.kind === 'renewal' ? value.letterOfRenewal : value.letterOfIntent

const applicationDocSections: { key: 'letterOfIntent' | 'dtiDocuments' | 'birDocuments' | 'businessPermits'; label: string }[] = [
  { key: 'letterOfIntent', label: 'Letter of intent' },
  { key: 'dtiDocuments', label: 'SEC/DTI business documents' },
  { key: 'birDocuments', label: 'BIR business documents' },
  { key: 'businessPermits', label: 'Business permits' }
]

const docsOf = (value: Item, key: 'letterOfIntent' | 'dtiDocuments' | 'birDocuments' | 'businessPermits') => {
  if (value.kind !== 'application') return []
  const docs = value[key]
  if (Array.isArray(docs)) return docs.filter(Boolean)
  return docs ? [docs] : []
}

const formatAppearance = (value?: string) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
}

const applicantName = (fallback: string) => item.value?.user?.username ?? fallback

// Evaluation: the only place the status, evaluation and recommendation change.
const reviewSaving = ref(false)
const reviewError = ref('')
const reviewForm = reactive({ status: '', evaluation: '', recommendation: '' })
const resetReviewForm = (value: Item | null) => {
  if (!value) return
  reviewForm.status = value.status
  reviewForm.evaluation = value.kind === 'application' ? value.evaluation ?? '' : ''
  reviewForm.recommendation = value.kind === 'application' ? value.recommendation ?? '' : ''
}
watch(item, resetReviewForm, { immediate: true })

const saveReview = async () => {
  const value = item.value
  if (!value) return
  reviewSaving.value = true
  reviewError.value = ''
  try {
    if (value.kind === 'renewal') {
      await $api(`/api/renewal-intents/${value.documentId ?? value.id}`, { method: 'PUT', body: { data: { status: reviewForm.status } } })
    } else {
      await $api(`/api/rental-applications/${value.documentId ?? value.id}`, {
        method: 'PUT',
        body: {
          data: {
            ...(statusLocked(value) ? {} : { status: reviewForm.status }),
            evaluation: reviewForm.evaluation?.trim() || null,
            recommendation: reviewForm.recommendation?.trim() || null
          }
        }
      })
    }
    notify.success(`${value.kind === 'renewal' ? 'Renewal' : 'Application'} saved`, { description: `Status: ${reviewForm.status}.` })
    await refresh()
  } catch (err) {
    reviewError.value = getErrorMessage(err)
  } finally {
    reviewSaving.value = false
  }
}

// Office visit. Staff record the visit only when the applicant is at the
// counter; applicants cannot mark it themselves.
const applicationUrl = (value: ApplicationItem, action = '') => `/api/rental-applications/${value.documentId ?? value.id}${action}`
const confirmingAppearance = ref(false)

const markAttended = async () => {
  const value = application.value
  if (!value) return
  const ok = await confirm({
    title: 'Mark as attended?',
    description: `Only mark ${applicantName('the applicant')} as attended once they are at the office.`,
    confirmLabel: 'Mark as attended',
    tone: 'primary',
    icon: 'i-lucide-user-check'
  })
  if (!ok) return
  confirmingAppearance.value = true
  try {
    await $api(applicationUrl(value), { method: 'PUT', body: { data: { appearanceConfirmed: true } } })
    notify.success('Marked as attended', { description: 'The applicant’s office visit is recorded.' })
    await refresh()
  } catch (err) {
    notify.error('Unable to record the visit', { description: getErrorMessage(err) })
  } finally {
    confirmingAppearance.value = false
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

const noShowSaving = ref(false)
const noShowError = ref('')

const markNoShow = async () => {
  const value = application.value
  if (!value) return
  const ok = await confirm({
    title: 'Decline as no-show?',
    description: `The application will be declined right away and ${applicantName('the applicant')} will be notified that they did not report on ${formatAppearance(value.appearanceDate)}. This cannot be undone.`,
    confirmLabel: 'Decline as no-show',
    tone: 'danger',
    icon: 'i-lucide-user-x'
  })
  if (!ok) return
  noShowSaving.value = true
  noShowError.value = ''
  try {
    await $api(applicationUrl(value, '/no-show'), { method: 'POST' })
    notify.info('Marked as no-show', { description: `The application for ${propertyName(value)} was declined.` })
    await refresh()
  } catch (err) {
    noShowError.value = getErrorMessage(err)
  } finally {
    noShowSaving.value = false
  }
}

// Moves one applicant's visit, for when they cannot come on the scheduled
// day. The server refuses weekends and office closures.
const todayInManila = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const rescheduleDate = ref('')
const rescheduleSaving = ref(false)
const rescheduleError = ref('')

const saveReschedule = async () => {
  const value = application.value
  if (!value || !rescheduleDate.value) return
  rescheduleSaving.value = true
  rescheduleError.value = ''
  try {
    await $api(applicationUrl(value, '/reschedule-visit'), { method: 'POST', body: { data: { date: rescheduleDate.value } } })
    notify.success('Office visit moved', { description: `${applicantName('The applicant')} was notified of the new day.` })
    rescheduleDate.value = ''
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
const canFinalize = computed(() => !!application.value && application.value.status === 'Approved' && !!application.value.appearanceConfirmed && !application.value.tenancy)

const finalizeSaving = ref(false)
const finalizeError = ref('')
const finalizeForm = reactive({
  businessName: '',
  productsServices: '',
  opensAt: undefined as string | undefined,
  closesAt: undefined as string | undefined,
  monthlyRent: '',
  startDate: '',
  termMonths: undefined as number | undefined
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
const finalizeMinStart = ref(todayInManila())
const finalizeDateError = computed(() => finalizeForm.startDate && finalizeForm.startDate < finalizeMinStart.value
  ? 'The contract cannot start before today.'
  : !finalizeForm.termMonths
    ? 'Choose the contract length.'
    : '')

// Contracts run for a fixed length, so the end date is worked out from the
// start date: the same day of the month, or the month's last day when that
// day does not exist (Nov 30 + 3 months = Feb 28).
const contractTermOptions = [
  { label: '3 months', value: 3 },
  { label: '6 months', value: 6 },
  { label: '1 year', value: 12 }
]
const addMonths = (date: string, months: number) => {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number]
  const end = new Date(Date.UTC(year, month - 1 + months, 1))
  const lastDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate()
  end.setUTCDate(Math.min(day, lastDay))
  return end.toISOString().slice(0, 10)
}
const finalizeEndDate = computed(() => /^\d{4}-\d{2}-\d{2}$/.test(finalizeForm.startDate) && finalizeForm.termMonths
  ? addMonths(finalizeForm.startDate, finalizeForm.termMonths)
  : '')

// Prefilled once the lease can be finalized. The contract is signed outside
// the system, so its start date and length are left for the OAS to copy
// rather than guessed.
const resetFinalizeForm = () => {
  const value = application.value
  if (!value) return
  finalizeForm.businessName = value.businessName ?? ''
  finalizeForm.productsServices = value.productsServices ?? ''
  finalizeForm.opensAt = undefined
  finalizeForm.closesAt = undefined
  finalizeMinStart.value = todayInManila()
  finalizeForm.monthlyRent = value.propertySpace?.monthlyRent != null ? String(Number(value.propertySpace.monthlyRent)) : ''
  finalizeForm.startDate = ''
  finalizeForm.termMonths = undefined
  finalizeError.value = ''
}
watch(canFinalize, ready => { if (ready) resetFinalizeForm() }, { immediate: true })

const saveFinalize = async () => {
  const value = application.value
  if (!value) return
  if (finalizeDateError.value) {
    finalizeError.value = finalizeDateError.value
    return
  }
  finalizeSaving.value = true
  finalizeError.value = ''
  try {
    const result = await $api<{ data: { promoted: boolean; closed: { cancelled: number; declined: number } } }>(applicationUrl(value, '/finalize-lease'), {
      method: 'POST',
      body: {
        data: {
          businessName: finalizeForm.businessName.trim(),
          productsServices: finalizeForm.productsServices.trim(),
          operatingDetails: operatingHours(),
          monthlyRent: Number(finalizeForm.monthlyRent),
          startDate: finalizeForm.startDate,
          endDate: finalizeEndDate.value
        }
      }
    })
    const { promoted, closed } = result.data
    const closedCount = closed.cancelled + closed.declined
    const notes = [
      promoted ? `${applicantName('The applicant')} is now a current tenant.` : '',
      closedCount ? `${closedCount} other open application${closedCount === 1 ? ' was' : 's were'} closed.` : ''
    ].filter(Boolean).join(' ')
    notify.success(`Lease active for ${propertyName(value)}`, { description: notes || undefined })
    await refresh()
  } catch (err) {
    finalizeError.value = getErrorMessage(err)
  } finally {
    finalizeSaving.value = false
  }
}

// History is read each time the tab opens, so it includes changes just made here.
const history = useStatusHistory(() => kind.value === 'renewal' ? 'renewal-intent' : 'rental-application', documentId)
watch(tab, value => { if (value === 'history') history.load() })
</script>

<template>
  <main class="imapsu-page imapsu-page--admin">
    <UButton :to="backTo" label="Back to applications" icon="i-lucide-arrow-left" color="neutral" variant="ghost" size="sm" class="-ml-2 mb-2" />

    <AppPageHeader>
      <template #title>{{ item ? propertyName(item) : kindLabel }}</template>
      <template #description>
        <div v-if="item" class="mt-2 flex flex-wrap items-center gap-2 text-muted">
          <span>{{ kindLabel }} from {{ item.user?.username ?? 'a removed account' }}<template v-if="propertyCode(item)"> · {{ propertyCode(item) }}</template></span>
          <UBadge :color="statusBadgeColor(item)" variant="subtle">{{ statusLabel(item) }}</UBadge>
        </div>
      </template>
      <template #actions><UButton label="Refresh" icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="status === 'pending'" @click="refresh()" /></template>
    </AppPageHeader>

    <AppRefreshState :refreshing="isRefreshing" :failed="hasLoaded && !!error" @retry="refresh" />
    <AppLoadingState v-if="isInitialLoading" variant="table" :count="4" label="Loading the application…" />

    <UEmpty v-else-if="notFound" icon="i-lucide-file-question" title="Application not found" description="It may have been removed. Go back to the list to choose another one." />

    <UAlert v-else-if="isInitialError || !item" color="error" icon="i-lucide-triangle-alert" title="Unable to load the application" description="Please try again."><template #actions><UButton label="Retry" color="neutral" variant="outline" @click="refresh()" /></template></UAlert>

    <UTabs v-else v-model="tab" :items="tabs" variant="link" class="w-full" :ui="{ list: 'mb-5' }">
      <template #application>
        <UCard>
          <div class="space-y-6">
            <dl class="grid gap-4 sm:grid-cols-3">
              <div>
                <dt class="text-xs font-medium text-muted">Applicant</dt>
                <dd class="mt-1 flex items-center gap-2">
                  <AppUserAvatar v-if="item.user" :user="item.user" size="xs" />
                  <span class="min-w-0">
                    <span class="block truncate font-medium text-highlighted">{{ item.user?.username ?? '—' }}</span>
                    <span class="block truncate text-xs text-muted">{{ item.user?.email }}</span>
                  </span>
                </dd>
              </div>
              <div>
                <dt class="text-xs font-medium text-muted">Stall</dt>
                <dd class="mt-1">
                  <span class="block font-medium text-highlighted">{{ propertyName(item) }}</span>
                  <span v-if="propertyCode(item)" class="block text-xs text-muted">{{ propertyCode(item) }}</span>
                </dd>
              </div>
              <div>
                <dt class="text-xs font-medium text-muted">Submitted</dt>
                <dd class="mt-1 text-toned">{{ formatDate(item.createdAt) }}</dd>
              </div>
            </dl>

            <section v-if="item.kind === 'application'">
              <h3 class="text-sm font-semibold text-highlighted">Business name</h3>
              <p class="mt-1 leading-relaxed text-toned">{{ item.businessName || 'Not provided' }}</p>
            </section>

            <section v-if="item.kind === 'application'">
              <h3 class="text-sm font-semibold text-highlighted">Products / services offered</h3>
              <p class="mt-1 whitespace-pre-line leading-relaxed text-toned">{{ item.productsServices || 'Not provided' }}</p>
            </section>

            <section v-if="item.message">
              <h3 class="text-sm font-semibold text-highlighted">Message</h3>
              <p class="mt-1 whitespace-pre-line leading-relaxed text-toned">{{ item.message }}</p>
            </section>

            <section>
              <h3 class="text-sm font-semibold text-highlighted">{{ item.kind === 'renewal' ? 'Letter of renewal intent' : 'Submitted documents' }}</h3>
              <template v-if="item.kind === 'renewal'">
                <a v-if="letter(item)" :href="`${baseURL}${letter(item)!.url}`" target="_blank" rel="noopener" class="mt-2 inline-block font-medium text-primary hover:underline">View letter</a>
                <p v-else class="mt-1 text-muted">Not uploaded</p>
              </template>
              <div v-else class="mt-2 divide-y divide-default rounded-lg border border-default">
                <div v-for="section in applicationDocSections" :key="section.key" class="grid gap-1 px-4 py-3 sm:grid-cols-[13rem_1fr] sm:gap-4">
                  <p class="text-muted">{{ section.label }}</p>
                  <div v-if="docsOf(item, section.key).length" class="min-w-0 space-y-1">
                    <a v-for="doc in docsOf(item, section.key)" :key="doc.id" :href="`${baseURL}${doc.url}`" target="_blank" rel="noopener" class="block truncate font-medium text-primary hover:underline">{{ doc.name || 'View document' }}</a>
                  </div>
                  <p v-else class="text-muted">Not uploaded</p>
                </div>
              </div>
            </section>

            <div class="flex justify-end border-t border-default pt-4">
              <UButton label="Continue to evaluation" color="primary" variant="subtle" size="sm" trailing-icon="i-lucide-arrow-right" @click="tab = 'evaluation'" />
            </div>
          </div>
        </UCard>
      </template>

      <template #evaluation>
        <UCard>
          <template #header><h2 class="text-base font-semibold text-highlighted">Evaluation</h2><p class="mt-1 text-sm text-muted">Record the decision on this {{ item.kind === 'renewal' ? 'renewal request' : 'application' }}<template v-if="item.kind === 'application'"> with its evaluation and recommendation</template>.</p></template>
          <form class="space-y-4" @submit.prevent="saveReview">
            <UFormField label="Status" required :description="statusNote(item)">
              <USelect v-model="reviewForm.status" :items="statusOptions(item)" :disabled="statusLocked(item)" class="w-full sm:w-64" />
            </UFormField>
            <template v-if="item.kind === 'application'">
              <UFormField label="Evaluation" description="Assessment of the application against the stall's requirements.">
                <UTextarea v-model="reviewForm.evaluation" :rows="4" placeholder="e.g. Business plan is viable; financial capacity is adequate." :ui="{ root: 'w-full' }" />
              </UFormField>
              <UFormField label="Recommendation">
                <UTextarea v-model="reviewForm.recommendation" :rows="3" placeholder="e.g. Recommend approval pending background check." :ui="{ root: 'w-full' }" />
              </UFormField>
            </template>
            <UAlert v-if="reviewError" color="error" :description="reviewError" />
            <div v-if="!(item.kind === 'renewal' && statusLocked(item))" class="flex justify-end gap-2 border-t border-default pt-4">
              <UButton data-prominent="true" type="submit" :loading="reviewSaving">Save review</UButton>
            </div>
          </form>
        </UCard>
      </template>

      <template #visit>
        <div v-if="application" class="space-y-4">
          <UCard>
            <template #header><h2 class="text-base font-semibold text-highlighted">Office visit</h2><p class="mt-1 text-sm text-muted">The applicant reports to the office before the lease is signed.</p></template>
            <div v-if="application.appearanceDate" class="space-y-3">
              <div class="flex flex-wrap items-center gap-2">
                <span class="font-medium text-highlighted">{{ formatAppearance(application.appearanceDate) }}</span>
                <UBadge :color="application.appearanceConfirmed ? 'success' : 'warning'" variant="subtle">{{ application.appearanceConfirmed ? 'Attended' : 'Not yet arrived' }}</UBadge>
              </div>
              <template v-if="!application.appearanceConfirmed">
                <p class="text-muted">Mark the applicant as attended only once they are at the office. If no visit is recorded by the end of {{ formatAppearance(application.appearanceDate) }}, the application is declined automatically.</p>
                <UButton label="Mark as attended" icon="i-lucide-user-check" color="primary" variant="subtle" :loading="confirmingAppearance" @click="markAttended" />
              </template>
              <p v-else-if="canFinalize" class="text-muted">The applicant attended their office visit. Finalize the lease below to give {{ applicantName('the applicant') }} the stall<template v-if="application.applicantRole === 'current-tenant'"> alongside the ones they already lease</template><template v-else> and switch their account to current tenant</template>.</p>
            </div>
            <p v-else class="text-muted">No office visit is scheduled for this application.</p>
          </UCard>

          <div v-if="application.appearanceDate && !application.appearanceConfirmed" class="grid gap-4 lg:grid-cols-2">
            <UCard>
              <template #header><h2 class="text-base font-semibold text-highlighted">Reschedule office visit</h2><p class="mt-1 text-sm text-muted">Currently {{ formatAppearance(application.appearanceDate) }}.</p></template>
              <form class="space-y-4" @submit.prevent="saveReschedule">
                <UFormField label="New visit day" description="A weekday the office is open. Closed days are listed under Office closures." required>
                  <UInput v-model="rescheduleDate" type="date" required :min="todayInManila()" :ui="{ root: 'w-full' }" />
                </UFormField>
                <p class="text-sm text-toned">{{ applicantName('The applicant') }} gets a notification with the new day. If they do not report by the end of it, the application is declined automatically.</p>
                <UAlert v-if="rescheduleError" color="error" icon="i-lucide-triangle-alert" :description="rescheduleError" />
                <div class="flex justify-end">
                  <UButton data-prominent="true" type="submit" icon="i-lucide-calendar-check" :loading="rescheduleSaving" :disabled="!rescheduleDate">Move visit</UButton>
                </div>
              </form>
            </UCard>

            <UCard>
              <template #header><h2 class="text-base font-semibold text-highlighted">Mark as no-show</h2><p class="mt-1 text-sm text-muted">For an applicant who did not report on their visit day.</p></template>
              <div class="space-y-4">
                <p class="text-sm text-toned">The application is declined right away and {{ applicantName('the applicant') }} is notified. The stall becomes available to other applicants.</p>
                <p v-if="!visitDayStarted(application.appearanceDate)" class="text-sm text-muted">Available from {{ formatAppearance(application.appearanceDate) }}.</p>
                <UAlert v-if="noShowError" color="error" icon="i-lucide-triangle-alert" :description="noShowError" />
                <div class="flex justify-end">
                  <UButton label="Decline as no-show" color="error" variant="subtle" icon="i-lucide-user-x" :loading="noShowSaving" :disabled="!visitDayStarted(application.appearanceDate)" @click="markNoShow" />
                </div>
              </div>
            </UCard>
          </div>

          <UCard v-if="canFinalize">
            <template #header><h2 class="text-base font-semibold text-highlighted">Finalize lease</h2><p class="mt-1 text-sm text-muted">Lease {{ propertyName(application) }} to {{ applicantName('the applicant') }}.</p></template>
            <form class="space-y-4" @submit.prevent="saveFinalize">
              <div class="grid gap-3 rounded-lg border border-default p-3 text-sm sm:grid-cols-2">
                <div>
                  <p class="text-xs font-medium text-muted">Applicant</p>
                  <p class="mt-0.5 font-medium text-highlighted">{{ application.user?.username ?? '—' }}</p>
                  <p class="text-xs text-muted">{{ application.user?.email }}</p>
                </div>
                <div>
                  <p class="text-xs font-medium text-muted">Stall</p>
                  <p class="mt-0.5 font-medium text-highlighted">{{ propertyName(application) }}</p>
                  <p class="text-xs text-muted"><span>{{ propertyCode(application) }}</span> · {{ application.propertySpace?.building }}</p>
                </div>
              </div>
              <UFormField label="Business name" description="From the application. Shown on the campus map." required>
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
                <UFormField label="Contract length" :description="finalizeEndDate ? `Ends ${formatDate(finalizeEndDate)}.` : 'As written on the signed contract.'" required>
                  <USelect v-model="finalizeForm.termMonths" :items="contractTermOptions" placeholder="Choose a length" icon="i-lucide-calendar-range" class="w-full" />
                </UFormField>
              </div>
              <UAlert color="info" variant="subtle" icon="i-lucide-info" title="What happens next">
                <template #description>
                  <ul class="mt-1 list-disc space-y-0.5 pl-4 text-sm">
                    <li>An active tenancy is created and the stall is marked Occupied on the map.</li>
                    <li v-if="application.applicantRole === 'current-tenant'">{{ applicantName('The applicant') }} is already a current tenant, so this stall is added to their tenancies. They stay signed in and get a notification.</li>
                    <li v-else>{{ applicantName('The applicant') }}'s account switches to current tenant. They are signed out and get a notification to sign in again.</li>
                    <li>Their other open applications, and other applicants' open applications for this stall, are closed and those applicants are notified.</li>
                  </ul>
                </template>
              </UAlert>
              <UAlert v-if="finalizeError" color="error" icon="i-lucide-triangle-alert" :description="finalizeError" />
              <div class="flex justify-end">
                <UButton data-prominent="true" type="submit" icon="i-lucide-key-round" :loading="finalizeSaving">Finalize lease</UButton>
              </div>
            </form>
          </UCard>

          <UCard v-if="application.tenancy">
            <template #header><h2 class="text-base font-semibold text-highlighted">Lease</h2></template>
            <p class="text-toned">
              <template v-if="leaseActive(application)">Lease active since {{ formatDate(application.tenancy.startDate) }}<template v-if="application.tenancy.endDate">, until {{ formatDate(application.tenancy.endDate) }}</template>.</template>
              <template v-else>This lease has ended.</template>
              <NuxtLink to="/admin/tenancies" class="ml-1 font-medium text-primary hover:underline">Manage in Tenancies</NuxtLink>
            </p>
          </UCard>
        </div>
      </template>

      <template #history>
        <UCard>
          <template #header><h2 class="text-base font-semibold text-highlighted">Status history</h2><p class="mt-1 text-sm text-muted">Recorded status changes for this {{ item.kind === 'renewal' ? 'renewal request' : 'application' }}.</p></template>
          <StatusHistoryList :entries="history.entries.value" :loading="history.loading.value" :error="history.loadError.value" />
        </UCard>
      </template>
    </UTabs>
  </main>
</template>
