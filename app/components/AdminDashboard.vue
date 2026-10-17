<script setup lang="ts">
type DirectoryUser = {
  id: number
  username: string
  email: string
  confirmed?: boolean
  blocked?: boolean
  createdAt?: string
  role?: { documentId?: string; name?: string; type?: string } | null
}

type RoleInfo = {
  type: string
  name: string
  description?: string
  permissions: string[]
}

type AuditEntry = {
  id: number
  action: string
  entityType?: string | null
  entityId?: string | null
  entityLabel?: string | null
  description?: string | null
  actorUsername?: string | null
  actorRole?: string | null
  createdAt: string
}

type AuditListResponse = { data: AuditEntry[]; meta: { pagination: { total: number } } }

type HealthResponse = {
  uptime: number
  startedAt: string
  memory: { total: number; free: number; used: number }
  disk: { ok: boolean; total?: number; free?: number; used?: number }
  database: { ok: boolean; latency?: number | null; client?: string | null; error?: string }
  logins: { failed24h: number; failed7d: number; failedTotal: number; recentFailed: AuditEntry[]; recentLogins: AuditEntry[] }
  errors: { total: number; recent: AuditEntry[] }
  now: string
}

const auth = useAuth()
const { baseURL } = useStrapi()
const headers = {}

const { data: userDataResponse, refresh: refreshUsers, status: usersStatus, error: userDataError } = await useFetch<any>('/api/dashboard/admin-summary', { baseURL, headers })
const { data: userData } = useRequestPresentation(userDataResponse, usersStatus)

const { data: roleDataResponse, refresh: refreshRoles, status: roleDataStatus, error: roleDataError } = await useFetch<RoleInfo[]>('/api/roles', { baseURL, headers })
const { data: roleData } = useRequestPresentation(roleDataResponse, roleDataStatus)

const { data: auditDataResponse, refresh: refreshAudits, status: auditDataStatus, error: auditDataError } = await useFetch<AuditListResponse>('/api/audit-logs', {
  baseURL,
  headers,
  query: { sort: 'createdAt:desc', 'pagination[pageSize]': 8 }
})
const { data: auditData } = useRequestPresentation(auditDataResponse, auditDataStatus)

const { data: healthDataResponse, refresh: refreshHealth, status: healthDataStatus, error: healthDataError } = await useFetch<HealthResponse>('/api/system/health', { baseURL, headers })
const { data: healthData } = useRequestPresentation(healthDataResponse, healthDataStatus)


const refreshing = ref(false)
const refreshAll = async () => {
  refreshing.value = true
  await Promise.all([refreshUsers(), refreshRoles(), refreshAudits(), refreshHealth()])
  refreshing.value = false
}

const users = computed(() => [])
const userCount = computed(() => userData.value?.users?.total ?? 0)
const blockedCount = computed(() => userData.value?.users?.blocked ?? 0)
const roleCount = computed(() => roleData.value?.length ?? 0)
const auditCount = computed(() => auditData.value?.meta?.pagination?.total ?? 0)
const recentAudits = computed(() => auditData.value?.data ?? [])

const health = computed(() => healthData.value)

const failedLogins24h = computed(() => health.value?.logins?.failed24h ?? 0)
const recentLogins = computed(() => health.value?.logins?.recentLogins ?? [])
const serverErrors = computed(() => health.value?.errors?.total ?? 0)

const usersByRole = computed(() => {
  const buckets: { type: string; label: string; count: number }[] = [
    { type: 'student', label: 'Students', count: 0 },
    { type: 'aspiring-tenant', label: 'Aspiring tenants', count: 0 },
    { type: 'current-tenant', label: 'Current tenants', count: 0 },
    { type: 'oas', label: 'OAS', count: 0 },
    { type: 'admin', label: 'Administrators', count: 0 }
  ]
  for (const bucket of buckets) bucket.count = userData.value?.roleCounts?.[bucket.type] ?? 0
  return buckets
})

const cards = computed(() => [
  { label: 'Registered users', value: userCount.value, icon: 'i-lucide-users-round', to: '/admin/users', accent: 'bg-maroon-100 text-maroon-800' },
  { label: 'Managed roles', value: roleCount.value, icon: 'i-lucide-shield-check', to: '/admin/roles', accent: 'bg-gold-100 text-gold-700' },
  { label: 'Audit entries', value: auditCount.value, icon: 'i-lucide-scroll-text', to: '/admin/audit-logs', accent: 'bg-gold-50 text-gold-700' },
  { label: 'Failed logins (24h)', value: failedLogins24h.value, icon: 'i-lucide-shield-alert', to: '/admin/system-monitoring', accent: 'bg-maroon-50 text-maroon-800' }
])

const dashboardNow = useState('dashboard-now', () => new Date().toISOString())
const summaryCards = computed(() => cards.value.filter((_, index) => index !== 3))
const summaryActions: Record<string, string> = { 'Registered users': 'Manage users', 'Managed roles': 'Manage roles', 'Audit entries': 'View audit history' }

const formatDate = (value?: string) => value
  ? new Date(value).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  : ''

const formatUptime = (seconds?: number) => {
  if (seconds == null) return '—'
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return days > 0 ? `${days}d ${hours}h ${minutes}m` : hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`
}

const formatBytes = (bytes?: number) => {
  if (bytes == null) return '—'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`
}

const actionLabel = (action: string) => action.replace(/-/g, ' ')
const dashboardRefreshing = computed(() => usersStatus.value === 'pending' || roleDataStatus.value === 'pending' || auditDataStatus.value === 'pending' || healthDataStatus.value === 'pending')
const dashboard = useDashboardPresentation([usersStatus, roleDataStatus, auditDataStatus, healthDataStatus])
const dashboardRefreshFailed = computed(() => !!userDataError.value || !!roleDataError.value || !!auditDataError.value || !!healthDataError.value)
</script>

<template>
  <div class="admin-dashboard">
    <AppPageHeader eyebrow="Administration">
      <template #title>System Administration</template>
      <template #description>Manage system access, monitor platform activity, and maintain operational reliability.</template>
      <template #actions><UButton label="Refresh" icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="refreshing" @click="refreshAll" /></template>
    </AppPageHeader>
    <AppRefreshState :refreshing="dashboard.loaded.value && dashboardRefreshing" :failed="dashboard.loaded.value && dashboardRefreshFailed" @retry="refreshAll" />
    <AppLoadingState v-if="dashboard.loading.value" :count="4" height="h-36" />
    <UAlert v-else-if="dashboard.failed.value" color="error" icon="i-lucide-triangle-alert" title="Unable to load the dashboard" description="Some records are unavailable. Retry to load the overview."><template #actions><UButton label="Retry" color="neutral" variant="outline" @click="refreshAll" /></template></UAlert>
    <template v-else>
      <UAlert v-if="userData?.security?.staffEnrollmentPending || userData?.security?.lockedAccounts" class="mb-6" color="warning" title="Account security needs attention" :description="`${userData?.security?.staffEnrollmentPending ?? 0} staff accounts awaiting authenticator enrollment; ${userData?.security?.lockedAccounts ?? 0} accounts temporarily locked.`"><template #actions><UButton to="/admin/users" label="Review accounts" color="neutral" variant="outline" /></template></UAlert>

    <section aria-labelledby="admin-status-title">
      <h2 id="admin-status-title" class="mb-3 text-base font-semibold text-highlighted">System Health and Access</h2>
      <div class="grid gap-3 lg:grid-cols-2">
        <UCard :ui="{ body: 'p-5' }">
          <div class="flex items-start gap-3">
            <span class="grid size-9 shrink-0 place-items-center rounded-lg" :class="health?.database?.ok ? 'bg-success/10 text-success' : 'bg-error/10 text-error'"><UIcon :name="health?.database?.ok ? 'i-lucide-check-circle-2' : 'i-lucide-triangle-alert'" class="size-5" aria-hidden="true" /></span>
            <div class="min-w-0 flex-1">
              <h3 class="text-sm font-medium text-muted">Platform availability</h3>
              <p class="mt-1 text-lg font-semibold text-highlighted">{{ health?.database?.ok ? 'Database connected' : 'Database unavailable' }}</p>
              <p class="mt-1 text-sm text-muted">{{ health?.database?.ok ? 'The latest database connection check succeeded.' : 'Action needed: review the connection in system monitoring.' }}</p>
              <UButton class="mt-3" to="/admin/system-monitoring" label="View system health" icon="i-lucide-activity" color="neutral" variant="outline" size="sm" />
            </div>
          </div>
        </UCard>
        <DashboardMetricCard v-if="failedLogins24h > 0" label="Failed logins in 24 hours" :value="failedLogins24h" icon="i-lucide-shield-alert" to="/admin/system-monitoring" sub="Recent sign-in attempts need review." action="Review sign-in activity" tone="warning" />
        <UCard v-else :ui="{ body: 'p-5' }">
          <div class="flex items-start gap-3">
            <span class="grid size-9 shrink-0 place-items-center rounded-lg bg-success/10 text-success"><UIcon name="i-lucide-shield-check" class="size-5" aria-hidden="true" /></span>
            <div><h3 class="text-sm font-medium text-muted">Sign-in activity</h3><p class="mt-1 text-lg font-semibold text-highlighted">No failed logins in 24 hours</p><p class="mt-1 text-sm text-muted">0 failed attempts in the latest reporting window.</p><NuxtLink to="/admin/system-monitoring" class="mt-3 inline-flex items-center gap-1 text-sm font-medium text-toned hover:underline">View sign-in activity<UIcon name="i-lucide-arrow-right" class="size-3.5" aria-hidden="true" /></NuxtLink></div>
          </div>
        </UCard>
      </div>
    </section>
    <section class="mt-8" aria-labelledby="admin-overview-title"><h2 id="admin-overview-title" class="mb-3 text-base font-semibold text-highlighted">Platform overview</h2><div class="grid gap-3 sm:grid-cols-3">
      <AppMotionReveal v-for="(card, index) in summaryCards" :key="card.to + card.label" :index="index" >
        <DashboardMetricCard v-bind="card" :action="summaryActions[card.label] ?? 'Open workspace'" />
      </AppMotionReveal>
    </div></section>
    <section class="mt-8" aria-labelledby="admin-reports-title">
    <h2 id="admin-reports-title" class="mb-3 text-base font-semibold text-highlighted">Reports and recent activity</h2>

    <div class="grid gap-4 lg:grid-cols-2">
      <UCard :ui="{ body: 'p-5' }">
        <template #header>
          <div class="flex items-center justify-between">
            <h3 class="text-base font-semibold text-highlighted">Users by role</h3>
            <NuxtLink to="/admin/users" aria-label="Manage users" class="inline-flex items-center gap-1 text-sm font-medium text-toned hover:underline">Manage<UIcon name="i-lucide-arrow-right" class="size-3.5" aria-hidden="true" /></NuxtLink>
          </div>
        </template>
        <dl class="space-y-4">
          <div v-for="bucket in usersByRole" :key="bucket.type" class="flex items-center justify-between text-sm">
            <dt class="flex items-center gap-2 text-muted">
              {{ bucket.label }}
            </dt>
            <dd class="font-semibold text-highlighted">{{ bucket.count }}</dd>
          </div>
          <div class="flex items-center justify-between border-t border-default pt-3 text-sm">
            <dt class="flex items-center gap-2 text-muted"><UIcon name="i-lucide-user-x" class="size-4" aria-hidden="true" />Blocked accounts</dt>
            <dd class="font-semibold text-highlighted">{{ blockedCount }}</dd>
          </div>
        </dl>
      </UCard>

      <UCard :ui="{ body: 'p-5' }">
        <template #header>
          <div class="flex items-center justify-between">
            <h3 class="text-base font-semibold text-highlighted">System monitoring</h3>
            <NuxtLink to="/admin/system-monitoring" aria-label="Open system monitoring" class="inline-flex items-center gap-1 text-sm font-medium text-toned hover:underline">Monitor<UIcon name="i-lucide-arrow-right" class="size-3.5" aria-hidden="true" /></NuxtLink>
          </div>
        </template>
        <dl class="space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-2 text-sm">
            <dt class="text-muted">Database</dt>
            <dd>
              <span v-if="health?.database?.ok" class="inline-flex flex-wrap items-center gap-1.5 font-medium text-success">
                <UIcon name="i-lucide-check-circle-2" class="size-4" />Connected
                <span v-if="health?.database?.latency != null" class="text-xs text-muted">({{ health.database.latency }} ms)</span>
              </span>
              <span v-else class="inline-flex items-center gap-1.5 font-medium text-error">
                <UIcon name="i-lucide-triangle-alert" class="size-4" />Unavailable
              </span>
            </dd>
          </div>
          <div class="flex flex-wrap items-center justify-between gap-2 text-sm">
            <dt class="text-muted">Uptime</dt>
            <dd class="font-medium text-highlighted">{{ formatUptime(health?.uptime) }}</dd>
          </div>
          <div class="flex flex-wrap items-center justify-between gap-2 text-sm">
            <dt class="text-muted">Memory</dt>
            <dd class="font-medium text-highlighted">{{ formatBytes(health?.memory?.used) }} / {{ formatBytes(health?.memory?.total) }}</dd>
          </div>
          <div class="flex flex-wrap items-center justify-between gap-2 text-sm">
            <dt class="text-muted">Disk free</dt>
            <dd class="font-medium text-highlighted">{{ health?.disk?.ok ? formatBytes(health?.disk?.free) : '—' }}</dd>
          </div>
          <div class="flex flex-wrap items-start justify-between gap-2 border-t border-default pt-4 text-sm">
            <dt class="text-muted">Recorded server errors<span class="mt-1 block text-xs">Historical total</span></dt>
            <dd class="font-medium text-highlighted">{{ serverErrors }}</dd>
          </div>
        </dl>
      </UCard>

      <UCard class="lg:col-span-2" :ui="{ body: 'p-0' }">
        <template #header>
          <div class="flex items-center justify-between">
            <h3 class="text-base font-semibold text-highlighted">Recent activity</h3>
            <NuxtLink to="/admin/audit-logs" aria-label="View all audit entries" class="inline-flex items-center gap-1 text-sm font-medium text-toned hover:underline">View all<UIcon name="i-lucide-arrow-right" class="size-3.5" aria-hidden="true" /></NuxtLink>
          </div>
        </template>
        <ul v-if="recentAudits.length" class="divide-y divide-default">
          <li v-for="entry in recentAudits" :key="entry.id" class="px-5 py-4">
            <div class="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
              <p class="text-sm font-semibold capitalize text-highlighted">{{ actionLabel(entry.action) }}</p>
              <time :datetime="entry.createdAt" class="text-xs text-muted">{{ formatDate(entry.createdAt) }}</time>
            </div>
            <p class="mt-2 text-sm leading-6 text-toned">{{ entry.description || entry.entityLabel || '—' }}</p>
            <p v-if="entry.actorUsername" class="mt-1 text-xs text-muted">{{ entry.actorUsername }}<span v-if="entry.actorRole"> · {{ entry.actorRole }}</span></p>
          </li>
        </ul>
        <p v-else class="px-5 py-6 text-sm text-muted">No activity recorded yet.</p>
      </UCard>
    </div>

    <UCard v-if="recentLogins.length" class="mt-4">
      <template #header>
        <div class="flex items-center justify-between">
          <h3 class="text-base font-semibold text-highlighted">Latest staff sign-ins</h3>
          <NuxtLink to="/admin/audit-logs" aria-label="View sign-in audit log" class="inline-flex items-center gap-1 text-sm font-medium text-toned hover:underline">Audit log<UIcon name="i-lucide-arrow-right" class="size-3.5" aria-hidden="true" /></NuxtLink>
        </div>
      </template>
      <ul class="divide-y divide-default">
        <li v-for="entry in recentLogins" :key="entry.id" class="flex flex-wrap items-start justify-between gap-3 py-4">
          <div class="flex min-w-0 items-center gap-3">
            <span class="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted">
              <UIcon name="i-lucide-user-round-check" class="size-4" />
            </span>
            <div class="min-w-0">
              <p class="text-sm font-medium text-highlighted">{{ entry.entityLabel || entry.actorUsername || '—' }}</p>
              <p class="mt-1 text-sm text-muted">{{ entry.description }}</p>
            </div>
          </div>
          <time :datetime="entry.createdAt" class="text-xs text-muted">{{ formatDate(entry.createdAt) }}</time>
        </li>
      </ul>
    </UCard>
    </section>
    </template>
  </div>
</template>

<style scoped>
.admin-dashboard { --ui-success: var(--color-green-700); --ui-warning: var(--color-amber-700); --ui-error: var(--color-red-700); }
:global(.dark) .admin-dashboard { --ui-success: var(--color-green-400); --ui-warning: var(--color-amber-300); --ui-error: var(--color-red-400); }
</style>
