<script setup lang="ts">
type NotificationItem = {
  id: number
  documentId?: string
  type: 'application' | 'ticket' | 'receipt' | 'follow-up' | 'announcement'
  entityType?: string | null
  entityId?: string | null
  entityLabel?: string | null
  title: string
  description?: string | null
  read: boolean
  actorUsername?: string | null
  createdAt?: string
}

const auth = useAuth()
const { $api } = useStrapi()
const notify = useNotify()

const open = ref(false)
const loading = ref(false)
const notifications = ref<NotificationItem[]>([])
const unread = ref(0)

let poll: ReturnType<typeof setInterval> | null = null

// A new announcement gets the filled highlight toast once per browser
// session. On the first check after signing in only announcements from the
// last few days count, so old unread ones do not pop up every visit.
const ANNOUNCED_KEY = 'imapsu:announced'
const RECENT_MS = 3 * 24 * 60 * 60 * 1000
let announced: Set<string> | null = null

const readAnnounced = () => {
  try { return new Set<string>(JSON.parse(sessionStorage.getItem(ANNOUNCED_KEY) ?? '[]')) } catch { return new Set<string>() }
}

const announceNew = (list: NotificationItem[]) => {
  if (auth.isStaff.value) return
  const firstCheck = announced === null
  announced ??= readAnnounced()
  const seen = announced
  const fresh = list.filter((item) => {
    if (item.type !== 'announcement' || item.read) return false
    if (seen.has(String(item.documentId ?? item.id))) return false
    return !firstCheck || !item.createdAt || Date.now() - new Date(item.createdAt).getTime() < RECENT_MS
  })
  for (const item of list) if (item.type === 'announcement') seen.add(String(item.documentId ?? item.id))
  try { sessionStorage.setItem(ANNOUNCED_KEY, JSON.stringify([...seen])) } catch { /* storage may be blocked */ }
  if (!fresh.length) return
  const newest = fresh[0]!
  notify.highlight(fresh.length === 1 ? 'New announcement' : `${fresh.length} new announcements`, {
    description: newest.description ?? undefined,
    duration: 10000,
    actions: [{ label: 'View', onClick: () => openNotification(newest) }]
  })
}

const load = async () => {
  if (!auth.isAuthenticated.value) return
  loading.value = true
  try {
    const [list, count] = await Promise.all([
      $api<{ data: NotificationItem[] }>('/api/notifications'),
      $api<{ count: number }>('/api/notifications/unread-count')
    ])
    notifications.value = list.data ?? []
    unread.value = count.count ?? 0
    announceNew(notifications.value)
  } catch {
    // ignore transient failures
  } finally {
    loading.value = false
  }
}

// OAS updates about one application or renewal open its review page.
const STAFF_REVIEW_KIND: Record<string, 'application' | 'renewal'> = { 'rental-application': 'application', 'renewal-intent': 'renewal' }

const targetFor = ({ type, entityType, entityId }: NotificationItem) => {
  if (auth.isStaff.value) {
    switch (type) {
      case 'application': {
        const kind = entityType ? STAFF_REVIEW_KIND[entityType] : undefined
        // Demo-seeded notifications carry numeric ids, which the review page cannot open.
        return kind && entityId && !/^\d+$/.test(entityId) ? reviewPath({ kind, documentId: entityId, id: entityId }) : '/admin/applications'
      }
      case 'ticket':
      case 'follow-up':
        return '/admin/maintenance'
      case 'receipt':
        return '/admin/bills'
      case 'announcement':
        return '/admin/announcements'
      default:
        return '/admin'
    }
  }
  switch (type) {
    case 'application':
      // Leases and renewals belong to a current tenant's tenancy page; updates
      // on an application for another stall stay with their applications.
      return auth.isCurrentTenant.value && entityType !== 'rental-application' ? '/tenancy' : '/rental-applications'
    case 'ticket':
    case 'follow-up':
      return '/maintenance'
    case 'receipt':
      return '/bills'
    case 'announcement':
      return '/announcements'
    default:
      return '/'
  }
}

const iconFor = (type: NotificationItem['type']) => {
  switch (type) {
    case 'application':
      return 'i-lucide-file-text'
    case 'ticket':
      return 'i-lucide-wrench'
    case 'receipt':
      return 'i-lucide-receipt'
    case 'follow-up':
      return 'i-lucide-message-square-text'
    case 'announcement':
      return 'i-lucide-megaphone'
    default:
      return 'i-lucide-bell'
  }
}

const timeAgo = (value?: string) => {
  if (!value) return ''
  const diff = Date.now() - new Date(value).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(value).toLocaleDateString()
}

const openNotification = async (notification: NotificationItem) => {
  if (!notification.read) {
    await $api(`/api/notifications/${notification.documentId ?? notification.id}/read`, {
      method: 'PUT'
    }).catch(() => {})
    await load()
  }
  open.value = false
  navigateTo(targetFor(notification))
}

const markAllRead = async () => {
  await $api('/api/notifications/read-all', { method: 'PUT' }).catch(() => {})
  await load()
}

onMounted(() => {
  load()
  poll = setInterval(load, 30000)
})

onUnmounted(() => {
  if (poll) clearInterval(poll)
})

watch(open, (value) => {
  if (value) load()
})
</script>

<template>
  <UPopover v-if="auth.isAuthenticated.value" v-model:open="open">
    <template #default>
      <div class="relative">
        <UButton class="imapsu-appbar-btn size-9" color="neutral" variant="ghost" icon="i-lucide-bell" :aria-label="unread > 0 ? `Notifications (${unread} unread)` : 'Notifications'" />
        <span v-if="unread > 0" class="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-error px-1 text-[10px] font-semibold text-white">
          {{ unread > 99 ? '99+' : unread }}
        </span>
      </div>
    </template>

    <template #content>
      <div class="w-80 max-w-[calc(100vw-1.5rem)]">
        <div class="flex items-center justify-between gap-2 border-b border-default px-3 py-2.5">
          <p class="text-sm font-semibold text-highlighted">Notifications</p>
          <UButton v-if="unread > 0" size="xs" color="neutral" variant="ghost" icon="i-lucide-check-check" label="Mark all read" :disabled="loading" @click="markAllRead" />
        </div>

        <div class="max-h-80 overflow-y-auto">
          <template v-if="notifications.length === 0">
            <div class="px-4 py-8 text-center text-sm text-muted">No notifications yet.</div>
          </template>

          <button v-for="notification in notifications" :key="notification.documentId ?? notification.id" type="button" class="block w-full px-3 py-2.5 text-left transition-colors hover:bg-muted/40" :class="notification.read ? '' : 'bg-primary/5'" @click="openNotification(notification)">
            <div class="flex items-center gap-2">
              <UIcon :name="iconFor(notification.type)" class="size-4 shrink-0 text-primary" />
              <p class="min-w-0 flex-1 truncate text-sm font-medium" :class="notification.read ? 'text-toned' : 'text-highlighted'">
                {{ notification.title }}
              </p>
              <span class="shrink-0 text-xs text-muted">{{ timeAgo(notification.createdAt) }}</span>
            </div>
            <p class="mt-0.5 pl-6 text-xs leading-relaxed text-muted">{{ notification.description }}</p>
          </button>
        </div>
      </div>
    </template>
  </UPopover>
</template>
