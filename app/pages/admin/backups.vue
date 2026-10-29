<script setup lang="ts">
import { UPLOAD_LIMIT_BYTES } from '~/utils/uploadFile'

definePageMeta({
  middleware: ['auth', 'role'],
  roles: ['admin']
})

useHead({ title: 'Database Backups | iMapSU' })

type BackupMeta = {
  name: string
  size: number
  createdAt: string
}

type BackupSettings = {
  enabled: boolean
  scheduleCron: string
  retentionDays: number
  backupDir: string
}

const auth = useAuth()
const toast = useToast()
const { confirm } = useConfirmDialog()
const { baseURL, $api, getErrorMessage } = useStrapi()
const headers = {}

const { data: responseData, status, error, refresh } = await useFetch<{ backups: BackupMeta[] }>('/api/system/backups', {
  baseURL,
  headers
})
const { data, hasLoaded, isInitialLoading, isRefreshing, isInitialError } = useRequestPresentation(responseData, status)


const { data: settingsDataResponse, refresh: refreshSettings, status: settingsDataStatus, error: settingsDataError } = await useFetch<BackupSettings>('/api/system/backups/settings', {
  baseURL,
  headers
})
const { data: settingsData } = useRequestPresentation(settingsDataResponse, settingsDataStatus)


const backups = computed(() => data.value?.backups ?? [])
const settings = computed(() => settingsData.value)

const creating = ref(false)
const deleting = ref<string | null>(null)
const restoring = ref(false)
const restoreFile = ref<File | null>(null)
const restoreInput = ref<HTMLInputElement | null>(null)
const restoreConfirmation = ref('')
const storedRestore = ref<BackupMeta | null>(null)
const storedRestoreOpen = ref(false)
const storedConfirmation = ref('')
const restoreTooLarge = computed(() => (restoreFile.value?.size ?? 0) > UPLOAD_LIMIT_BYTES)

const createBackup = async () => {
  creating.value = true
  try {
    const result = await $api<{ backup: BackupMeta }>('/api/system/backups', { method: 'POST' })
    toast.add({ title: 'Backup created', description: result.backup.name, color: 'success', icon: 'i-lucide-check-circle-2' })
    await refresh()
  } catch (err) {
    toast.add({ title: 'Unable to create backup', description: getErrorMessage(err), color: 'error', icon: 'i-lucide-triangle-alert' })
  } finally {
    creating.value = false
  }
}

const removeBackup = async (backup: BackupMeta) => {
  if (!await confirm({ title: 'Delete backup?', description: `"${backup.name}" will be permanently removed. This cannot be undone.`, confirmLabel: 'Delete backup', icon: 'i-lucide-trash-2' })) return
  deleting.value = backup.name
  try {
    await $api(`/api/system/backups/${backup.name}`, { method: 'DELETE' })
    toast.add({ title: 'Backup deleted', color: 'success', icon: 'i-lucide-check-circle-2' })
    await refresh()
  } catch (err) {
    toast.add({ title: 'Unable to delete backup', description: getErrorMessage(err), color: 'error', icon: 'i-lucide-triangle-alert' })
  } finally {
    deleting.value = null
  }
}

const onFilePicked = (event: Event) => {
  const input = event.target as HTMLInputElement
  restoreFile.value = input.files?.[0] ?? null
  restoreConfirmation.value = ''
}

// Shared by uploaded and stored restores: the typed filename, confirmation dialog and reauthentication apply to both.
const runRestore = async (name: string, confirmation: string, request: { body?: File, headers: Record<string, string> }) => {
  if (confirmation !== name) return false
  if (!await confirm({ title: 'Restore database?', description: `Restoring from "${name}" will REPLACE all current data with the contents of the backup. This cannot be undone.`, confirmLabel: 'Restore database', icon: 'i-lucide-database-backup' })) return false

  restoring.value = true
  try {
    const result = await $api<{ ok: boolean }>('/api/system/backups/restore', {
      method: 'POST',
      body: request.body,
      headers: { ...request.headers, 'X-Backup-Name': name, 'X-Restore-Confirm': confirmation }
    })
    toast.add({ title: result.ok ? 'Database restored' : 'Restore could not be confirmed', description: result.ok ? 'Backup applied successfully.' : 'Review the system status before continuing.', color: result.ok ? 'success' : 'warning', icon: result.ok ? 'i-lucide-check-circle-2' : 'i-lucide-triangle-alert' })
    return true
  } catch (err) {
    toast.add({ title: 'Restore failed', description: getErrorMessage(err), color: 'error', icon: 'i-lucide-triangle-alert' })
    return false
  } finally {
    restoring.value = false
  }
}

const restoreBackup = async () => {
  if (!restoreFile.value) return
  if (restoreTooLarge.value) {
    toast.add({ title: 'Backup file is too large', description: `Uploaded dumps must be under 4 MB (this one is ${formatSize(restoreFile.value.size)}). Restore larger backups from the stored backup list instead.`, color: 'error', icon: 'i-lucide-triangle-alert' })
    return
  }
  const restored = await runRestore(restoreFile.value.name, restoreConfirmation.value, {
    body: restoreFile.value,
    headers: { 'Content-Type': 'application/octet-stream' }
  })
  if (!restored) return
  restoreFile.value = null
  if (restoreInput.value) restoreInput.value.value = ''
}

const openStoredRestore = (backup: BackupMeta) => {
  storedRestore.value = backup
  storedConfirmation.value = ''
  storedRestoreOpen.value = true
}

// The backend reads the stored dump itself, so this request carries no body.
const restoreStoredBackup = async () => {
  if (!storedRestore.value) return
  const restored = await runRestore(storedRestore.value.name, storedConfirmation.value, { headers: { 'X-Backup-Source': 'stored' } })
  if (restored) storedRestoreOpen.value = false
}

const formatSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

const formatDate = (value: string) =>
  new Date(value).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
</script>

<template>
  <main class="imapsu-page imapsu-page--admin">
    <AppPageHeader>
      <template #eyebrow>Administration</template>
      <template #title>Database Backups</template>
      <template #description><p class="mt-2 max-w-xl text-muted">
          Create on-demand database backups, download dumps, and restore the database from a stored or uploaded backup file.
        </p></template>
      <template #actions><div class="flex items-center gap-2">
        <UButton label="Refresh" icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="status === 'pending'" @click="refresh" />
        <UButton label="Back up now" icon="i-lucide-database-backup" :loading="creating" @click="createBackup" />
      </div></template>
    </AppPageHeader>

    <div class="mb-8 grid gap-4 sm:grid-cols-3">
      <UCard>
        <div class="flex items-center gap-3">
          <span class="imapsu-brand-tile grid size-10 place-items-center rounded-lg">
            <UIcon name="i-lucide-clock-3" class="size-5" />
          </span>
          <div>
            <p class="text-xs text-muted">Schedule</p>
            <p class="font-medium text-highlighted">{{ settings?.scheduleCron ?? '—' }}</p>
          </div>
        </div>
      </UCard>
      <UCard>
        <div class="flex items-center gap-3">
          <span class="imapsu-brand-tile grid size-10 place-items-center rounded-lg">
            <UIcon name="i-lucide-calendar-check" class="size-5" />
          </span>
          <div>
            <p class="text-xs text-muted">Retention</p>
            <p class="font-medium text-highlighted">{{ settings ? `${settings.retentionDays} days` : '—' }}</p>
          </div>
        </div>
      </UCard>
      <UCard>
        <div class="flex items-center gap-3">
          <span class="imapsu-brand-tile grid size-10 place-items-center rounded-lg">
            <UIcon name="i-lucide-power" class="size-5" />
          </span>
          <div>
            <p class="text-xs text-muted">Scheduled backups</p>
            <p class="font-medium text-highlighted">{{ settings?.enabled ? 'Enabled' : 'Disabled' }}</p>
          </div>
        </div>
      </UCard>
    </div>

    <UCard class="mb-8">
      <template #header>
        <h2 class="text-lg font-semibold text-highlighted">Restore database</h2>
        <p class="text-sm text-muted">Upload a .dump file created by this tool (or an equivalent PostgreSQL custom-format dump). Uploaded dumps must be under 4 MB; restore larger backups with the Restore action in the backup list below.</p>
      </template>
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input ref="restoreInput" type="file" accept=".dump,application/octet-stream" class="block w-full max-w-sm text-sm text-muted file:mr-3 file:rounded-md file:border-0 file:bg-primary/10 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary" @change="onFilePicked" />
        <UButton
          label="Restore database"
          icon="i-lucide-upload-cloud"
          color="warning"
          :disabled="!restoreFile || restoreTooLarge || restoreConfirmation !== restoreFile.name"
          :loading="restoring"
          @click="restoreBackup"
        />
      </div>
      <UAlert v-if="restoreFile && restoreTooLarge" class="mt-4" color="error" icon="i-lucide-file-x" title="File is too large to upload" :description="`${restoreFile.name} is ${formatSize(restoreFile.size)}. Uploaded dumps must be under 4 MB. Restore it from the stored backup list instead.`" />
      <UFormField v-if="restoreFile && !restoreTooLarge" class="mt-4" label="Confirm backup filename" :description="`Type the selected filename exactly.${auth.user.value?.security?.mfaRequired ? ' Recent authenticator verification is required.' : ''}`"><UInput v-model="restoreConfirmation" class="w-full" /></UFormField>
      <UAlert v-if="restoreFile && !restoreTooLarge" class="mt-4" color="warning" icon="i-lucide-triangle-alert" title="Destructive operation" :description="`Restoring from ${restoreFile.name} will replace the application database. A pre-restore backup is retained; signed-in users must sign in again.`" />
    </UCard>

    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <h2 class="text-lg font-semibold text-highlighted">Backup files</h2>
          <span class="text-sm text-muted">{{ backups.length }} stored</span>
        </div>
      </template>

      <AppRefreshState :refreshing="isRefreshing" :failed="hasLoaded && !!error" @retry="refresh" />
    <AppLoadingState v-if="isInitialLoading" :count="4" height="h-12" />

      <UAlert v-else-if="isInitialError" color="error" icon="i-lucide-triangle-alert" title="Unable to load backups" description="Please try again." ><template #actions><UButton label="Retry" color="neutral" variant="outline" @click="refresh" /></template></UAlert>

      <UEmpty v-else-if="backups.length === 0" icon="i-lucide-database" title="No backups yet" description="Create your first backup with “Back up now”." />

      <ul v-else class="divide-y divide-default">
        <li v-for="backup in backups" :key="backup.name" class="flex items-center gap-4 px-5 py-3">
          <UIcon name="i-lucide-file-archive" class="size-5 text-muted" />
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium text-highlighted">{{ backup.name }}</p>
            <p class="text-xs text-muted">{{ formatDate(backup.createdAt) }} · {{ formatSize(backup.size) }}</p>
          </div>
          <UButton :to="'/api/system/backups/' + encodeURIComponent(backup.name) + '/download'" target="_blank" label="Download" icon="i-lucide-download" color="neutral" variant="ghost" size="sm" />
          <UButton label="Restore" icon="i-lucide-history" color="warning" variant="ghost" size="sm" :disabled="restoring" @click="openStoredRestore(backup)" />
          <UButton
            square
            color="error"
            variant="ghost"
            icon="i-lucide-trash-2"
            size="sm"
            :loading="deleting === backup.name"
            :aria-label="'Delete backup'"
            @click="removeBackup(backup)"
          />
        </li>
      </ul>
    </UCard>

    <UModal v-model:open="storedRestoreOpen" class="max-w-xl" title="Restore stored backup" description="Replace the application database with a backup kept on the server.">
      <template #body>
        <form v-if="storedRestore" class="space-y-4" @submit.prevent="restoreStoredBackup">
          <UAlert color="warning" icon="i-lucide-triangle-alert" title="Destructive operation" :description="`Restoring from ${storedRestore.name} (${formatDate(storedRestore.createdAt)}) will replace the application database. A pre-restore backup is retained; signed-in users must sign in again.`" />
          <UFormField label="Confirm backup filename" :description="`Type the backup filename exactly.${auth.user.value?.security?.mfaRequired ? ' Recent authenticator verification is required.' : ''}`">
            <UInput v-model="storedConfirmation" class="w-full" :placeholder="storedRestore.name" />
          </UFormField>
          <div class="flex justify-end gap-2">
            <UButton label="Cancel" color="neutral" variant="ghost" :disabled="restoring" @click="storedRestoreOpen = false" />
            <UButton data-prominent="true" type="submit" color="warning" icon="i-lucide-history" :loading="restoring" :disabled="storedConfirmation !== storedRestore.name">Restore database</UButton>
          </div>
        </form>
      </template>
    </UModal>
  </main>
</template>
