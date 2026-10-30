<script setup lang="ts">
definePageMeta({
  middleware: ['auth', 'role'],
  roles: ['admin']
})

useHead({ title: 'Audit Logs | iMapSU' })

type AuditEntry = {
  id: number
  documentId?: string
  action: string
  entityType?: string | null
  entityId?: string | null
  entityLabel?: string | null
  description?: string | null
  actorId?: number | null
  actorUsername?: string | null
  actorRole?: string | null
  createdAt: string
}

type AuditListResponse = { data: AuditEntry[]; meta: { pagination: { total: number } } }

const ACTIONS = [
  'created',
  'updated',
  'deleted',
  'account-created',
  'account-updated',
  'account-activated',
  'account-deactivated',
  'account-deleted',
  'password-reset',
  'privacy-consent',
  'role-changed',
  'permissions-updated',
  'settings-updated',
  'backup-created',
  'backup-restored',
  'backup-deleted',
  'login-success',
  'login-failed',
  'system-error'
]

const auth = useAuth()
const { baseURL } = useStrapi()
const headers = {}

const search = ref('')
const actionFilter = ref<string>('all')
const recordsPage = useRecordPage(["description","entityLabel","actorUsername","entityType"], { action: { ref: actionFilter, field: 'action' } }, search)
const { data: responseData, status, error, refresh } = await useFetch<AuditListResponse>('/api/audit-logs', {
  baseURL,
  headers,
  query: computed(() => ({ sort: 'createdAt:desc', ...recordsPage.query.value }))
})
const { data, hasLoaded, isInitialLoading, isRefreshing, isInitialError } = useRequestPresentation(responseData, status)


const entries = computed(() => data.value?.data ?? [])
const total = computed(() => data.value?.meta?.pagination?.total ?? entries.value.length)


const filtered = computed(() => {
  const term = search.value.trim().toLowerCase()
  return entries.value.filter(entry => {
    if (actionFilter.value !== 'all' && entry.action !== actionFilter.value) return false
    if (!term) return true
    const haystack = [entry.description, entry.entityLabel, entry.actorUsername, entry.entityType]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return haystack.includes(term)
  })
})

const actionColor = (action: string) => {
  if (action === 'system-error' || action === 'login-failed') return 'error'
  if (action === 'login-success' || action === 'account-activated') return 'success'
  if (action === 'deleted' || action === 'account-deleted' || action === 'account-deactivated') return 'warning'
  return 'neutral'
}

const actionLabel = (action: string) => action.replace(/-/g, ' ')

const formatDate = (value?: string) => value
  ? new Date(value).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  : ''
const columns = [
  { key: 'action', label: 'Action', value: (entry: AuditEntry) => actionLabel(entry.action), badge: true, color: (entry: AuditEntry) => actionColor(entry.action) },
  { key: 'description', label: 'Description', value: (entry: AuditEntry) => entry.description || '—' },
  { key: 'entity', label: 'Entity', value: (entry: AuditEntry) => entry.entityLabel || entry.entityType || '—' },
  { key: 'actor', label: 'Actor', value: (entry: AuditEntry) => entry.actorUsername || 'system' },
  { key: 'role', label: 'Role', value: (entry: AuditEntry) => entry.actorRole || '—' },
  { key: 'date', label: 'Date', value: (entry: AuditEntry) => formatDate(entry.createdAt) }
]
</script>

<template>
  <main class="imapsu-page imapsu-page--admin">
    <AppPageHeader>
      <template #eyebrow>Administration</template>
      <template #title>Audit Logs</template>
      <template #description><p class="mt-2 max-w-xl text-muted">
          Review recorded system activity and administrative actions. Audit records cannot be edited or deleted.
        </p></template>
      <template #actions><div class="flex items-center gap-2">
        <UButton label="Refresh" icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="status === 'pending'" @click="refresh" />
      </div></template>
    </AppPageHeader>

    <div class="mb-5 flex flex-col gap-3 sm:flex-row">
      <UInput v-model="search" aria-label="Search audit logs" icon="i-lucide-search" placeholder="Search description, entity or actor…" class="w-full sm:max-w-sm" />
      <USelect v-model="actionFilter" aria-label="Filter by action" :items="[{ label: 'All actions', value: 'all' }, ...ACTIONS.map(action => ({ label: actionLabel(action), value: action }))]" class="w-full sm:w-56" />
      <UButton v-if="search.trim() || actionFilter !== 'all'" label="Clear filters" color="neutral" variant="ghost" @click="search = ''; actionFilter = 'all'" />
    </div>

    <AppRefreshState :refreshing="isRefreshing" :failed="hasLoaded && !!error" @retry="refresh" />
    <AppLoadingState v-if="isInitialLoading" :count="8" height="h-14" />

    <UAlert v-else-if="isInitialError" color="error" icon="i-lucide-triangle-alert" title="Unable to load audit logs" description="Please try again." ><template #actions><UButton label="Retry" color="neutral" variant="outline" @click="refresh" /></template></UAlert>

    <UEmpty v-else-if="entries.length === 0" icon="i-lucide-scroll-text" title="No audit entries yet" description="Administrative activity will appear here once recorded." />

    <UEmpty v-else-if="filtered.length === 0" icon="i-lucide-list-filter" title="No matching audit entries" description="Try another search or clear the filters above." />

    <UCard v-else :ui="{ body: 'p-0' }">
      <template #header>
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-semibold text-highlighted">Recent entries</h2>
          <span class="text-sm text-muted">{{ filtered.length }} of {{ total }} shown</span>
        </div>
      </template>
      <AppRecordTable :items="filtered" :columns="columns" :item-key="entry => entry.id" caption="Administrative audit entries" :expandable="false">
        <template #details="{ item: entry }"><article class="space-y-3 border-b border-default px-5 py-4">
          <UBadge :color="actionColor(entry.action)" variant="subtle" class="capitalize">{{ actionLabel(entry.action) }}</UBadge>
          <div class="min-w-0 flex-1">
            <p class="text-sm text-highlighted">{{ entry.description || '—' }}</p>
            <p class="mt-0.5 text-xs text-muted">
              <span v-if="entry.entityLabel">{{ entry.entityLabel }}</span>
              <span v-if="entry.entityType" class="text-muted/70"> · {{ entry.entityType }}</span>
            </p>
          </div>
          <div>
            <p class="text-sm text-highlighted">{{ entry.actorUsername || 'system' }}</p>
            <p class="text-xs text-muted">{{ entry.actorRole || '—' }}</p>
          </div>
          <p class="text-xs text-muted">{{ formatDate(entry.createdAt) }}</p>
        </article></template>
      </AppRecordTable>
    </UCard>
    <AppRecordPagination :state="recordsPage" :response="data" :pending="status === 'pending'" />
  </main>
</template>
