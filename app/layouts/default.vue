<script setup lang="ts">
import { landingPath } from '~/utils/accountNavigation'
const auth = useAuth()
const colorMode = useColorMode()
const route = useRoute()
const entryPath = computed(() => landingPath(auth.user.value))

const isStandalonePage = computed(() => ['/login', '/register', '/verify-email', '/forgot-password'].includes(route.path))
const isMapPage = computed(() => route.path === '/campus-map')
const drawerOpen = ref(false)
const accountDirty = useState('account-unsaved-changes', () => false)
const { confirm } = useConfirmDialog()
const signOut = async () => {
  if (accountDirty.value && !await confirm({ title: 'Sign out without saving?', description: 'You have unsaved account changes. They will be lost if you sign out now.', confirmLabel: 'Sign out', cancelLabel: 'Keep editing', tone: 'warning', icon: 'i-lucide-log-out' })) return
  await auth.logout()
  drawerOpen.value = false
  await navigateTo('/campus-map')
}
const navigationTrigger = useTemplateRef('navigationTrigger')
const drawerFocus = {
  onOpenAutoFocus: (event: Event) => {
    event.preventDefault()
    nextTick(() => document.querySelector<HTMLButtonElement>('[data-vaul-drawer] button[aria-label="Close navigation"]')?.focus())
  },
  onCloseAutoFocus: (event: Event) => {
    event.preventDefault()
    navigationTrigger.value?.$el?.focus()
  }
}

const sidebarCollapsed = ref(false)
onMounted(() => {
  sidebarCollapsed.value = localStorage.getItem('imapsu-sidebar-collapsed') === '1'
})
watch(sidebarCollapsed, (value) => {
  if (import.meta.client) localStorage.setItem('imapsu-sidebar-collapsed', value ? '1' : '0')
})

function toggleColorMode() {
  colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'
}

function closeDrawer() {
  drawerOpen.value = false
}

function toggleSidebar() {
  sidebarCollapsed.value = !sidebarCollapsed.value
}

const userItems = computed(() => {
  const items: Record<string, unknown>[] = [
    {
      type: 'label',
      label: auth.displayName.value,
      avatar: {
        src: auth.avatarUrl.value ?? undefined,
        text: (auth.displayName.value ?? '?').charAt(0).toUpperCase(),
        size: 'xl'
      }
    },
    {
      label: 'Account settings',
      icon: 'i-lucide-settings-2',
      to: '/account?section=security'
    },
    {
      label: 'My account',
      icon: 'i-lucide-circle-user-round',
      to: '/account?section=profile'
    }
  ]

  items.push({ type: 'separator' })
  items.push({
    label: 'Sign out',
    icon: 'i-lucide-log-out',
    onSelect: signOut
  })

  return [items]
})
</script>

<template>
  <div class="imapsu-page-bg" :class="isMapPage ? 'h-dvh overflow-hidden' : 'min-h-screen'">
    <a href="#main-content" class="imapsu-skip-link">Skip to content</a>
    <div class="flex items-stretch" :class="{ 'h-full': isMapPage }">
      <aside
        v-if="!isStandalonePage && !isMapPage"
        class="sticky top-0 z-30 hidden h-screen shrink-0 flex-col overflow-hidden border-r border-maroon-950/60 bg-maroon-950 transition-[width] duration-200 ease-in-out lg:flex"
        :class="sidebarCollapsed ? 'w-16' : 'w-64'"
      >
        <div class="imapsu-brand-bar h-1 shrink-0" />

        <div class="flex items-center justify-between gap-2 pb-3 pt-4" :class="sidebarCollapsed ? 'flex-col px-2' : 'px-3'">
          <div class="flex min-w-0 items-center gap-2.5 overflow-hidden">
            <BrandLogo :size="sidebarCollapsed ? 'size-8' : 'size-11'" />
            <div v-if="!sidebarCollapsed" class="min-w-0">
              <p class="truncate font-semibold tracking-tight text-white">iMapSU</p>
              <p class="text-xs leading-relaxed text-maroon-200">Interactive Map-Driven Stall Management System</p>
            </div>
          </div>
          <button
            type="button"
            class="grid size-8 shrink-0 place-items-center rounded-lg text-maroon-100 transition-colors hover:bg-white/10 hover:text-gold-300"
            :aria-label="sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'"
            :title="sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'"
            @click="toggleSidebar"
          >
            <UIcon :name="sidebarCollapsed ? 'i-lucide-panel-left-open' : 'i-lucide-panel-left-close'" class="size-4" />
          </button>
        </div>

        <div class="imapsu-scrollbar-maroon flex-1 overflow-y-auto px-2.5 py-3">
          <NavContent :collapsed="sidebarCollapsed" />
        </div>

        <div v-if="auth.isAuthenticated.value" class="border-t border-white/10 bg-black/20 px-2.5 py-3">
          <div v-if="!sidebarCollapsed" class="rounded-xl border border-white/10 bg-white/5 p-2.5">
            <div class="flex items-center gap-3">
              <UAvatar :src="auth.avatarUrl.value ?? undefined" :text="(auth.displayName.value ?? '?').charAt(0).toUpperCase()" :alt="auth.displayName.value" size="2xl" />
              <div class="min-w-0">
                <p class="truncate text-sm font-semibold text-white">{{ auth.displayName.value }}</p>
                <p v-if="auth.user.value?.email" class="truncate text-xs text-maroon-200">{{ auth.user.value.email }}</p>
              </div>
            </div>
            <UButton block variant="subtle" color="error" icon="i-lucide-log-out" label="Sign out" class="mt-2.5" @click="signOut" />
          </div>
          <div v-else class="flex flex-col items-center gap-3">
            <UAvatar :src="auth.avatarUrl.value ?? undefined" :text="(auth.displayName.value ?? '?').charAt(0).toUpperCase()" :alt="auth.displayName.value" size="2xl" :title="auth.displayName.value" />
            <UButton square variant="ghost" color="error" icon="i-lucide-log-out" aria-label="Sign out" :title="'Sign out'" class="text-maroon-100 hover:bg-white/10 hover:text-white" @click="signOut" />
          </div>
        </div>
      </aside>

      <div class="min-w-0 flex-1" :class="{ 'flex min-h-0 flex-col': isMapPage }">
        <header v-if="!isStandalonePage" class="sticky top-0 z-40 shrink-0">
          <div class="imapsu-brand-bar h-1" />
          <div class="imapsu-appbar">
            <div class="mx-auto flex h-[59px] max-w-7xl items-center gap-4 px-4 sm:px-6">
              <div class="flex min-w-0 items-center gap-2">
                <UButton ref="navigationTrigger" class="imapsu-appbar-btn size-9" :class="isMapPage ? '' : 'lg:hidden'" color="neutral" variant="ghost" square icon="i-lucide-menu" aria-label="Open navigation" :aria-expanded="drawerOpen" @click="drawerOpen = true" />
                <NuxtLink :to="entryPath" class="group flex min-w-0 shrink-0 items-center gap-2.5" :class="isMapPage ? '' : 'lg:hidden'">
                  <BrandLogo size="size-10" />
                  <span class="truncate text-base font-bold tracking-tight text-primary dark:text-secondary">iMapSU</span>
                </NuxtLink>
              </div>

              <div class="ml-auto flex items-center gap-1.5 sm:gap-2">
                <UButton class="imapsu-appbar-btn size-9" color="neutral" variant="ghost" square aria-label="Toggle color theme" title="Toggle color theme" @click="toggleColorMode">
                  <UIcon name="i-lucide-moon" class="imapsu-theme-light size-4" />
                  <UIcon name="i-lucide-sun" class="imapsu-theme-dark size-4" />
                </UButton>
                <NotificationBell />
                <template v-if="auth.isAuthenticated.value">
                  <UDropdownMenu :items="userItems">
                    <template #default>
                      <button
                        type="button"
                        class="imapsu-appbar-btn flex h-9 items-center gap-2 py-0 pl-1 pr-2"
                        aria-label="Account menu"
                      >
                        <UAvatar :src="auth.avatarUrl.value ?? undefined" :text="(auth.displayName.value ?? '?').charAt(0).toUpperCase()" :alt="auth.displayName.value" size="sm" />
                        <span class="hidden max-w-32 truncate text-sm font-medium sm:block">{{ auth.user.value?.username }}</span>
                        <UIcon name="i-lucide-chevron-down" class="size-3.5 text-toned" />
                      </button>
                    </template>
                  </UDropdownMenu>
                </template>
                <template v-else>
                  <UButton to="/login" color="neutral" variant="ghost" label="Sign in" />
                  <UButton to="/register" label="Register" class="hidden sm:inline-flex" data-prominent="true" />
                </template>
              </div>
            </div>
          </div>
        </header>

        <div id="main-content" class="min-w-0" :class="{ 'min-h-0 flex-1': isMapPage }" tabindex="-1">
          <slot />
        </div>
      </div>
    </div>

    <UDrawer v-if="!isStandalonePage" v-model:open="drawerOpen" direction="left" title="Navigation" description="Campus and account navigation" :content="drawerFocus" :close="{ 'aria-label': 'Close navigation', class: 'text-white hover:bg-white/10' }" :ui="{ content: 'w-80 max-w-[85vw] bg-maroon-950! ring-maroon-950!', description: 'sr-only', handle: '!bg-gold-400' }">
      <template #title>
        <div class="flex items-center gap-2.5">
          <BrandLogo size="size-11" />
          <div>
            <p class="font-semibold tracking-tight text-white">iMapSU</p>
            <p class="text-xs text-gold-200">Interactive Map-Driven Stall Management System</p>
          </div>
        </div>
      </template>

      <template #body>
        <div class="imapsu-scrollbar-maroon -mx-3 px-3">
          <NavContent :on-navigate="closeDrawer" />
        </div>
      </template>

      <template #footer>
        <div v-if="auth.isAuthenticated.value" class="space-y-3">
          <div class="flex items-center gap-3">
            <UAvatar :src="auth.avatarUrl.value ?? undefined" :text="(auth.displayName.value ?? '?').charAt(0).toUpperCase()" :alt="auth.displayName.value" size="2xl" />
            <div class="min-w-0">
              <p class="truncate text-base font-semibold text-white">{{ auth.displayName.value }}</p>
              <p v-if="auth.user.value?.email" class="truncate text-xs text-maroon-200">{{ auth.user.value.email }}</p>
            </div>
          </div>
          <UButton block variant="subtle" color="error" icon="i-lucide-log-out" label="Sign out" @click="signOut" />
        </div>
      </template>
    </UDrawer>


  </div>
</template>
