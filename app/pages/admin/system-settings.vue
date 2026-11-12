<script setup lang="ts">
definePageMeta({
  middleware: ['auth', 'role'],
  roles: ['admin', 'oas']
})

type SystemSettings = {
  id?: number
  systemName: string
  systemStatus: 'operational' | 'degraded' | 'maintenance'
  maintenanceBanner?: string | null
  passwordMinLength: number
  passwordRequireUppercase: boolean
  passwordRequireNumber: boolean
  passwordRequireSymbol: boolean
  passwordMaxAgeDays?: number | null
  accountLockoutThreshold: number
  accountLockoutWindowMinutes: number
  accountLockoutDurationMinutes: number
  uploadMaxFileMb: number
  uploadAllowedTypes?: unknown
  notificationEmailEnabled: boolean
  notifyOnApplication: boolean
  notifyOnTicket: boolean
  notifyOnReceipt: boolean
  notifyOnFollowUp: boolean
  backupsEnabled: boolean
  backupScheduleCron: string
  backupRetentionDays: number
}

const auth = useAuth()
const notify = useNotify()
const { baseURL, $api, getErrorMessage } = useStrapi()
const headers = {}

// MIS administrators manage every setting. OAS staff only maintain the stall
// rules and regulations applicants accept, so they never load the rest.
const isAdmin = computed(() => auth.isAdmin.value)
useHead({ title: () => isAdmin.value ? 'System Settings | iMapSU' : 'Stall Rules | iMapSU' })

const { data: responseData, status, error, refresh: refreshSettings } = await useFetch<{ data: SystemSettings }>('/api/system-settings', { lazy: true,
  baseURL,
  headers,
  immediate: auth.isAdmin.value
})
const { data, hasLoaded, isInitialLoading, isRefreshing, isInitialError } = useRequestPresentation(responseData, status)

const { data: rulesResponse, status: rulesStatus, refresh: refreshRules } = await useFetch<{ data: { stallRules: string } }>('/api/system-settings/stall-rules', { lazy: true,
  baseURL,
  headers
})
const stallRules = ref('')
const savedRules = ref('')
const rulesLoaded = ref(false)
watch(
  () => rulesResponse.value?.data?.stallRules,
  (rules) => {
    if (typeof rules !== 'string') return
    stallRules.value = rules
    savedRules.value = rules
    rulesLoaded.value = true
  },
  { immediate: true }
)
const RULES_MAX_LENGTH = 50000
const rulesToolbar = [
  [
    { kind: 'heading', level: 2, icon: 'i-lucide-heading-2', 'aria-label': 'Heading' },
    { kind: 'heading', level: 3, icon: 'i-lucide-heading-3', 'aria-label': 'Subheading' }
  ],
  [
    { kind: 'mark', mark: 'bold', icon: 'i-lucide-bold', 'aria-label': 'Bold' },
    { kind: 'mark', mark: 'italic', icon: 'i-lucide-italic', 'aria-label': 'Italic' }
  ],
  [
    { kind: 'bulletList', icon: 'i-lucide-list', 'aria-label': 'Bulleted list' },
    { kind: 'orderedList', icon: 'i-lucide-list-ordered', 'aria-label': 'Numbered list' }
  ],
  [
    { kind: 'undo', icon: 'i-lucide-undo', 'aria-label': 'Undo' },
    { kind: 'redo', icon: 'i-lucide-redo', 'aria-label': 'Redo' }
  ]
] as any

const refresh = async () => {
  await Promise.all([isAdmin.value ? refreshSettings() : Promise.resolve(), refreshRules()])
}


const form = reactive<SystemSettings>({
  systemName: '',
  systemStatus: 'operational',
  maintenanceBanner: '',
  passwordMinLength: 8,
  passwordRequireUppercase: true,
  passwordRequireNumber: true,
  passwordRequireSymbol: false,
  passwordMaxAgeDays: null,
  accountLockoutThreshold: 5,
  accountLockoutWindowMinutes: 10,
  accountLockoutDurationMinutes: 30,
  uploadMaxFileMb: 5,
  notificationEmailEnabled: true,
  notifyOnApplication: true,
  notifyOnTicket: true,
  notifyOnReceipt: true,
  notifyOnFollowUp: true,
  backupsEnabled: true,
  backupScheduleCron: '0 2 * * *',
  backupRetentionDays: 7
})

watch(
  () => data.value?.data,
  (settings) => {
    if (!settings) return
    Object.assign(form, {
      systemName: settings.systemName ?? '',
      systemStatus: settings.systemStatus ?? 'operational',
      maintenanceBanner: settings.maintenanceBanner ?? '',
      passwordMinLength: settings.passwordMinLength ?? 8,
      passwordRequireUppercase: settings.passwordRequireUppercase ?? true,
      passwordRequireNumber: settings.passwordRequireNumber ?? true,
      passwordRequireSymbol: settings.passwordRequireSymbol ?? false,
      passwordMaxAgeDays: settings.passwordMaxAgeDays ?? null,
      accountLockoutThreshold: settings.accountLockoutThreshold ?? 5,
      accountLockoutWindowMinutes: settings.accountLockoutWindowMinutes ?? 10,
      accountLockoutDurationMinutes: settings.accountLockoutDurationMinutes ?? 30,
      uploadMaxFileMb: Math.min(settings.uploadMaxFileMb ?? 5, 5),
      notificationEmailEnabled: settings.notificationEmailEnabled ?? true,
      notifyOnApplication: settings.notifyOnApplication ?? true,
      notifyOnTicket: settings.notifyOnTicket ?? true,
      notifyOnReceipt: settings.notifyOnReceipt ?? true,
      notifyOnFollowUp: settings.notifyOnFollowUp ?? true,
      backupsEnabled: settings.backupsEnabled ?? true,
      backupScheduleCron: settings.backupScheduleCron ?? '0 2 * * *',
      backupRetentionDays: settings.backupRetentionDays ?? 7
    })
  },
  { immediate: true, deep: true }
)

const saving = ref(false)

const save = async () => {
  const rules = stallRules.value.trim()
  if (rulesLoaded.value && !rules) {
    notify.error('Unable to save settings', { description: 'Enter the stall rules and regulations.' })
    return
  }
  if (rules.length > RULES_MAX_LENGTH) {
    notify.error('Unable to save settings', { description: 'The stall rules are too long (50,000 characters at most).' })
    return
  }
  saving.value = true
  try {
    if (isAdmin.value) {
      await $api('/api/system-settings', {
        method: 'PUT',
        body: {
          data: {
            ...form,
            passwordMaxAgeDays: form.passwordMaxAgeDays ?? null
          }
        }
      })
    }
    if (rulesLoaded.value && rules !== savedRules.value.trim()) {
      await $api('/api/system-settings/stall-rules', { method: 'PUT', body: { data: { stallRules: rules } } })
    }
    if (isAdmin.value) notify.success('Settings saved', { description: 'System configuration has been updated.' })
    else notify.success('Stall rules saved', { description: 'Applicants will see the updated rules and regulations.' })
    await refresh()
  } catch (err) {
    notify.error('Unable to save settings', { description: getErrorMessage(err) })
  } finally {
    saving.value = false
  }
}

const statusOptions = [
  { label: 'Operational', value: 'operational' },
  { label: 'Degraded', value: 'degraded' },
  { label: 'Maintenance', value: 'maintenance' }
]
</script>

<template>
  <main class="imapsu-page imapsu-page--admin">
    <AppPageHeader>
      <template #title>{{ isAdmin ? 'System settings' : 'Stall rules' }}</template>
      <template #description><p class="mt-2 max-w-xl text-muted">
          {{ isAdmin
            ? 'Configure system-wide behaviour: account policy, notification preferences, upload restrictions, the stall rules and the database backup schedule.'
            : 'Maintain the rules and regulations that applicants must read and accept before they apply for a stall.' }}
        </p></template>
      <template #actions><div class="flex items-center gap-2">
        <UButton label="Refresh" icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="status === 'pending' || rulesStatus === 'pending'" @click="refresh" />
      </div></template>
    </AppPageHeader>

    <AppRefreshState v-if="isAdmin" :refreshing="isRefreshing" :failed="hasLoaded && !!error" @retry="refresh" />
    <AppLoadingState v-if="isAdmin && isInitialLoading" variant="form" :count="3" label="Loading system settings…" />

    <UAlert v-else-if="isAdmin && isInitialError" color="error" icon="i-lucide-triangle-alert" title="Unable to load system settings" description="Please try again." ><template #actions><UButton label="Retry" color="neutral" variant="outline" @click="refresh" /></template></UAlert>

    <form v-else class="space-y-6" @submit.prevent="save">
      <template v-if="isAdmin">
      <UCard>
        <template #header>
          <h2 class="text-lg font-semibold text-highlighted">General</h2>
          <p class="text-sm text-muted">Status shown across the platform.</p>
        </template>
        <UFormField label="System status" description="Maintenance and Degraded show a notice at the top of every page.">
          <USelect v-model="form.systemStatus" :items="statusOptions" class="w-full sm:w-64" />
        </UFormField>
        <UFormField class="mt-4" label="Notice message" description="Optional. Leave blank to use the standard message for the status.">
          <UTextarea v-model="form.maintenanceBanner" :rows="2" />
        </UFormField>
      </UCard>

      <UCard>
        <template #header>
          <h2 class="text-lg font-semibold text-highlighted">Account policy</h2>
          <p class="text-sm text-muted">Requirements applied to new and reset passwords, plus account lockout settings.</p>
        </template>
        <div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <UFormField label="Minimum password length">
            <UInputNumber v-model="form.passwordMinLength" :min="4" :max="32" />
          </UFormField>
          <UFormField label="Maximum password age (days, 0 = never)">
            <UInputNumber v-model="form.passwordMaxAgeDays" :min="0" />
          </UFormField>
          <UFormField label="Failed attempts before lockout">
            <UInputNumber v-model="form.accountLockoutThreshold" :min="0" />
          </UFormField>
          <UFormField label="Lockout window (minutes)">
            <UInputNumber v-model="form.accountLockoutWindowMinutes" :min="1" />
          </UFormField>
          <UFormField label="Lockout duration (minutes)">
            <UInputNumber v-model="form.accountLockoutDurationMinutes" :min="1" />
          </UFormField>
        </div>
        <div class="mt-4 space-y-3">
          <label class="flex items-center justify-between gap-4 rounded-lg border border-default px-4 py-3">
            <div>
              <p class="text-sm font-medium text-highlighted">Require an uppercase letter</p>
              <p class="text-xs text-muted">Passwords must contain at least one A–Z character.</p>
            </div>
            <UCheckbox v-model="form.passwordRequireUppercase" />
          </label>
          <label class="flex items-center justify-between gap-4 rounded-lg border border-default px-4 py-3">
            <div>
              <p class="text-sm font-medium text-highlighted">Require a number</p>
              <p class="text-xs text-muted">Passwords must contain at least one digit.</p>
            </div>
            <UCheckbox v-model="form.passwordRequireNumber" />
          </label>
          <label class="flex items-center justify-between gap-4 rounded-lg border border-default px-4 py-3">
            <div>
              <p class="text-sm font-medium text-highlighted">Require a symbol</p>
              <p class="text-xs text-muted">Passwords must contain at least one special character such as ! @ # $.</p>
            </div>
            <UCheckbox v-model="form.passwordRequireSymbol" />
          </label>
        </div>
      </UCard>

      <UCard>
        <template #header>
          <h2 class="text-lg font-semibold text-highlighted">Notifications</h2>
          <p class="text-sm text-muted">Which OAS-facing notification categories are recorded.</p>
        </template>
        <div class="space-y-3">
          <label class="flex items-center justify-between gap-4 rounded-lg border border-default px-4 py-3">
            <div>
              <p class="text-sm font-medium text-highlighted">Rental applications</p>
              <p class="text-xs text-muted">Notify the OAS when a rental application is submitted.</p>
            </div>
            <UCheckbox v-model="form.notifyOnApplication" />
          </label>
          <label class="flex items-center justify-between gap-4 rounded-lg border border-default px-4 py-3">
            <div>
              <p class="text-sm font-medium text-highlighted">Maintenance tickets</p>
              <p class="text-xs text-muted">Notify the OAS when a maintenance ticket is filed.</p>
            </div>
            <UCheckbox v-model="form.notifyOnTicket" />
          </label>
          <label class="flex items-center justify-between gap-4 rounded-lg border border-default px-4 py-3">
            <div>
              <p class="text-sm font-medium text-highlighted">Receipt uploads</p>
              <p class="text-xs text-muted">Notify the OAS when a payment receipt is uploaded, and the tenant when it is verified.</p>
            </div>
            <UCheckbox v-model="form.notifyOnReceipt" />
          </label>
          <label class="flex items-center justify-between gap-4 rounded-lg border border-default px-4 py-3">
            <div>
              <p class="text-sm font-medium text-highlighted">Ticket follow-ups</p>
              <p class="text-xs text-muted">Notify the OAS when a tenant follows up on a ticket.</p>
            </div>
            <UCheckbox v-model="form.notifyOnFollowUp" />
          </label>
        </div>
      </UCard>

      <UCard>
        <template #header>
          <h2 class="text-lg font-semibold text-highlighted">File uploads</h2>
          <p class="text-sm text-muted">Restrictions applied to uploaded documents and images.</p>
        </template>
        <div class="grid gap-6 sm:grid-cols-2">
          <UFormField label="Maximum upload size (MB)" description="Up to 5 MB per file.">
            <UInputNumber v-model="form.uploadMaxFileMb" :min="1" :max="5" />
          </UFormField>
        </div>
      </UCard>

      <UCard>
        <template #header>
          <h2 class="text-lg font-semibold text-highlighted">Database backup</h2>
          <p class="text-sm text-muted">Scheduled backup configuration. Changing the schedule takes effect on the next server restart.</p>
        </template>
        <div class="grid gap-6 sm:grid-cols-2">
          <UFormField label="Backup schedule (cron)">
            <UInput v-model="form.backupScheduleCron" type="text" placeholder="0 2 * * *" autocomplete="off" />
          </UFormField>
          <UFormField label="Retention (days)">
            <UInputNumber v-model="form.backupRetentionDays" :min="1" />
          </UFormField>
        </div>
        <label class="mt-4 flex items-center justify-between gap-4 rounded-lg border border-default px-4 py-3">
          <div>
            <p class="text-sm font-medium text-highlighted">Enable scheduled backups</p>
            <p class="text-xs text-muted">Create a database dump on the configured schedule and prune old backups.</p>
          </div>
          <UCheckbox v-model="form.backupsEnabled" />
        </label>
      </UCard>
      </template>

      <UCard>
        <template #header>
          <h2 class="text-lg font-semibold text-highlighted">Stall rules and regulations</h2>
          <p class="text-sm text-muted">Shown to applicants, who must accept them before applying for a stall. Use headings and lists to keep the rules easy to read.</p>
        </template>
        <AppLoadingState v-if="!rulesLoaded && rulesStatus === 'pending'" :count="3" height="h-8" />
        <UAlert v-else-if="!rulesLoaded" color="error" icon="i-lucide-triangle-alert" title="Unable to load the stall rules" description="Please try again."><template #actions><UButton label="Retry" color="neutral" variant="outline" @click="refreshRules()" /></template></UAlert>
        <ClientOnly v-else>
          <div class="overflow-hidden rounded-lg border border-default">
            <UEditor v-slot="{ editor }" v-model="stallRules" content-type="markdown" placeholder="Write the stall rules and regulations…" class="max-h-[32rem] min-h-64 w-full overflow-y-auto" :ui="{ base: 'px-4 py-3' }">
              <UEditorToolbar :editor="editor" :items="rulesToolbar" class="sticky top-0 z-10 flex-wrap border-b border-default bg-default px-2 py-1" />
            </UEditor>
          </div>
          <template #fallback><AppLoadingState :count="3" height="h-8" /></template>
        </ClientOnly>
      </UCard>

      <div class="flex justify-end">
        <UButton data-prominent="true" type="submit" icon="i-lucide-save" :loading="saving">Save changes</UButton>
      </div>
    </form>
  </main>
</template>
