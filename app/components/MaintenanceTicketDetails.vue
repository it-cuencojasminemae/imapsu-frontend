<script setup lang="ts">
import {
  MAINTENANCE_CATEGORIES,
  MAINTENANCE_PRIORITIES,
  formatTicketDateTime,
  maintenanceCategoryIcon,
  maintenanceStatusColor,
  openDuration,
  ticketKey,
  ticketNumber,
  type MaintenanceCategory,
  type MaintenancePriority,
  type MaintenanceTicket
} from '~/utils/maintenance'

// Ticket details for the OAS: the tenant's report is shown exactly as
// submitted (read-only); only the handling fields can be changed.
const props = defineProps<{
  ticket: MaintenanceTicket | null
  // Which change is being saved, so only that control shows a spinner.
  saving?: string | null
  reloadKey?: number
}>()

const open = defineModel<boolean>('open', { default: false })

const emit = defineEmits<{
  start: [ticket: MaintenanceTicket]
  complete: [ticket: MaintenanceTicket]
  reopen: [ticket: MaintenanceTicket]
  change: [ticket: MaintenanceTicket, data: { priority?: MaintenancePriority; category?: MaintenanceCategory; actionNotes?: string | null }]
}>()

const { baseURL } = useStrapi()

const notesDraft = ref('')
watch(() => [props.ticket && ticketKey(props.ticket), props.ticket?.actionNotes], () => {
  notesDraft.value = props.ticket?.actionNotes ?? ''
}, { immediate: true })
const notesDirty = computed(() => notesDraft.value.trim() !== (props.ticket?.actionNotes ?? '').trim())
// A completed ticket must keep a record of what was done.
const notesBlocked = computed(() => props.ticket?.status === 'Completed' && !notesDraft.value.trim())

const viewerOpen = ref(false)
const viewerIndex = ref(0)
const viewPhoto = (index: number) => {
  viewerIndex.value = index
  viewerOpen.value = true
}

const busy = computed(() => !!props.saving)
// An archived ticket is read-only until it is restored (the server agrees).
const locked = computed(() => busy.value || !!props.ticket?.archivedAt)

const stall = computed(() => props.ticket?.propertySpace
  ? `${props.ticket.propertySpace.name} (${props.ticket.propertySpace.propertyCode})`
  : 'No stall attached')
</script>

<template>
  <UModal
    v-model:open="open"
    class="max-w-6xl"
    :title="ticket ? `${ticketNumber(ticket)} · ${ticket.category}` : 'Ticket'"
    :description="ticket ? `${stall} · Reported by ${ticket.reporter?.username ?? 'Unknown'}` : undefined"
    :ui="{ body: 'p-0 sm:p-0' }"
  >
    <template #body>
      <div v-if="ticket" class="grid lg:grid-cols-2 lg:divide-x lg:divide-default">
        <!-- Tenant's report: kept exactly as submitted. -->
        <section aria-labelledby="ticket-report-heading" class="space-y-6 p-5 sm:p-8">
          <div class="flex items-center justify-between gap-3">
            <h3 id="ticket-report-heading" class="flex items-center gap-2 text-base font-semibold text-highlighted">
              <UIcon name="i-lucide-file-text" class="size-5 text-primary" />Tenant's report
            </h3>
            <span class="flex items-center gap-1.5 rounded-full bg-elevated px-2.5 py-1 text-xs text-muted"><UIcon name="i-lucide-lock" class="size-3.5" />Read-only</span>
          </div>

          <dl class="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
            <div>
              <dt class="text-xs font-medium uppercase tracking-wide text-muted">Ticket</dt>
              <dd class="mt-1.5 text-sm font-medium tabular-nums text-highlighted">{{ ticketNumber(ticket) }}</dd>
            </div>
            <div>
              <dt class="text-xs font-medium uppercase tracking-wide text-muted">Reported</dt>
              <dd class="mt-1.5 text-sm text-highlighted">{{ formatTicketDateTime(ticket.createdAt) }}</dd>
            </div>
            <div class="min-w-0">
              <dt class="text-xs font-medium uppercase tracking-wide text-muted">Tenant</dt>
              <dd class="mt-1.5 flex min-w-0 items-center gap-2 text-sm text-highlighted"><AppUserAvatar :user="ticket.reporter" /><span class="truncate">{{ ticket.reporter?.username ?? ticket.reporter?.email ?? 'Unknown' }}</span></dd>
            </div>
            <div class="min-w-0">
              <dt class="text-xs font-medium uppercase tracking-wide text-muted">Stall</dt>
              <dd class="mt-1.5 flex min-w-0 items-center gap-2 text-sm text-highlighted"><UIcon name="i-lucide-building-2" class="size-4 shrink-0 text-muted" /><span class="truncate">{{ stall }}</span></dd>
            </div>
            <div>
              <dt class="text-xs font-medium uppercase tracking-wide text-muted">Category</dt>
              <dd class="mt-1.5 flex items-center gap-2 text-sm text-highlighted"><UIcon :name="maintenanceCategoryIcon(ticket.category)" class="size-4 text-primary" />{{ ticket.category }}</dd>
            </div>
          </dl>

          <div>
            <p class="text-xs font-medium uppercase tracking-wide text-muted">Description</p>
            <p class="mt-2 whitespace-pre-line rounded-lg border border-default bg-elevated/50 px-4 py-3.5 text-sm leading-7 text-toned">{{ ticket.description }}</p>
          </div>

          <div v-if="ticket.images?.length">
            <p class="text-xs font-medium uppercase tracking-wide text-muted">Photos <span class="normal-case tracking-normal">· {{ ticket.images.length }}</span></p>
            <div class="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <button v-for="(image, index) in ticket.images" :key="image.id" type="button" class="group overflow-hidden rounded-lg ring-1 ring-default transition hover:ring-primary focus-visible:outline-2 focus-visible:outline-primary" :aria-label="`View photo ${index + 1} of ${ticket.images.length}`" @click="viewPhoto(index)">
                <img :src="`${baseURL}${image.url}`" :alt="image.name || 'Ticket photo'" class="aspect-[4/3] w-full object-cover transition-transform group-hover:scale-105" />
              </button>
            </div>
          </div>

          <div v-if="ticket.followUps?.length">
            <p class="text-xs font-medium uppercase tracking-wide text-muted">Follow-ups</p>
            <ul class="mt-2 space-y-3">
              <li v-for="(followUp, index) in ticket.followUps" :key="index" class="rounded-lg border border-default bg-muted/20 px-4 py-3">
                <div class="flex items-center justify-between gap-2">
                  <p class="flex items-center gap-1.5 text-xs font-semibold text-highlighted"><UIcon name="i-lucide-message-square-text" class="size-3.5 text-primary" />{{ followUp.author }}</p>
                  <span class="shrink-0 text-xs text-muted">{{ formatTicketDateTime(followUp.createdAt) }}</span>
                </div>
                <p class="mt-1.5 text-sm leading-relaxed text-toned">{{ followUp.message }}</p>
              </li>
            </ul>
          </div>
        </section>

        <!-- OAS handling: the only part that can change. -->
        <section aria-labelledby="ticket-handling-heading" class="space-y-6 border-t border-default p-5 sm:p-8 lg:border-t-0">
          <h3 id="ticket-handling-heading" class="flex items-center gap-2 text-base font-semibold text-highlighted">
            <UIcon name="i-lucide-clipboard-check" class="size-5 text-primary" />OAS handling
          </h3>

          <UAlert v-if="ticket.archivedAt" color="neutral" variant="subtle" icon="i-lucide-archive" :title="`Archived ${formatTicketDateTime(ticket.archivedAt)}`" description="Restore the ticket from the Archived tab to change it." />

          <div class="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-default bg-elevated/50 px-4 py-4">
            <div class="min-w-0 space-y-1.5">
              <UBadge :color="maintenanceStatusColor(ticket.status)" variant="subtle" size="lg">{{ ticket.status }}</UBadge>
              <p class="text-xs text-muted">
                {{ ticket.status === 'Completed' ? `Completed ${formatTicketDateTime(ticket.completedAt)}` : openDuration(ticket.createdAt) }}
              </p>
            </div>
            <template v-if="!ticket.archivedAt"><UButton v-if="ticket.status === 'Pending'" label="Start work" icon="i-lucide-play" :loading="saving === 'status'" :disabled="locked" @click="emit('start', ticket)" />
            <UButton v-else-if="ticket.status === 'In Progress'" label="Mark completed" icon="i-lucide-check-check" color="success" variant="subtle" :disabled="locked" @click="emit('complete', ticket)" />
            <UButton v-else label="Reopen" icon="i-lucide-rotate-ccw" color="neutral" variant="outline" :disabled="locked" @click="emit('reopen', ticket)" /></template>
          </div>

          <div class="grid gap-5 sm:grid-cols-2">
            <UFormField label="Priority">
              <USelect :model-value="ticket.priority" :items="MAINTENANCE_PRIORITIES" :loading="saving === 'priority'" :disabled="locked" class="w-full" @update:model-value="value => emit('change', ticket!, { priority: value as MaintenancePriority })" />
            </UFormField>
            <UFormField label="Category" hint="Only to correct it">
              <USelect :model-value="ticket.category" :items="MAINTENANCE_CATEGORIES" :loading="saving === 'category'" :disabled="locked" class="w-full" @update:model-value="value => emit('change', ticket!, { category: value as MaintenanceCategory })" />
            </UFormField>
          </div>

          <UFormField label="Action notes" description="What was done, or what is planned, to resolve the issue.">
            <UTextarea v-model="notesDraft" :rows="4" autoresize :maxrows="10" :disabled="locked" class="w-full" />
            <div class="mt-3 flex flex-wrap items-center justify-end gap-2">
              <p v-if="notesBlocked" class="mr-auto text-xs text-error">A completed ticket needs action notes.</p>
              <UButton v-if="notesDirty" label="Discard" color="neutral" variant="ghost" size="sm" :disabled="locked" @click="notesDraft = ticket.actionNotes ?? ''" />
              <UButton label="Save notes" size="sm" variant="subtle" :disabled="!notesDirty || notesBlocked || locked" :loading="saving === 'actionNotes'" @click="emit('change', ticket, { actionNotes: notesDraft.trim() || null })" />
            </div>
          </UFormField>

          <div class="border-t border-default pt-6">
            <h4 class="mb-4 flex items-center gap-2 text-sm font-semibold text-highlighted"><UIcon name="i-lucide-history" class="size-4 text-muted" />Activity</h4>
            <MaintenanceActivityTimeline :ticket-id="ticketKey(ticket)" :reporter-id="ticket.reporter?.id" :reload-key="reloadKey" size="sm" />
          </div>
        </section>
      </div>

      <MaintenancePhotoViewer v-if="ticket?.images?.length" v-model:open="viewerOpen" v-model:index="viewerIndex" :photos="ticket.images" />
    </template>
  </UModal>
</template>
