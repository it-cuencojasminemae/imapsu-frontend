<script setup lang="ts">
const props = withDefaults(defineProps<{ collapsed?: boolean; onNavigate?: () => void }>(), {
  collapsed: false
})

const auth = useAuth()
const route = useRoute()

type NavLink = { label: string; icon: string; to: string }

const generalLinks = computed<NavLink[]>(() => {
  const links: NavLink[] = [
    ...(!auth.isStaff.value && auth.isAuthenticated.value ? [{ label: 'Dashboard', icon: 'i-lucide-layout-dashboard', to: '/dashboard' }] : []),
    { label: 'Campus Map', icon: 'i-lucide-map-pinned', to: '/campus-map' }
  ]
  if (!auth.isStaff.value) {
    links.push({ label: 'Announcements', icon: 'i-lucide-megaphone', to: '/announcements' })
  }
  return links
})

const roleLinks = computed<{ label: string; links: NavLink[] }[]>(() => {
  const sections: { label: string; links: NavLink[] }[] = []

  if (auth.isAuthenticated.value && !auth.isStaff.value) {
    sections.push({
      label: 'Explore',
      links: [{ label: 'Rentable spaces', icon: 'i-lucide-store', to: '/properties' }]
    })
  }

  if (auth.isStudent.value) {
    sections.push({
      label: 'Student',
      links: [{ label: 'Student feedback', icon: 'i-lucide-message-square-text', to: '/feedback' }]
    })
  }

  if (auth.isAspiringTenant.value) {
    sections.push({
      label: 'Aspiring tenant',
      links: [{ label: 'Rental applications', icon: 'i-lucide-clipboard-list', to: '/rental-applications' }]
    })
  }

  if (auth.isCurrentTenant.value) {
    sections.push({
      label: 'Current tenant',
      links: [
        { label: 'My tenancy', icon: 'i-lucide-key-round', to: '/tenancy' },
        { label: 'Bills', icon: 'i-lucide-receipt', to: '/bills' },
        { label: 'Maintenance', icon: 'i-lucide-wrench', to: '/maintenance' },
        { label: 'Student feedback', icon: 'i-lucide-message-square-text', to: '/feedback' }
      ]
    })
  }

  if (auth.isOas.value) {
    sections.push({
      label: 'OAS Operations',
      links: [
        { label: auth.isOas.value ? 'OAS Dashboard' : 'Administrator Dashboard', icon: 'i-lucide-layout-dashboard', to: '/admin' },
        { label: 'Announcements', icon: 'i-lucide-megaphone', to: '/admin/announcements' },
        { label: 'Rentable spaces', icon: 'i-lucide-store', to: '/admin/properties' },
        { label: 'Rental applications', icon: 'i-lucide-clipboard-list', to: '/admin/applications' },
        { label: 'Tenancies', icon: 'i-lucide-key-round', to: '/admin/tenancies' },
        { label: 'Bills', icon: 'i-lucide-receipt', to: '/admin/bills' },
        { label: 'Meter readings', icon: 'i-lucide-gauge', to: '/admin/meter-readings' },
        { label: 'Maintenance', icon: 'i-lucide-wrench', to: '/admin/maintenance' },
        { label: 'Student feedback', icon: 'i-lucide-message-square-text', to: '/admin/feedback' }
      ]
    })
  }

  if (auth.isAdmin.value) {
    sections.push({ label: 'MIS Administration', links: [{ label: 'Administrator Dashboard', icon: 'i-lucide-layout-dashboard', to: '/admin' }] })
    sections.push({ label: 'Access Management', links: [{ label: 'Users', icon: 'i-lucide-users-round', to: '/admin/users' }, { label: 'Roles & permissions', icon: 'i-lucide-shield-check', to: '/admin/roles' }] })
    sections.push({ label: 'Audit and Monitoring', links: [{ label: 'Audit logs', icon: 'i-lucide-scroll-text', to: '/admin/audit-logs' }, { label: 'System monitoring', icon: 'i-lucide-activity', to: '/admin/system-monitoring' }] })
    sections.push({ label: 'Configuration and Recovery', links: [{ label: 'System settings', icon: 'i-lucide-settings-2', to: '/admin/system-settings' }, { label: 'Database backups', icon: 'i-lucide-database-backup', to: '/admin/backups' }] })
  }

  return sections
})

const linkClasses = (to: string) => [
  'imapsu-nav-link flex items-center gap-3 rounded-lg text-sm font-medium transition-colors',
  props.collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2',
  route.path === to ? 'is-active' : ''
]

const iconClasses = () => ['imapsu-nav-icon size-4.5']
</script>

<template>
  <div :class="collapsed ? 'space-y-4' : 'space-y-5'">
    <div>
      <p v-if="!collapsed" class="imapsu-nav-section-label">General</p>
      <div class="space-y-1">
        <UTooltip v-for="link in generalLinks" :key="link.to" :text="link.label" :disabled="!collapsed">
        <NuxtLink :to="link.to" :class="linkClasses(link.to)" :aria-label="link.label" :aria-current="route.path === link.to ? 'page' : undefined" :title="collapsed ? link.label : undefined" @click="onNavigate?.()">
          <span class="imapsu-nav-icon-wrap"><UIcon :name="link.icon" :class="iconClasses()" /></span>
          <span v-if="!collapsed">{{ link.label }}</span>
        </NuxtLink>
        </UTooltip>
      </div>
    </div>

    <div v-for="section in roleLinks" :key="section.label">
      <p v-if="!collapsed" class="imapsu-nav-section-label">{{ section.label }}</p>
      <div class="space-y-1">
        <UTooltip v-for="link in section.links" :key="link.to" :text="link.label" :disabled="!collapsed">
        <NuxtLink :to="link.to" :class="linkClasses(link.to)" :aria-label="link.label" :aria-current="route.path === link.to ? 'page' : undefined" :title="collapsed ? link.label : undefined" @click="onNavigate?.()">
          <span class="imapsu-nav-icon-wrap"><UIcon :name="link.icon" :class="iconClasses()" /></span>
          <span v-if="!collapsed">{{ link.label }}</span>
        </NuxtLink>
        </UTooltip>
      </div>
    </div>
  </div>
</template>
