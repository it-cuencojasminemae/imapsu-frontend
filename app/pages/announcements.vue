<script setup lang="ts">
type Announcement = {
  id: number | string
  documentId?: string
  title: string
  body: string
  audience: 'Everyone' | 'Students' | 'Tenants'
  pinned?: boolean
  publishedAt?: string
  publishAt?: string
  expireAt?: string
  createdAt?: string
}

type Acknowledgment = {
  id: number | string
  documentId?: string
  acknowledgedAt?: string
  announcement?: { documentId?: string } | null
}

type AnnouncementResponse = { data: Announcement[] }

useHead({ title: 'Announcements | iMapSU' })

const auth = useAuth()
const toast = useToast()
const { baseURL, authHeaders, $api, getErrorMessage } = useStrapi()
const recordsPage = useRecordPage([], {  })
const { data: responseData, status, error, refresh } = await useFetch<AnnouncementResponse>('/api/announcements', {
  baseURL,
  headers: authHeaders,
  query: computed(() => ({
    sort: 'pinned:desc,publishedAt:desc', ...recordsPage.query.value }))
})
const { data, hasLoaded, isInitialLoading, isRefreshing, isInitialError } = useRequestPresentation(responseData, status)


const announcements = computed(() => data.value?.data ?? [])

const acknowledgedDocIds = ref<Set<string>>(new Set())
const acksLoaded = ref(false)
const acking = ref<string | null>(null)

const loadAcks = async () => {
  if (!auth.isAuthenticated.value) return
  try {
    const response = await $api<{ data: Acknowledgment[] }>('/api/announcement-acknowledgments', {
      query: { 'populate[announcement]': true, 'pagination[pageSize]': 100, ...Object.fromEntries(announcements.value.map(item => item.documentId).filter(Boolean).map((id,index) => [`filters[announcement][documentId][$in][${index}]`, id])) }
    })
    acksLoaded.value = true
    acknowledgedDocIds.value = new Set(
      (response?.data ?? [])
        .map(ack => ack.announcement?.documentId)
        .filter((docId): docId is string => Boolean(docId))
    )
  } catch {
    acksLoaded.value = false
  } finally {
    // Retain the last successful acknowledgments when refresh fails.
  }
}

await loadAcks()
watch(() => announcements.value.map(item => item.documentId).join(','), loadAcks)

const isAcknowledged = (announcement: Announcement) =>
  acknowledgedDocIds.value.has(String(announcement.documentId ?? announcement.id))

const acknowledge = async (announcement: Announcement) => {
  const key = String(announcement.documentId ?? announcement.id)
  if (acking.value || isAcknowledged(announcement)) return
  acking.value = key
  try {
    await $api('/api/announcement-acknowledgments', {
      method: 'POST',
      body: { data: { announcement: key } }
    })
    acknowledgedDocIds.value.add(key)
    toast.add({ title: 'Announcement acknowledged', color: 'success', icon: 'i-lucide-check-circle-2' })
  } catch (err) {
    toast.add({ title: 'Unable to acknowledge', description: getErrorMessage(err), color: 'error', icon: 'i-lucide-triangle-alert' })
  } finally {
    acking.value = null
  }
}

const formatDate = (value?: string) => value
  ? new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  : ''

const audienceColor = (audience: Announcement['audience']) => {
  switch (audience) {
    case 'Students':
      return 'secondary'
    case 'Tenants':
      return 'primary'
    default:
      return 'neutral'
  }
}
</script>

<template>
  <main class="imapsu-page">
    <AppPageHeader>
      <template #eyebrow>Stay informed</template>
      <template #title>Announcements</template>
      <template #description><p class="mt-2 max-w-xl text-muted">View official notices and advisories from the Office of Auxiliary Services. Acknowledge notices where requested.</p></template>
      <template #actions><UButton label="Refresh" icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="status === 'pending'" @click="refresh" /></template>
    </AppPageHeader>

    <AppRefreshState :refreshing="isRefreshing" :failed="hasLoaded && !!error" @retry="refresh" />
    <AppLoadingState v-if="isInitialLoading" :count="4" height="h-32" />

    <UAlert v-else-if="isInitialError" color="error" icon="i-lucide-triangle-alert" title="Unable to load announcements" description="Please try again." ><template #actions><UButton label="Retry" color="neutral" variant="outline" @click="refresh" /></template></UAlert>

    <UEmpty v-else-if="announcements.length === 0" icon="i-lucide-bell-off" title="No announcements yet" description="Announcements will appear here once published." />

    <div v-else class="space-y-4">
      <UCard v-for="announcement in announcements" :key="announcement.documentId ?? announcement.id" :ui="{ body: 'p-5' }">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <h2 class="text-lg font-semibold text-highlighted">{{ announcement.title }}</h2>
            <p class="mt-1 text-xs text-muted">{{ formatDate(announcement.publishedAt ?? announcement.createdAt) }}<span v-if="announcement.expireAt"> · Expires {{ formatDate(announcement.expireAt) }}</span></p>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <UBadge v-if="announcement.pinned" color="primary" variant="subtle" icon="i-lucide-pin">Pinned</UBadge>
            <UBadge v-if="auth.isAuthenticated && isAcknowledged(announcement)" color="success" variant="subtle" icon="i-lucide-check-circle-2">Acknowledged</UBadge>
            <UBadge :color="audienceColor(announcement.audience)" variant="subtle">{{ announcement.audience }}</UBadge>
          </div>
        </div>
        <p class="mt-3 whitespace-pre-line text-sm leading-relaxed text-toned">{{ announcement.body }}</p>
        <div v-if="auth.isAuthenticated && acksLoaded && !isAcknowledged(announcement)" class="mt-4 flex justify-end border-t border-default pt-4">
          <UButton size="sm" variant="subtle" icon="i-lucide-badge-check" :loading="acking === String(announcement.documentId ?? announcement.id)" @click="acknowledge(announcement)">Mark as acknowledged</UButton>
        </div>
      </UCard>
    </div>
    <AppRecordPagination :state="recordsPage" :response="data" :pending="status === 'pending'" />
  </main>
</template>
