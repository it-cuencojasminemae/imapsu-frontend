<script setup lang="ts">
import { uploadInBatches } from '~/utils/uploadFile'
import {
  MAINTENANCE_CATEGORIES,
  MAINTENANCE_PRIORITIES,
  formatTicketDate,
  formatTicketDateTime,
  maintenanceCategoryIcon,
  maintenancePriorityColor,
  maintenanceStatusColor,
  openDuration,
  parseTicketNumber,
  ticketKey,
  ticketNumber,
  type MaintenanceCategory,
  type MaintenancePhoto,
  type MaintenancePriority,
  type MaintenanceStatus,
  type MaintenanceTicket
} from '~/utils/maintenance'

definePageMeta({
  middleware: ['auth', 'role'],
  roles: ['oas']
})

type ListResponse<T> = { data: T[]; meta?: { pagination?: { total?: number } } }
type HandlingChange = { status?: MaintenanceStatus; priority?: MaintenancePriority; category?: MaintenanceCategory; actionNotes?: string | null; reopenReason?: string | null; archived?: boolean; archiveReason?: string | null }
type TicketView = 'All' | MaintenanceStatus | 'Archived'

useHead({ title: 'Maintenance Tickets | iMapSU' })

const notify = useNotify()
const { confirm } = useConfirmDialog()
const { baseURL, $api, getErrorMessage } = useStrapi()
const headers = {}

// The status tabs are the only status filter. "Archived" is its own view:
// archived tickets are left out of every other tab.
const filterSearch = ref('')
const filterStatus = ref<string>('All')
const filterPriority = ref('All')
const recordsPage = useRecordPage(['description', 'category', 'propertySpace.name', 'propertySpace.propertyCode', 'reporter.username'], { status: { ref: filterStatus, field: 'status' }, priority: { ref: filterPriority, field: 'priority' } }, filterSearch)

// Searching "MT-0007" looks the ticket up by number instead of by text.
const listQuery = computed(() => {
  const query: Record<string, any> = { ...recordsPage.query.value }
  const number = parseTicketNumber(filterSearch.value)
  if (number != null) {
    for (const key of Object.keys(query)) if (key.startsWith('filters[$and]')) delete query[key]
    query['filters[id][$eq]'] = number
  }
  if (filterStatus.value === 'Archived') {
    delete query['filters[status][$eq]']
    query['filters[archivedAt][$notNull]'] = true
  } else {
    query['filters[archivedAt][$null]'] = true
  }
  return query
})

const { data: responseData, status, error, refresh } = await useFetch<ListResponse<MaintenanceTicket>>('/api/maintenance-tickets', { lazy: true,
  baseURL,
  headers,
  query: computed(() => ({
    'populate[propertySpace]': true,
    'populate[reporter][populate][avatar]': true,
    'populate[images]': true,
    sort: 'createdAt:desc', ...listQuery.value }))
})
const { data, hasLoaded, isInitialLoading, isRefreshing, isInitialError } = useRequestPresentation(responseData, status)

const tickets = computed<MaintenanceTicket[]>(() => data.value?.data ?? [])

// Tab counts cover every page and follow the priority and search filters.
const VIEWS: TicketView[] = ['All', 'Pending', 'In Progress', 'Completed', 'Archived']
const counts = ref(Object.fromEntries(VIEWS.map(view => [view, 0])) as Record<TicketView, number>)
const countBase = computed(() => {
  const query: Record<string, any> = {}
  for (const [key, value] of Object.entries(listQuery.value)) {
    if (key.startsWith('pagination') || key.startsWith('filters[status]') || key.startsWith('filters[archivedAt]') || key === 'sort') continue
    query[key] = value
  }
  return { ...query, 'pagination[pageSize]': 1, 'fields[0]': 'status' }
})
const viewFilter = (view: TicketView): Record<string, any> => {
  if (view === 'Archived') return { 'filters[archivedAt][$notNull]': true }
  return { 'filters[archivedAt][$null]': true, ...(view === 'All' ? {} : { 'filters[status][$eq]': view }) }
}
let countSequence = 0
const loadCounts = async () => {
  const id = ++countSequence
  try {
    const keys = VIEWS
    const totals = await Promise.all(keys.map(key => $api<ListResponse<unknown>>('/api/maintenance-tickets', {
      query: { ...countBase.value, ...viewFilter(key) }
    }).then(result => result.meta?.pagination?.total ?? 0)))
    if (id === countSequence) counts.value = Object.fromEntries(keys.map((key, index) => [key, totals[index]])) as typeof counts.value
  } catch {
    // The tabs keep their last counts; the list itself reports load errors.
  }
}
watch(countBase, loadCounts, { immediate: true, deep: true })

const reload = async () => {
  await Promise.all([refresh(), loadCounts()])
}

const filterCount = computed(() => {
  let count = 0
  if (filterStatus.value !== 'All') count++
  if (filterPriority.value !== 'All') count++
  if (filterSearch.value.trim()) count++
  return count
})

const clearFilters = () => {
  filterStatus.value = 'All'
  filterPriority.value = 'All'
  filterSearch.value = ''
}

const statusTabs: TicketView[] = ['All', 'Pending', 'In Progress', 'Completed']
const viewingArchive = computed(() => filterStatus.value === 'Archived')

// ── Ticket details ────────────────────────────────────────────────────────
const detailsOpen = ref(false)
const selected = ref<MaintenanceTicket | null>(null)
const activityKey = ref(0)
// Which handling change is in flight, e.g. 'priority' or 'status'.
const saving = ref<string | null>(null)
const savingTicket = ref<string | null>(null)

const openDetails = (ticket: MaintenanceTicket) => {
  selected.value = ticket
  detailsOpen.value = true
}

// Keep the details on fresh data after a refresh. A ticket that left the
// current tab stays open with what is already known about it.
watch(tickets, list => {
  if (!selected.value) return
  const fresh = list.find(ticket => ticketKey(ticket) === ticketKey(selected.value!))
  if (fresh) selected.value = fresh
})

// Only the handling fields are ever sent; the server rejects anything else
// and records each change in the ticket's activity log.
const applyChange = async (ticket: MaintenanceTicket, change: HandlingChange, message: string) => {
  const field = change.archived !== undefined ? 'archived' : change.status !== undefined ? 'status' : Object.keys(change)[0] ?? null
  saving.value = field
  savingTicket.value = ticketKey(ticket)
  try {
    const result = await $api<{ data: Partial<MaintenanceTicket> }>(`/api/maintenance-tickets/${ticketKey(ticket)}`, {
      method: 'PUT',
      body: { data: change }
    })
    const updated = result?.data ?? {}
    const patch = {
      status: updated.status ?? ticket.status,
      priority: updated.priority ?? ticket.priority,
      category: updated.category ?? ticket.category,
      actionNotes: updated.actionNotes !== undefined ? updated.actionNotes : ticket.actionNotes,
      completedAt: updated.completedAt !== undefined ? updated.completedAt : ticket.completedAt,
      archivedAt: updated.archivedAt !== undefined ? updated.archivedAt : ticket.archivedAt
    }
    Object.assign(ticket, patch)
    if (selected.value && ticketKey(selected.value) === ticketKey(ticket) && selected.value !== ticket) Object.assign(selected.value, patch)
    activityKey.value++
    notify.success(message)
    await reload()
    return true
  } catch (err) {
    notify.error('Unable to update ticket', { description: getErrorMessage(err) })
    return false
  } finally {
    saving.value = null
    savingTicket.value = null
  }
}

const isSaving = (ticket: MaintenanceTicket, field?: string) =>
  savingTicket.value === ticketKey(ticket) && (field == null || saving.value === field)

const startWork = (ticket: MaintenanceTicket) =>
  applyChange(ticket, { status: 'In Progress' }, `${ticketNumber(ticket)} is in progress`)

const changeHandling = (ticket: MaintenanceTicket, change: HandlingChange) => {
  if (change.priority !== undefined) return applyChange(ticket, change, `Priority set to ${change.priority}`)
  if (change.category !== undefined) return applyChange(ticket, change, `Category changed to ${change.category}`)
  return applyChange(ticket, change, 'Action notes saved')
}

// ── Completion (requires action notes) ────────────────────────────────────
const completeOpen = ref(false)
const completeTarget = ref<MaintenanceTicket | null>(null)
const completeNotes = ref('')
const completeError = ref('')

const openComplete = (ticket: MaintenanceTicket) => {
  completeTarget.value = ticket
  completeNotes.value = ticket.actionNotes ?? ''
  completeError.value = ''
  completeOpen.value = true
}

const submitComplete = async () => {
  if (!completeTarget.value) return
  const notes = completeNotes.value.trim()
  if (!notes) {
    completeError.value = 'Describe what was done before completing the ticket.'
    return
  }
  const ticket = completeTarget.value
  if (await applyChange(ticket, { status: 'Completed', actionNotes: notes }, `${ticketNumber(ticket)} completed`)) {
    completeOpen.value = false
  }
}

// ── Reopen ────────────────────────────────────────────────────────────────
const reopenOpen = ref(false)
const reopenTarget = ref<MaintenanceTicket | null>(null)
const reopenReason = ref('')

const openReopen = (ticket: MaintenanceTicket) => {
  reopenTarget.value = ticket
  reopenReason.value = ''
  reopenOpen.value = true
}

const submitReopen = async () => {
  if (!reopenTarget.value) return
  const ticket = reopenTarget.value
  if (await applyChange(ticket, { status: 'Pending', reopenReason: reopenReason.value.trim() || null }, `${ticketNumber(ticket)} reopened`)) {
    reopenOpen.value = false
  }
}

// ── Archive ───────────────────────────────────────────────────────────────
// Archiving replaces deleting: the ticket and its history are kept and can
// be restored. An unresolved ticket needs a reason, e.g. a duplicate report.
const archiveOpen = ref(false)
const archiveTarget = ref<MaintenanceTicket | null>(null)
const archiveReason = ref('')
const archiveError = ref('')
const archiveNeedsReason = computed(() => archiveTarget.value?.status !== 'Completed')

const openArchive = (ticket: MaintenanceTicket) => {
  archiveTarget.value = ticket
  archiveReason.value = ''
  archiveError.value = ''
  archiveOpen.value = true
}

const submitArchive = async () => {
  if (!archiveTarget.value) return
  const reason = archiveReason.value.trim()
  if (archiveNeedsReason.value && !reason) {
    archiveError.value = 'Say why this unresolved ticket is being archived.'
    return
  }
  const ticket = archiveTarget.value
  if (await applyChange(ticket, { archived: true, archiveReason: reason || null }, `${ticketNumber(ticket)} archived`)) {
    archiveOpen.value = false
  }
}

const restore = async (ticket: MaintenanceTicket) => {
  if (!await confirm({ title: 'Restore ticket?', description: `${ticketNumber(ticket)} goes back to the ${ticket.status} tab and can be handled again.`, confirmLabel: 'Restore ticket', icon: 'i-lucide-archive-restore' })) return
  await applyChange(ticket, { archived: false }, `${ticketNumber(ticket)} restored`)
}

// ── Card photos ───────────────────────────────────────────────────────────
const viewerOpen = ref(false)
const viewerIndex = ref(0)
const viewerPhotos = ref<MaintenancePhoto[]>([])
const viewPhoto = (ticket: MaintenanceTicket, index: number) => {
  viewerPhotos.value = ticket.images ?? []
  viewerIndex.value = index
  viewerOpen.value = true
}

// Unresolved for over a week: the open duration is highlighted.
const waitingLong = (ticket: MaintenanceTicket) =>
  !!ticket.createdAt && Date.now() - new Date(ticket.createdAt).getTime() > 7 * 86_400_000

const expandedFollowUps = ref<Record<string, boolean>>({})
const toggleFollowUps = (ticket: MaintenanceTicket) => {
  const key = ticketKey(ticket)
  expandedFollowUps.value[key] = !expandedFollowUps.value[key]
}

// ── New ticket for a walk-in tenant ───────────────────────────────────────
const { data: tenancyData } = await useCompleteFetch<ListResponse<{
  documentId?: string
  status: string
  user?: { id: number; username?: string } | null
  propertySpace?: { documentId?: string; name?: string; propertyCode?: string } | null
}>>('/api/tenancies', { lazy: true,
  baseURL,
  headers,
  query: {
    'populate[user]': true,
    'populate[propertySpace]': true,
    sort: 'createdAt:desc',
    'pagination[pageSize]': 100
  }
})

// The lookup's value carries both the tenant and the stall, so a tenancy
// found by searching (and not in the preloaded list) still resolves.
const tenancyValue = (tenancy: { user?: { id: number } | null; propertySpace?: { documentId?: string } | null }) =>
  tenancy.user && tenancy.propertySpace?.documentId ? `${tenancy.user.id}:${tenancy.propertySpace.documentId}` : ''
const parseTenancyValue = (value: string) => {
  const [user, stall] = value.split(':')
  return user && stall ? { reporter: Number(user), propertySpace: stall } : null
}

const tenancyOptions = computed(() => (tenancyData.value?.data ?? [])
  .filter(tenancy => tenancy.status === 'Active' && tenancy.user && tenancy.propertySpace)
  .map(tenancy => ({
    label: `${tenancy.propertySpace!.name} (${tenancy.propertySpace!.propertyCode}) — ${tenancy.user!.username}`,
    value: tenancyValue(tenancy)
  })))

const formOpen = ref(false)
const creating = ref(false)
const formError = ref('')
const imageUploading = ref(false)
const imageDrafts = ref<MaintenancePhoto[]>([])
const form = reactive({
  tenancy: '',
  category: 'Plumbing' as MaintenanceCategory,
  priority: 'Normal' as MaintenancePriority,
  description: ''
})

const openCreate = () => {
  Object.assign(form, { tenancy: '', category: 'Plumbing', priority: 'Normal', description: '' })
  imageDrafts.value = []
  formError.value = ''
  formOpen.value = true
}

const onImagesSelected = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = ''
  if (!files.length) return
  imageUploading.value = true
  formError.value = ''
  try {
    const uploaded = await uploadInBatches(files, batch => {
      const formData = new FormData()
      formData.append('purpose', 'maintenance')
      for (const file of batch) formData.append('files', file)
      return $api<MaintenancePhoto[]>('/api/upload', {
        method: 'POST',
        body: formData
      })
    })
    imageDrafts.value.push(...uploaded.filter(image => image?.id != null))
  } catch (err) {
    formError.value = getErrorMessage(err)
  } finally {
    imageUploading.value = false
  }
}

const removeImage = (image: MaintenancePhoto) => {
  imageDrafts.value = imageDrafts.value.filter(item => item.id !== image.id)
}

const create = async () => {
  formError.value = ''
  const tenancy = parseTenancyValue(form.tenancy)
  if (!tenancy) {
    formError.value = 'Choose the tenant and the stall the ticket is for.'
    return
  }
  if (!form.description.trim()) {
    formError.value = 'Describe the issue as the tenant reported it.'
    return
  }

  creating.value = true
  try {
    await $api('/api/maintenance-tickets', {
      method: 'POST',
      body: {
        data: {
          ...tenancy,
          category: form.category,
          priority: form.priority,
          description: form.description.trim(),
          images: imageDrafts.value.length ? imageDrafts.value.map(image => image.id) : undefined
        }
      }
    })
    notify.success('Ticket filed for the tenant')
    formOpen.value = false
    await reload()
  } catch (err) {
    formError.value = getErrorMessage(err)
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <div>
  <main class="imapsu-page imapsu-page--admin">
    <AppPageHeader>
      <template #title>Maintenance tickets</template>
      <template #description><p class="mt-2 max-w-xl text-muted">Review and track maintenance concerns reported by campus stall tenants.</p></template>
      <template #actions><div class="flex items-center gap-3">
        <UButton label="Refresh" icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="status === 'pending'" @click="reload" />
        <UButton label="New ticket" icon="i-lucide-plus" @click="openCreate" />
      </div></template>
    </AppPageHeader>

    <AppRefreshState :refreshing="isRefreshing" :failed="hasLoaded && !!error" @retry="reload" />
    <AppLoadingState v-if="isInitialLoading" variant="list" :count="4" label="Loading maintenance requests…" />

    <UAlert v-else-if="isInitialError" color="error" icon="i-lucide-triangle-alert" title="Unable to load maintenance requests" description="Please try again." ><template #actions><UButton label="Retry" color="neutral" variant="outline" @click="reload" /></template></UAlert>

    <UEmpty v-else-if="tickets.length === 0 && filterCount === 0" icon="i-lucide-wrench" title="No maintenance tickets" description="Tickets reported by tenants will appear here." />

    <div v-else class="space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-2" role="tablist" aria-label="Ticket status">
        <div class="flex flex-wrap gap-2">
          <UButton v-for="tab in statusTabs" :key="tab" size="sm" variant="ghost" role="tab" :aria-selected="filterStatus === tab" :color="filterStatus === tab ? 'primary' : 'neutral'" @click="filterStatus = tab">
            {{ tab }} <span class="text-xs tabular-nums opacity-80">{{ counts[tab] }}</span>
          </UButton>
        </div>
        <UButton size="sm" variant="ghost" role="tab" icon="i-lucide-archive" :aria-selected="viewingArchive" :color="viewingArchive ? 'primary' : 'neutral'" @click="filterStatus = 'Archived'">
          Archived <span class="text-xs tabular-nums opacity-80">{{ counts.Archived }}</span>
        </UButton>
      </div>

      <UCard :ui="{ body: 'p-4' }">
        <div class="grid gap-3 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto]">
          <UFormField label="Priority">
            <USelect v-model="filterPriority" :items="[{ label: 'All priorities', value: 'All' }, ...MAINTENANCE_PRIORITIES.map(p => ({ label: p, value: p }))]" class="w-full" />
          </UFormField>
          <UFormField label="Search">
            <UInput v-model="filterSearch" placeholder="Ticket number, tenant, stall, category, description…" icon="i-lucide-search" class="w-full" />
          </UFormField>
          <div class="flex items-end justify-end">
            <UButton v-if="filterCount > 0" label="Clear filters" icon="i-lucide-x" color="neutral" variant="ghost" size="sm" @click="clearFilters" />
          </div>
        </div>
      </UCard>

      <UEmpty v-if="tickets.length === 0 && viewingArchive && !filterSearch.trim() && filterPriority === 'All'" icon="i-lucide-archive" title="No archived tickets" description="Tickets you archive are kept here with their full history and can be restored." />
      <UEmpty v-else-if="tickets.length === 0" icon="i-lucide-list-filter" title="No matching tickets" description="No tickets match the current filters." />
      <div v-else class="space-y-4">
        <UCard v-for="item in tickets" :key="ticketKey(item)" :ui="{ body: 'p-5' }" class="cursor-pointer transition-colors hover:ring-accented" @click="openDetails(item)">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="flex min-w-0 items-center gap-2">
              <span class="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                <UIcon :name="maintenanceCategoryIcon(item.category)" class="size-4" />
              </span>
              <div class="min-w-0">
                <p class="font-medium text-highlighted">{{ item.category }}</p>
                <p class="mt-0.5 text-xs text-muted">
                  <span class="font-medium tabular-nums text-toned">{{ ticketNumber(item) }}</span>
                  · Reported {{ formatTicketDateTime(item.createdAt) }}
                </p>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <UBadge :color="maintenancePriorityColor(item.priority)" variant="subtle">{{ item.priority }}</UBadge>
              <UBadge :color="maintenanceStatusColor(item.status)" variant="subtle">{{ item.status }}</UBadge>
            </div>
          </div>

          <div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
            <span class="flex items-center gap-1.5"><AppUserAvatar :user="item.reporter" />{{ item.reporter?.username ?? item.reporter?.email ?? 'Unknown' }}</span>
            <span v-if="item.propertySpace" class="flex items-center gap-1">
              <UIcon name="i-lucide-building-2" class="size-3.5" />
              {{ item.propertySpace.name }}
              <span>({{ item.propertySpace.propertyCode }})</span>
            </span>
            <span v-else class="flex items-center gap-1"><UIcon name="i-lucide-building" class="size-3.5" />No stall attached</span>
            <span v-if="item.status === 'Completed'" class="flex items-center gap-1">
              <UIcon name="i-lucide-check-circle-2" class="size-3.5 text-success" />Completed {{ formatTicketDate(item.completedAt) }}
            </span>
            <span v-else-if="!item.archivedAt" class="flex items-center gap-1" :class="{ 'text-warning': waitingLong(item) }">
              <UIcon name="i-lucide-clock" class="size-3.5" />{{ openDuration(item.createdAt) }}
            </span>
            <span v-if="item.archivedAt" class="flex items-center gap-1">
              <UIcon name="i-lucide-archive" class="size-3.5" />Archived {{ formatTicketDate(item.archivedAt) }}
            </span>
          </div>

          <p class="mt-3 line-clamp-3 text-sm leading-relaxed text-toned">{{ item.description }}</p>

          <div v-if="item.images?.length" class="mt-4 flex flex-wrap gap-2" @click.stop>
            <button v-for="(image, index) in item.images.slice(0, 4)" :key="image.id" type="button" class="relative overflow-hidden rounded-lg ring-1 ring-default transition hover:ring-primary" :aria-label="`View photo ${index + 1} of ${item.images.length}`" @click="viewPhoto(item, index)">
              <img :src="`${baseURL}${image.url}`" :alt="image.name || 'Ticket photo'" class="size-20 object-cover" />
              <span v-if="index === 3 && item.images.length > 4" class="absolute inset-0 grid place-items-center bg-black/60 text-sm font-medium text-white">+{{ item.images.length - 4 }}</span>
            </button>
          </div>

          <div v-if="item.actionNotes" class="mt-4 rounded-lg bg-primary/5 px-3 py-2">
            <p class="text-xs font-medium text-muted">Action notes</p>
            <p class="mt-1 line-clamp-3 whitespace-pre-line text-sm leading-relaxed text-toned">{{ item.actionNotes }}</p>
          </div>

          <div v-if="item.followUps?.length" class="mt-4 border-t border-default pt-3" @click.stop>
            <UButton size="xs" color="neutral" variant="ghost" :label="`${item.followUps.length} follow-up${item.followUps.length > 1 ? 's' : ''}`" :icon="expandedFollowUps[ticketKey(item)] ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" @click="toggleFollowUps(item)" />
            <div v-if="expandedFollowUps[ticketKey(item)]" class="mt-2 space-y-2">
              <div v-for="(followUp, index) in item.followUps" :key="index" class="rounded-md border border-default bg-muted/20 px-3 py-2">
                <div class="flex items-center justify-between gap-2">
                  <p class="flex items-center gap-1 text-xs font-semibold text-highlighted">
                    <UIcon name="i-lucide-message-square-text" class="size-3.5 text-primary" />
                    {{ followUp.author }}
                  </p>
                  <span class="shrink-0 text-[11px] text-muted">{{ formatTicketDateTime(followUp.createdAt) }}</span>
                </div>
                <p class="mt-1 text-sm leading-relaxed text-toned">{{ followUp.message }}</p>
              </div>
            </div>
          </div>

          <div class="mt-4 flex flex-wrap items-center gap-2 border-t border-default pt-4" @click.stop>
            <template v-if="!item.archivedAt">
              <UButton v-if="item.status === 'Pending'" label="Start work" icon="i-lucide-play" color="primary" variant="subtle" size="sm" :loading="isSaving(item, 'status')" :disabled="isSaving(item)" @click="startWork(item)" />
              <UButton v-else-if="item.status === 'In Progress'" label="Mark completed" icon="i-lucide-check-check" color="success" variant="subtle" size="sm" :disabled="isSaving(item)" @click="openComplete(item)" />
              <UButton v-else label="Reopen" icon="i-lucide-rotate-ccw" color="neutral" variant="outline" size="sm" :disabled="isSaving(item)" @click="openReopen(item)" />
            </template>
            <UButton label="View details" color="neutral" variant="subtle" size="sm" @click="openDetails(item)" />
            <UButton v-if="item.archivedAt" label="Restore" icon="i-lucide-archive-restore" color="neutral" variant="ghost" size="sm" :loading="isSaving(item, 'archived')" :disabled="isSaving(item)" @click="restore(item)" />
            <UButton v-else label="Archive" icon="i-lucide-archive" color="neutral" variant="ghost" size="sm" :disabled="isSaving(item)" @click="openArchive(item)" />
          </div>
        </UCard>
      </div>
    </div>

    <AppRecordPagination :state="recordsPage" :response="data" :pending="status === 'pending'" />
  </main>

  <MaintenanceTicketDetails
    v-model:open="detailsOpen"
    :ticket="selected"
    :saving="selected && savingTicket === ticketKey(selected) ? saving : null"
    :reload-key="activityKey"
    @start="startWork"
    @complete="openComplete"
    @reopen="openReopen"
    @change="changeHandling"
  />

  <MaintenancePhotoViewer v-model:open="viewerOpen" v-model:index="viewerIndex" :photos="viewerPhotos" />

  <UModal v-model:open="completeOpen" class="max-w-lg" title="Mark ticket completed" :description="completeTarget ? `${ticketNumber(completeTarget)} · ${completeTarget.category} · ${completeTarget.propertySpace?.name ?? 'No stall'}` : undefined">
    <template #body>
      <form class="space-y-4" @submit.prevent="submitComplete">
        <UFormField label="What was done to resolve this?" required :error="completeError || undefined">
          <UTextarea v-model="completeNotes" :rows="4" autoresize autofocus placeholder="e.g. Replaced the tripped breaker and tested all outlets." :disabled="saving === 'status'" class="w-full" @update:model-value="completeError = ''" />
        </UFormField>
        <p class="text-xs text-muted">The tenant sees these notes, and the completion time is recorded by the server.</p>
        <div class="flex justify-end gap-2">
          <UButton label="Cancel" color="neutral" variant="ghost" :disabled="saving === 'status'" @click="completeOpen = false" />
          <UButton data-prominent="true" type="submit" color="success" icon="i-lucide-check-check" :loading="saving === 'status'" :disabled="!completeNotes.trim()">Mark completed</UButton>
        </div>
      </form>
    </template>
  </UModal>

  <UModal v-model:open="reopenOpen" class="max-w-lg" title="Reopen ticket" :description="reopenTarget ? `${ticketNumber(reopenTarget)} goes back to Pending and its completion date is cleared.` : undefined">
    <template #body>
      <form class="space-y-4" @submit.prevent="submitReopen">
        <UFormField label="Reason" hint="Optional">
          <UTextarea v-model="reopenReason" :rows="3" autoresize placeholder="e.g. The tenant reports the outlet failed again." :disabled="saving === 'status'" class="w-full" />
        </UFormField>
        <div class="flex justify-end gap-2">
          <UButton label="Cancel" color="neutral" variant="ghost" :disabled="saving === 'status'" @click="reopenOpen = false" />
          <UButton data-prominent="true" type="submit" icon="i-lucide-rotate-ccw" :loading="saving === 'status'">Reopen ticket</UButton>
        </div>
      </form>
    </template>
  </UModal>

  <UModal v-model:open="archiveOpen" class="max-w-lg" title="Archive ticket" :description="archiveTarget ? `${ticketNumber(archiveTarget)} moves to the Archived tab with its full history. You can restore it at any time.` : undefined">
    <template #body>
      <form class="space-y-4" @submit.prevent="submitArchive">
        <UFormField :label="archiveNeedsReason ? 'Why is this unresolved ticket being archived?' : 'Reason'" :required="archiveNeedsReason" :hint="archiveNeedsReason ? undefined : 'Optional'" :error="archiveError || undefined">
          <UTextarea v-model="archiveReason" :rows="3" autoresize autofocus :placeholder="archiveNeedsReason ? 'e.g. Duplicate of MT-0003.' : 'e.g. Resolved and confirmed with the tenant.'" :disabled="saving === 'archived'" class="w-full" @update:model-value="archiveError = ''" />
        </UFormField>
        <p v-if="archiveNeedsReason" class="text-xs text-muted">This ticket is still {{ archiveTarget?.status.toLowerCase() }}, so it leaves the work queue without being completed.</p>
        <div class="flex justify-end gap-2">
          <UButton label="Cancel" color="neutral" variant="ghost" :disabled="saving === 'archived'" @click="archiveOpen = false" />
          <UButton data-prominent="true" type="submit" icon="i-lucide-archive" :loading="saving === 'archived'" :disabled="archiveNeedsReason && !archiveReason.trim()">Archive ticket</UButton>
        </div>
      </form>
    </template>
  </UModal>

  <UModal v-model:open="formOpen" class="max-w-2xl" title="New ticket" description="File a maintenance issue on behalf of a walk-in tenant. The ticket is logged as filed by you for that tenant.">
    <template #body>
      <form class="space-y-4" @submit.prevent="create">
        <UFormField label="Tenant and stall" required>
          <AppRecordLookup v-model="form.tenancy" endpoint="/api/tenancies" :fields="['user.username','propertySpace.name','propertySpace.propertyCode']" :label="item => `${item.propertySpace?.name || 'Stall'} (${item.propertySpace?.propertyCode || '—'}) — ${item.user?.username || 'Tenant'}`" :value="tenancyValue" :query="{ 'populate[user]': true, 'populate[propertySpace]': true, 'filters[status][$eq]': 'Active' }" :fallback="tenancyOptions" placeholder="Search a tenant or stall…" />
          <p v-if="tenancyOptions.length === 0" class="mt-1 text-xs text-muted">No active tenancies found. Create a tenancy first.</p>
        </UFormField>

        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField label="Category" required>
            <USelect v-model="form.category" :items="MAINTENANCE_CATEGORIES" :disabled="creating" class="w-full" />
          </UFormField>
          <UFormField label="Priority">
            <USelect v-model="form.priority" :items="MAINTENANCE_PRIORITIES" :disabled="creating" class="w-full" />
          </UFormField>
        </div>

        <UFormField label="Description" required description="Record the issue in the tenant's words. It can't be edited after filing.">
          <UTextarea required v-model="form.description" placeholder="Describe the issue and where in the stall it is…" :rows="4" :disabled="creating" class="w-full" />
        </UFormField>

        <UFormField label="Photos" description="Optional photos of the issue.">
          <div class="flex flex-wrap items-center gap-3">
            <label class="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-default px-3 py-2 text-sm font-medium text-primary hover:border-primary" :class="{ 'pointer-events-none opacity-60': imageUploading || creating }">
              <UIcon :name="imageUploading ? 'i-lucide-loader-2' : 'i-lucide-image-plus'" class="size-4" :class="{ 'animate-spin': imageUploading }" />
              {{ imageUploading ? 'Uploading…' : 'Upload photos' }}
              <input type="file" accept="image/*" multiple class="sr-only" :disabled="imageUploading || creating" @change="onImagesSelected" />
            </label>
            <div v-if="imageDrafts.length" class="flex flex-wrap gap-2">
              <div v-for="image in imageDrafts" :key="image.id" class="relative">
                <img :src="`${baseURL}${image.url}`" :alt="image.name || 'Photo'" class="h-20 w-20 rounded-lg object-cover" />
                <button type="button" :aria-label="`Remove ${image.name || 'maintenance photo'}`" class="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-default text-muted shadow hover:text-error" @click="removeImage(image)">
                  <UIcon name="i-lucide-x" class="size-3" />
                </button>
              </div>
            </div>
          </div>
        </UFormField>

        <UAlert v-if="formError" color="error" icon="i-lucide-triangle-alert" :description="formError" />

        <div class="flex justify-end gap-2">
          <UButton label="Cancel" color="neutral" variant="ghost" :disabled="creating" @click="formOpen = false" />
          <UButton data-prominent="true" type="submit" :loading="creating" :disabled="imageUploading">File ticket</UButton>
        </div>
      </form>
    </template>
  </UModal>
  </div>
</template>
