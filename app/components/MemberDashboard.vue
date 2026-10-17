<script setup lang="ts">
const auth = useAuth()
const roleTitle = computed(() => auth.isStudent.value ? 'Student dashboard' : auth.isAspiringTenant.value ? 'Aspiring tenant dashboard' : 'Tenant dashboard')
const actions = computed(() => [
  { label: 'Campus map', to: '/campus-map', icon: 'i-lucide-map-pinned', description: 'Explore campus buildings and listed spaces.' },
  ...(auth.isCurrentTenant.value ? [
    { label: 'My tenancy', to: '/tenancy', icon: 'i-lucide-key-round', description: 'Review your contracts and renewal information.' },
    { label: 'Bills', to: '/bills', icon: 'i-lucide-receipt', description: 'Review billing notices and submit official receipts.' },
    { label: 'Maintenance', to: '/maintenance', icon: 'i-lucide-wrench', description: 'Report an issue and track your requests.' }
  ] : [
    { label: 'Rentable spaces', to: '/properties', icon: 'i-lucide-store', description: auth.isStudent.value ? 'View listed occupied campus spaces.' : 'Browse spaces and rental information.' },
    auth.isAspiringTenant.value
      ? { label: 'Rental applications', to: '/rental-applications', icon: 'i-lucide-clipboard-list', description: 'Apply for a space and track your applications.' }
      : { label: 'Student feedback', to: '/feedback', icon: 'i-lucide-message-square-text', description: 'Share feedback about campus stall services.' }
  ])
])
const money = (value: number | string) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(value))
const date = (value?: string) => value ? new Date(value).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'Asia/Manila' }) : ''
const recentQuery = { sort: 'createdAt:desc', 'pagination[pageSize]': 3, 'populate[propertySpace]': true }
</script>

<template>
  <AppPageHeader :title="roleTitle" eyebrow="Your overview" :description="`Welcome, ${auth.displayName.value}. Your campus services and recent updates in one place.`">
    <template #actions><UButton to="/campus-map" label="Open campus map" icon="i-lucide-map-pinned" data-prominent="true" /></template>
  </AppPageHeader>

  <section aria-label="Quick actions" class="mb-6 grid gap-3 sm:grid-cols-2" :class="auth.isCurrentTenant.value ? 'xl:grid-cols-4' : 'xl:grid-cols-3'">
    <NuxtLink v-for="action in actions" :key="action.to" :to="action.to" class="rounded-xl border border-default bg-default p-5 transition-colors hover:border-primary/50 hover:bg-elevated focus-visible:outline-2 focus-visible:outline-primary">
      <UIcon :name="action.icon" class="mb-3 size-5 text-primary" aria-hidden="true" />
      <h2 class="font-semibold text-highlighted">{{ action.label }}</h2>
      <p class="mt-1 text-sm text-muted">{{ action.description }}</p>
    </NuxtLink>
  </section>

  <div class="grid items-start gap-6 xl:grid-cols-2">
    <DashboardSection v-if="!auth.isCurrentTenant.value" title="Property overview" endpoint="/api/dashboard/property-summary" resource="properties" to="/properties">
      <template #default="{ data }">
        <dl class="grid grid-cols-2 gap-4" :class="!auth.isStudent.value && 'sm:grid-cols-3'">
          <div><dt class="text-sm text-muted">Listed spaces</dt><dd class="mt-1 text-2xl font-semibold text-highlighted tabular-nums">{{ data.total }}</dd></div>
          <div><dt class="text-sm text-muted">Occupied spaces</dt><dd class="mt-1 text-2xl font-semibold text-highlighted tabular-nums">{{ data.occupied }}</dd></div>
          <div v-if="!auth.isStudent.value"><dt class="text-sm text-muted">Available spaces</dt><dd class="mt-1 text-2xl font-semibold text-highlighted tabular-nums">{{ data.vacant }}</dd></div>
        </dl>
        <p class="mt-4 text-xs text-muted">Property spaces permitted for your account. These totals describe spaces, not buildings.</p>
      </template>
    </DashboardSection>

    <DashboardSection v-if="auth.isAspiringTenant.value" title="Rental applications" endpoint="/api/rental-applications" resource="applications" to="/rental-applications" :query="recentQuery">
      <template #default="{ data }">
        <p class="mb-4 text-sm text-muted"><strong class="text-2xl font-semibold text-highlighted tabular-nums">{{ data.meta?.pagination?.total ?? '—' }}</strong> applications in total</p>
        <ul v-if="data.data?.length" class="divide-y divide-default">
          <li v-for="item in data.data" :key="item.documentId ?? item.id" class="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0">
            <div class="min-w-0"><p class="font-medium text-highlighted">{{ item.propertySpace?.name || 'Rental application' }}</p><p class="text-xs text-muted">{{ date(item.createdAt) }}</p></div>
            <UBadge color="neutral" variant="subtle">{{ item.status }}</UBadge>
          </li>
        </ul>
        <p v-else class="text-sm text-muted">You have no rental applications yet. Browse rentable spaces to get started.</p>
      </template>
    </DashboardSection>

    <DashboardSection v-if="auth.isCurrentTenant.value" title="Billing overview" endpoint="/api/dashboard/billing-summary" resource="billing" to="/bills">
      <template #default="{ data }">
        <dl class="grid gap-4 sm:grid-cols-2">
          <div><dt class="text-sm text-muted">Outstanding balance</dt><dd class="mt-1 text-2xl font-semibold text-highlighted tabular-nums">{{ money(data.outstanding) }}</dd></div>
          <div><dt class="text-sm text-muted">Overdue bills</dt><dd class="mt-1 text-2xl font-semibold text-highlighted tabular-nums">{{ data.overdueBills }}</dd></div>
          <div><dt class="text-sm text-muted">Awaiting verification</dt><dd class="mt-1 text-lg font-semibold text-highlighted tabular-nums">{{ data.forVerification }}</dd></div>
          <div><dt class="text-sm text-muted">Total bills</dt><dd class="mt-1 text-lg font-semibold text-highlighted tabular-nums">{{ data.total }}</dd></div>
        </dl>
      </template>
    </DashboardSection>

    <DashboardSection v-if="auth.isCurrentTenant.value" title="Active tenancies" endpoint="/api/tenancies" resource="tenancies" to="/tenancy" :query="{ 'filters[status][$eq]': 'Active', 'pagination[pageSize]': 1, 'populate[propertySpace]': true, sort: 'createdAt:desc' }">
      <template #default="{ data }">
        <p class="text-2xl font-semibold text-highlighted tabular-nums">{{ data.meta?.pagination?.total ?? '—' }}</p>
        <p class="mt-1 text-sm text-muted">Active tenancy contracts</p>
        <div v-if="data.data?.length" class="mt-4 rounded-lg bg-muted/40 p-3">
          <p class="font-medium text-highlighted">{{ data.data[0].propertySpace?.name || 'Current tenancy' }}</p>
          <p v-if="data.data[0].endDate" class="mt-1 text-sm text-muted">Ends {{ date(data.data[0].endDate + 'T00:00:00+08:00') }}</p>
        </div>
        <p v-else class="mt-4 text-sm text-muted">No active tenancy is recorded for your account.</p>
      </template>
    </DashboardSection>

    <DashboardSection v-if="auth.isCurrentTenant.value" title="Recent maintenance requests" endpoint="/api/maintenance-tickets" resource="maintenance" to="/maintenance" :query="recentQuery">
      <template #default="{ data }">
        <ul v-if="data.data?.length" class="divide-y divide-default">
          <li v-for="item in data.data" :key="item.documentId ?? item.id" class="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0">
            <div class="min-w-0"><p class="font-medium text-highlighted">{{ item.category || 'Maintenance request' }}</p><p class="text-sm text-muted">{{ item.propertySpace?.name }}</p><p class="text-xs text-muted">{{ date(item.createdAt) }}</p></div>
            <UBadge color="neutral" variant="subtle">{{ item.status }}</UBadge>
          </li>
        </ul>
        <p v-else class="text-sm text-muted">You have no maintenance requests yet.</p>
      </template>
    </DashboardSection>

    <DashboardSection title="Latest announcements" endpoint="/api/announcements" resource="announcements" to="/announcements" :query="{ sort: 'publishedAt:desc', 'pagination[pageSize]': 3 }">
      <template #default="{ data }">
        <ul v-if="data.data?.length" class="divide-y divide-default">
          <li v-for="item in data.data" :key="item.documentId ?? item.id" class="py-3 first:pt-0 last:pb-0">
            <NuxtLink to="/announcements" class="font-medium text-highlighted hover:text-primary hover:underline">{{ item.title }}</NuxtLink>
            <p class="mt-1 text-xs text-muted">{{ date(item.publishedAt ?? item.createdAt) }}</p>
          </li>
        </ul>
        <p v-else class="text-sm text-muted">No announcements are available right now.</p>
      </template>
    </DashboardSection>
  </div>
</template>
