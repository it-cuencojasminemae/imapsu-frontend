<script setup lang="ts">
import { uploadInBatches } from '~/utils/uploadFile'
import { MAINTENANCE_PRIORITIES, maintenanceCategoryIcon, maintenancePriorityColor, maintenanceStatusColor, ticketKey, ticketNumber, type MaintenancePhoto } from '~/utils/maintenance'

definePageMeta({
  middleware: ['auth', 'role'],
  roles: ['current-tenant']
})

type UploadedFile = { id: number; url?: string; name?: string }

type MaintenanceTicket = {
  id: number | string
  documentId?: string
  category: 'Plumbing' | 'Electrical' | 'Structural' | 'Internet' | 'Other'
  priority: 'Low' | 'Normal' | 'High' | 'Critical'
  description: string
  status: 'Pending' | 'In Progress' | 'Completed'
  createdAt?: string
  completedAt?: string
  archivedAt?: string | null
  actionNotes?: string
  images?: UploadedFile[] | null
  propertySpace?: { documentId?: string; name?: string; propertyCode?: string; building?: string } | null
  followUps?: { message: string; author: string; createdAt: string }[]
}

type Tenancy = {
  id: number | string
  documentId?: string
  status: 'Active' | 'Ended' | 'Terminated'
  propertySpace?: { documentId?: string; name?: string; propertyCode?: string; building?: string } | null
}
type ListResponse<T> = { data: T[] }

const CATEGORIES = ['Plumbing', 'Electrical', 'Structural', 'Internet', 'Other']
const PRIORITIES = MAINTENANCE_PRIORITIES

useHead({ title: 'Maintenance | iMapSU' })

const auth = useAuth()
const notify = useNotify()
const { baseURL, $api, getErrorMessage } = useStrapi()
const headers = {}

const recordsPage = useRecordPage([], {  })
const { data: responseData, status, error, refresh } = await useFetch<ListResponse<MaintenanceTicket>>('/api/maintenance-tickets', { lazy: true,
  baseURL,
  headers,
  query: computed(() => ({
    'populate[propertySpace]': true,
    'populate[images]': true,
    sort: 'createdAt:desc', ...recordsPage.query.value }))
})
const { data, hasLoaded, isInitialLoading, isRefreshing, isInitialError } = useRequestPresentation(responseData, status)


const tickets = computed<MaintenanceTicket[]>(() => data.value?.data ?? [])

const { data: tenancyData } = await useCompleteFetch<ListResponse<Tenancy>>('/api/tenancies', { lazy: true,
  baseURL,
  headers,
  query: {
    'populate[propertySpace]': true,
    'filters[status][$eq]': 'Active',
    sort: 'createdAt:desc'
  }
})

const rentedProperties = computed(() => (tenancyData.value?.data ?? []).flatMap(tenancy => tenancy.propertySpace?.documentId ? [tenancy.propertySpace] : []))
const propertyOptions = computed(() => rentedProperties.value.map(property => ({ label: `${property.name} (${property.propertyCode})`, value: property.documentId as string })))
// A tenant with several stalls has to choose one, so a ticket is never filed
// against the wrong stall by default. With a single stall there is no choice.
const pickedProperty = ref<string>()
const selectedProperty = computed(() => rentedProperties.value.length === 1 ? rentedProperties.value[0]?.documentId : pickedProperty.value)

const category = ref<string>('Plumbing')
const priority = ref<'Low' | 'Normal' | 'High' | 'Critical'>('Normal')
const description = ref('')
const imageFiles = ref<File[]>([])
const submitting = ref(false)
const errorMessage = ref('')

const onImagesSelected = (event: Event) => {
  const input = event.target as HTMLInputElement
  imageFiles.value = Array.from(input.files ?? [])
}

const submit = async () => {
  errorMessage.value = ''
  if (!selectedProperty.value) {
    errorMessage.value = rentedProperties.value.length
      ? 'Please choose the stall with the issue.'
      : 'No active tenancy found for your account. Please contact the office.'
    return
  }
  if (!description.value.trim()) {
    errorMessage.value = 'Please describe the issue.'
    return
  }

  submitting.value = true
  try {
    let imageIds: number[] = []
    if (imageFiles.value.length) {
      const uploaded = await uploadInBatches(imageFiles.value, batch => {
        const formData = new FormData()
        formData.append('purpose', 'maintenance')
        for (const file of batch) formData.append('files', file)
        return $api<UploadedFile[]>('/api/upload', {
          method: 'POST',
          body: formData
        })
      })
      imageIds = uploaded.map(file => file.id).filter((id): id is number => id != null)
    }
    await $api('/api/maintenance-tickets', {
      method: 'POST',
      body: {
        propertySpace: selectedProperty.value,
        category: category.value,
        priority: priority.value,
        description: description.value.trim(),
        images: imageIds.length ? imageIds : undefined
      }
    })
    pickedProperty.value = undefined
    category.value = 'Plumbing'
    priority.value = 'Normal'
    description.value = ''
    imageFiles.value = []
    notify.success('Maintenance ticket submitted', { description: 'Your issue is ready for the maintenance team to review.' })
    await refresh()
  } catch (err) {
    errorMessage.value = getErrorMessage(err)
  } finally {
    submitting.value = false
  }
}

const statusColor = maintenanceStatusColor
const priorityColor = maintenancePriorityColor
const categoryIcon = maintenanceCategoryIcon

const formatDate = (value?: string) => value
  ? new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  : ''

const formatDateTime = (value?: string) => value
  ? new Date(value).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  : ''

// Read-only service history of each ticket, loaded when opened.
const expandedHistory = ref<Record<string, boolean>>({})
const toggleHistory = (ticket: MaintenanceTicket) => {
  const key = ticketKey(ticket)
  expandedHistory.value[key] = !expandedHistory.value[key]
}

const viewerOpen = ref(false)
const viewerIndex = ref(0)
const viewerPhotos = ref<MaintenancePhoto[]>([])
const viewPhoto = (ticket: MaintenanceTicket, index: number) => {
  viewerPhotos.value = ticket.images ?? []
  viewerIndex.value = index
  viewerOpen.value = true
}

const expandedFollowUps = ref<Record<string, boolean>>({})
const toggleFollowUps = (ticket: MaintenanceTicket) => {
  const key = String(ticket.documentId ?? ticket.id)
  expandedFollowUps.value[key] = !expandedFollowUps.value[key]
}

const followUpOpen = ref(false)
const followUpTarget = ref<MaintenanceTicket | null>(null)
const followUpMessage = ref('')
const followUpSending = ref(false)
const followUpError = ref('')

const openFollowUp = (ticket: MaintenanceTicket) => {
  followUpTarget.value = ticket
  followUpMessage.value = ''
  followUpError.value = ''
  followUpOpen.value = true
}

const closeFollowUp = () => {
  followUpOpen.value = false
  followUpTarget.value = null
}

const submitFollowUp = async () => {
  if (!followUpTarget.value) return
  followUpError.value = ''
  if (!followUpMessage.value.trim()) {
    followUpError.value = 'Please write a follow-up message.'
    return
  }

  followUpSending.value = true
  try {
    await $api(`/api/maintenance-tickets/${followUpTarget.value.documentId ?? followUpTarget.value.id}/follow-up`, {
      method: 'POST',
      body: { message: followUpMessage.value.trim() }
    })
    closeFollowUp()
    await refresh()
  } catch (err) {
    followUpError.value = getErrorMessage(err)
  } finally {
    followUpSending.value = false
  }
}
</script>

<template>
  <div>
  <main class="imapsu-page">
    <AppPageHeader>
      <template #title>Maintenance</template>
      <template #description><p class="mt-2 max-w-xl text-muted">Report a maintenance concern with your rental spaces and track its recorded status.</p></template>
      <template #actions><UButton label="Refresh" icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="status === 'pending'" @click="refresh" /></template>
    </AppPageHeader>

    <div class="grid items-start gap-6 lg:grid-cols-5">
      <UCard class="lg:col-span-3">
        <template #header>
          <h2 class="text-lg font-semibold text-highlighted">Report an issue</h2>
        </template>

        <form class="space-y-5" @submit.prevent="submit">
          <UFormField label="Property" name="propertySpace" required>
            <USelect v-if="rentedProperties.length > 1" v-model="pickedProperty" :items="propertyOptions" placeholder="Choose a stall" class="w-full" :disabled="submitting" />
            <div v-else-if="rentedProperties[0]" class="flex items-center gap-2 rounded-md border border-default bg-elevated px-3 py-2.5">
              <UIcon name="i-lucide-building-2" class="size-4 shrink-0 text-primary" />
              <span class="truncate text-sm font-medium text-highlighted">{{ rentedProperties[0].name }}</span>
              <span class="text-xs text-muted">({{ rentedProperties[0].propertyCode }})</span>
            </div>
            <p v-else class="text-sm text-muted">No active tenancy found for your account.</p>
          </UFormField>

          <UFormField label="Category" name="category" required>
            <USelect v-model="category" :items="CATEGORIES" :disabled="submitting" />
          </UFormField>

          <UFormField label="Priority" name="priority" description="How urgent is the issue?">
            <USelect v-model="priority" :items="PRIORITIES.map(p => ({ label: p, value: p }))" :disabled="submitting" />
          </UFormField>

          <UFormField label="Description" name="description" required>
            <UTextarea required v-model="description" placeholder="Describe the issue and where in the space it is…" :rows="4" :disabled="submitting" />
          </UFormField>

          <UFormField label="Photos" name="images">
            <label class="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-default px-3 py-2 text-sm font-medium text-primary hover:border-primary" :class="{ 'pointer-events-none opacity-60': submitting }">
              <UIcon name="i-lucide-image-plus" class="size-4" />
              {{ imageFiles.length ? `${imageFiles.length} photo${imageFiles.length > 1 ? 's' : ''} selected` : 'Add photos' }}
              <input type="file" accept="image/*" multiple class="sr-only" :disabled="submitting" @change="onImagesSelected" />
            </label>
          </UFormField>

          <UAlert v-if="errorMessage" color="error" icon="i-lucide-triangle-alert" :description="errorMessage" />

          <UButton data-prominent="true" type="submit" block :loading="submitting">Submit ticket</UButton>
        </form>
      </UCard>

      <div class="lg:col-span-2">
        <AppRefreshState :refreshing="isRefreshing" :failed="hasLoaded && !!error" @retry="refresh" />
    <AppLoadingState v-if="isInitialLoading" variant="list" :toolbar="false" :count="4" label="Loading maintenance requests…" />

        <UAlert v-else-if="isInitialError" color="error" icon="i-lucide-triangle-alert" title="Unable to load maintenance requests" description="Please try again." ><template #actions><UButton label="Retry" color="neutral" variant="outline" @click="refresh" /></template></UAlert>

        <UEmpty v-else-if="tickets.length === 0" icon="i-lucide-wrench" title="No maintenance tickets" description="Tickets you submit will appear here." />

        <div v-else class="space-y-4">
          <UCard v-for="item in tickets" :key="item.documentId ?? item.id" :ui="{ body: 'p-5' }">
            <div class="flex items-start justify-between gap-3">
              <div class="flex min-w-0 items-center gap-2">
                <span class="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                  <UIcon :name="categoryIcon(item.category)" class="size-4" />
                </span>
                <div class="min-w-0">
                  <p class="font-medium text-highlighted">{{ item.category }}</p>
                  <p class="mt-0.5 text-xs text-muted"><span class="font-medium tabular-nums text-toned">{{ ticketNumber(item) }}</span> · Reported {{ formatDate(item.createdAt) }}</p>
                </div>
              </div>
              <div class="flex shrink-0 items-center gap-2">
                <UBadge :color="priorityColor(item.priority)" variant="subtle">{{ item.priority }}</UBadge>
                <UBadge v-if="item.archivedAt" color="neutral" variant="subtle">Closed by office</UBadge>
                <UBadge v-else :color="statusColor(item.status)" variant="subtle">{{ item.status }}</UBadge>
              </div>
            </div>

            <p class="mt-3 text-sm leading-relaxed text-toned">{{ item.description }}</p>

            <div v-if="item.images?.length" class="mt-4 flex flex-wrap gap-2">
              <button v-for="(image, index) in item.images" :key="image.id" type="button" class="overflow-hidden rounded-lg ring-1 ring-default transition hover:ring-primary" :aria-label="`View photo ${index + 1} of ${item.images.length}`" @click="viewPhoto(item, index)">
                <img :src="`${baseURL}${image.url}`" :alt="image.name || 'Ticket photo'" class="h-20 w-20 object-cover" />
              </button>
            </div>

            <div v-if="item.actionNotes" class="mt-4 rounded-lg bg-primary/5 px-3 py-2">
              <p class="text-xs font-medium text-muted">Action taken</p>
              <p class="mt-1 text-sm leading-relaxed text-toned">{{ item.actionNotes }}</p>
            </div>

            <div v-if="item.status === 'Completed' && item.completedAt" class="mt-4 flex items-center gap-1.5 text-xs text-muted">
              <UIcon name="i-lucide-check-circle-2" class="size-3.5 text-success-500" />
              Completed {{ formatDateTime(item.completedAt) }}
            </div>

            <p v-if="item.propertySpace" class="mt-3 flex items-center gap-1 text-xs text-muted">
              <UIcon name="i-lucide-building-2" class="size-3.5" />
              {{ item.propertySpace.name }}
              <span>({{ item.propertySpace.propertyCode }})</span>
            </p>

            <div v-if="item.followUps?.length" class="mt-4 border-t border-default pt-3">
              <UButton size="xs" color="neutral" variant="ghost" :label="`${item.followUps.length} follow-up${item.followUps.length > 1 ? 's' : ''}`" :icon="expandedFollowUps[String(item.documentId ?? item.id)] ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" @click="toggleFollowUps(item)" />
              <div v-if="expandedFollowUps[String(item.documentId ?? item.id)]" class="mt-2 space-y-2">
                <div v-for="(followUp, index) in item.followUps" :key="index" class="rounded-md border border-default bg-muted/20 px-3 py-2">
                  <div class="flex items-center justify-between gap-2">
                    <p class="flex items-center gap-1 text-xs font-semibold text-highlighted">
                      <UIcon name="i-lucide-message-square-text" class="size-3.5 text-primary" />
                      {{ followUp.author }}
                    </p>
                    <span class="shrink-0 text-[11px] text-muted">{{ formatDateTime(followUp.createdAt) }}</span>
                  </div>
                  <p class="mt-1 text-sm leading-relaxed text-toned">{{ followUp.message }}</p>
                </div>
              </div>
            </div>

            <div v-if="expandedHistory[ticketKey(item)]" class="mt-4 border-t border-default pt-4">
              <MaintenanceActivityTimeline :ticket-id="ticketKey(item)" :reporter-id="auth.user.value?.id" />
            </div>

            <div class="mt-4 flex items-center justify-between gap-2 border-t border-default pt-3">
              <UButton size="sm" color="neutral" variant="ghost" icon="i-lucide-history" :trailing-icon="expandedHistory[ticketKey(item)] ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" :label="expandedHistory[ticketKey(item)] ? 'Hide history' : 'History'" :aria-expanded="!!expandedHistory[ticketKey(item)]" @click="toggleHistory(item)" />
              <UButton v-if="item.status !== 'Completed' && !item.archivedAt" size="sm" color="primary" variant="subtle" icon="i-lucide-message-square-text" label="Follow up" @click="openFollowUp(item)" />
            </div>
          </UCard>
        </div>
      </div>
    </div>
    <AppRecordPagination :state="recordsPage" :response="data" :pending="status === 'pending'" />
  </main>

  <MaintenancePhotoViewer v-model:open="viewerOpen" v-model:index="viewerIndex" :photos="viewerPhotos" />

  <UModal v-model:open="followUpOpen" class="max-w-xl" title="Follow up on ticket" :description="followUpTarget ? `${followUpTarget.category} — ${followUpTarget.propertySpace?.name ?? 'maintenance ticket'}` : undefined">
    <template #body>
      <form class="space-y-4" @submit.prevent="submitFollowUp">
        <UFormField label="Message" required>
          <UTextarea required v-model="followUpMessage" placeholder="Let the maintenance team know the issue is still there…" :rows="4" :disabled="followUpSending" />
        </UFormField>
        <UAlert v-if="followUpError" color="error" icon="i-lucide-triangle-alert" :description="followUpError" />
        <div class="flex justify-end gap-2">
          <UButton label="Cancel" color="neutral" variant="ghost" :disabled="followUpSending" @click="closeFollowUp" />
          <UButton data-prominent="true" type="submit" :loading="followUpSending">Send follow-up</UButton>
        </div>
      </form>
    </template>
  </UModal>
  </div>
</template>
