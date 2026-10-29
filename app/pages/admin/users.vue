<script setup lang="ts">
definePageMeta({
  middleware: ['auth', 'role'],
  roles: ['admin']
})

type DirectoryUser = {
  id: number
  documentId?: string
  username: string
  email: string
  confirmed?: boolean
  blocked?: boolean
  security?: { lockedUntil?: number | null; mfaEnabled?: boolean }
  createdAt?: string
  role?: { documentId?: string; name?: string; type?: string } | null
}

useHead({ title: 'Manage Users | iMapSU' })

const ROLE_DOC_IDS: Record<string, string> = {
  student: 'lfabw04fhi1fe91oh0heewup',
  'aspiring-tenant': 'y3b72vs2uj2bc0792pwjzdy4',
  'current-tenant': 'p0qt6v81dq4lzt614uqti8lp',
  oas: 'mtovgm1t97h0mr65bs9j9enq',
  admin: 'pi0zscur9v46kb1fe88fksoc'
}

const ROLE_OPTIONS = [
  { label: 'Student', value: 'student' },
  { label: 'Aspiring Tenant', value: 'aspiring-tenant' },
  { label: 'Current Tenant', value: 'current-tenant' },
  { label: 'OAS', value: 'oas' },
  { label: 'Administrator', value: 'admin' }
]

const auth = useAuth()
const toast = useToast()
const { confirm } = useConfirmDialog()
const { baseURL, $api, getErrorMessage } = useStrapi()
const headers = {}

const recordSearch = ref('')
const recordsPage = useRecordPage(["username","email","role.name"], {  }, recordSearch)
const { data: responseData, status, error, refresh } = await useFetch<{ data: DirectoryUser[]; meta: any }>('/api/user-directory', {
  baseURL,
  headers,
  query: recordsPage.query
})
const { data, hasLoaded, isInitialLoading, isRefreshing, isInitialError } = useRequestPresentation(responseData, status)


const users = computed(() => data.value?.data ?? [])

const isSelf = (user: DirectoryUser) => user.id === auth.user.value?.id

const roleLabel = (type?: string) => ROLE_OPTIONS.find(option => option.value === type)?.label ?? type ?? '—'

const roleColor = (type?: string) => {
  switch (type) {
    case 'admin':
      return 'primary'
    case 'oas':
      return 'warning'
    case 'current-tenant':
      return 'success'
    case 'aspiring-tenant':
      return 'secondary'
    default:
      return 'neutral'
  }
}

const updating = ref<number | null>(null)
const saving = ref(false)
const editOpen = ref(false)
const editUser = ref<DirectoryUser | null>(null)
const editUsername = ref('')
const editEmail = ref('')
const editError = ref('')

const openEdit = (user: DirectoryUser) => {
  editUser.value = user
  editUsername.value = user.username
  editEmail.value = user.email
  editError.value = ''
  editOpen.value = true
}

const saveEdit = async () => {
  if (!editUser.value) return
  editError.value = ''
  if (!editUsername.value.trim() || !editEmail.value.trim()) {
    editError.value = 'Username and email are required.'
    return
  }
  saving.value = true
  try {
    await $api(`/api/auth/user/${editUser.value.id}`, {
      method: 'PUT',
      body: { username: editUsername.value, email: editEmail.value }
    })
    toast.add({ title: 'User updated', description: editUsername.value, color: 'success', icon: 'i-lucide-check-circle-2' })
    editOpen.value = false
    await refresh()
  } catch (err) {
    editError.value = getErrorMessage(err)
  } finally {
    saving.value = false
  }
}

const changeRole = async (user: DirectoryUser, type: string) => {
  if (!ROLE_DOC_IDS[type]) return
  updating.value = user.id
  try {
    await $api(`/api/auth/user/${user.id}`, {
      method: 'PUT',
      body: { role: type }
    })
    toast.add({ title: 'Role updated', description: `${user.username} is now ${roleLabel(type)}.`, color: 'success', icon: 'i-lucide-check-circle-2' })
    await refresh()
  } catch (err) {
    toast.add({ title: 'Unable to update role', description: getErrorMessage(err), color: 'error', icon: 'i-lucide-triangle-alert' })
  } finally {
    updating.value = null
  }
}

const remove = async (user: DirectoryUser) => {
  if (!await confirm({ title: 'Delete user?', description: `"${user.username}" (${user.email}) will be permanently removed. This cannot be undone.`, confirmLabel: 'Delete user', icon: 'i-lucide-user-x' })) return
  try {
    await $api(`/api/auth/user/${user.id}`, { method: 'DELETE' })
    toast.add({ title: 'User deleted', description: user.username, color: 'success', icon: 'i-lucide-check-circle-2' })
    await refresh()
  } catch (err) {
    toast.add({ title: 'Unable to delete user', description: getErrorMessage(err), color: 'error', icon: 'i-lucide-triangle-alert' })
  }
}

const createOpen = ref(false)
const createUsername = ref('')
const createEmail = ref('')
const createPassword = ref('')
const createRole = ref('student')
const createError = ref('')
const creating = ref(false)

const openCreate = () => {
  createUsername.value = ''
  createEmail.value = ''
  createPassword.value = ''
  createRole.value = 'student'
  createError.value = ''
  createOpen.value = true
}

const createUser = async () => {
  createError.value = ''
  if (!createUsername.value.trim() || !createEmail.value.trim() || !createPassword.value) {
    createError.value = 'Username, email and password are required.'
    return
  }
  creating.value = true
  try {
    await $api('/api/auth/create-user', {
      method: 'POST',
      body: {
        username: createUsername.value,
        email: createEmail.value,
        password: createPassword.value,
        role: createRole.value
      }
    })
    toast.add({ title: 'Account created', description: createUsername.value, color: 'success', icon: 'i-lucide-check-circle-2' })
    createOpen.value = false
    await refresh()
  } catch (err) {
    createError.value = getErrorMessage(err)
  } finally {
    creating.value = false
  }
}

const resetOpen = ref(false)
const resetUser = ref<DirectoryUser | null>(null)
const resetPassword = ref('')
const resetError = ref('')
const resetting = ref(false)

const openReset = (user: DirectoryUser) => {
  resetUser.value = user
  resetPassword.value = ''
  resetError.value = ''
  resetOpen.value = true
}

const submitReset = async () => {
  if (!resetUser.value) return
  resetError.value = ''
  if (!resetPassword.value) {
    resetError.value = 'Please provide a new password.'
    return
  }
  resetting.value = true
  try {
    await $api(`/api/auth/user/${resetUser.value.id}/reset-password`, {
      method: 'POST',
      body: { password: resetPassword.value }
    })
    toast.add({ title: 'Password reset', description: resetUser.value.username, color: 'success', icon: 'i-lucide-check-circle-2' })
    resetOpen.value = false
  } catch (err) {
    resetError.value = getErrorMessage(err)
  } finally {
    resetting.value = false
  }
}

const toggling = ref<number | null>(null)

const toggleActive = async (user: DirectoryUser) => {
  const next = user.blocked ? 'activate' : 'deactivate'
  if (!await confirm(next === 'activate'
    ? { title: 'Activate account?', description: `"${user.username}" will be able to sign in again.`, confirmLabel: 'Activate', tone: 'primary', icon: 'i-lucide-user-check' }
    : { title: 'Deactivate account?', description: `"${user.username}" will no longer be able to sign in.`, confirmLabel: 'Deactivate', tone: 'warning', icon: 'i-lucide-user-x' })) return
  toggling.value = user.id
  try {
    await $api(`/api/auth/user/${user.id}/${next}`, { method: 'POST' })
    toast.add({
      title: next === 'activate' ? 'Account activated' : 'Account deactivated',
      description: user.username,
      color: 'success',
      icon: 'i-lucide-check-circle-2'
    })
    await refresh()
  } catch (err) {
    toast.add({ title: 'Unable to update account', description: getErrorMessage(err), color: 'error', icon: 'i-lucide-triangle-alert' })
  } finally {
    toggling.value = null
  }
}
const resetAuthenticator = async (user: DirectoryUser) => {
  if (!await confirm({ title: 'Reset authenticator?', description: `${user.username} will need to re-enroll their authenticator. Existing sessions will be revoked.`, confirmLabel: 'Reset authenticator', tone: 'warning', icon: 'i-lucide-shield-off' })) return
  updating.value = user.id
  try { await $api('/api/auth/user/' + user.id + '/reset-mfa', { method: 'POST' }); toast.add({ title: 'Authenticator reset', description: 'Re-enrollment is required.', color: 'success' }); await refresh() }
  catch (error) { toast.add({ title: 'Unable to reset authenticator', description: getErrorMessage(error), color: 'error' }) }
  finally { updating.value = null }
}
const recordColumns = [
 { key: 'user', label: 'Account', value: (user: DirectoryUser) => user.username },
 { key: 'email', label: 'Email', value: (user: DirectoryUser) => user.email },
 { key: 'role', label: 'Role', value: (user: DirectoryUser) => roleLabel(user.role?.type), badge: true, color: (user: DirectoryUser) => roleColor(user.role?.type) },
 { key: 'status', label: 'Status', value: (user: DirectoryUser) => user.blocked ? 'Deactivated' : 'Active', badge: true, color: (user: DirectoryUser) => user.blocked ? 'error' : 'success' }
]
const filteredUsers = computed(() => {
  const query = recordSearch.value.trim().toLowerCase()
  return users.value.filter(item => [item.username, item.email, roleLabel(item.role?.type)].some(value => value?.toLowerCase().includes(query)))
})
</script>

<template>
  <main class="imapsu-page imapsu-page--admin">
    <AppPageHeader>
      <template #eyebrow>Administration</template>
      <template #title>Users</template>
      <template #description><p class="mt-2 max-w-xl text-muted">
          Manage system accounts, assigned roles, and account access.
        </p></template>
      <template #actions><div class="flex items-center gap-2">
        <UButton data-prominent="true" v-if="auth.isAdmin.value" label="Create user" icon="i-lucide-user-plus" @click="openCreate" />
        <UButton label="Refresh" icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="status === 'pending'" @click="refresh" />
      </div></template>
    </AppPageHeader>

    <AppRefreshState :refreshing="isRefreshing" :failed="hasLoaded && !!error" @retry="refresh" />
    <AppLoadingState v-if="isInitialLoading" :count="8" height="h-16" />

    <UAlert v-else-if="isInitialError" color="error" icon="i-lucide-triangle-alert" title="Unable to load users" description="Please try again." ><template #actions><UButton label="Retry" color="neutral" variant="outline" @click="refresh" /></template></UAlert>

    <UEmpty v-else-if="users.length === 0" icon="i-lucide-users-round" title="No users found" description="Registered users will appear here." />

    <div v-else class="space-y-3">
      <div class="imapsu-toolbar rounded-xl border border-default bg-default p-4"><UFormField label="Search users"><UInput v-model="recordSearch" icon="i-lucide-search" placeholder="Name, email, or role…" /></UFormField><div class="mt-3 flex items-center justify-between gap-2"><p class="text-sm text-muted">Showing {{ filteredUsers.length }} of {{ users.length }}</p><UButton v-if="recordSearch" label="Clear search" color="neutral" variant="ghost" size="sm" @click="recordSearch = ''" /></div></div>
      <UEmpty v-if="!filteredUsers.length" icon="i-lucide-search" title="No matching users" description="Try another search or clear your search." />
      <AppRecordTable v-else :items="filteredUsers" :columns="recordColumns" :item-key="user => user.id" caption="User directory">
        <template #actions="{ item }"><UButton v-if="auth.isAdmin.value && !isSelf(item)" label="Edit" icon="i-lucide-pencil" color="neutral" variant="ghost" size="sm" @click="openEdit(item)" /></template>
        <template #details="{ item: user }"><UCard  :ui="{ body: 'p-4' }">
          <UAlert v-if="user.security?.lockedUntil && user.security.lockedUntil > Date.now()" class="mb-3" color="warning" :title="'Sign-in limited until ' + new Date(user.security.lockedUntil).toLocaleString()" />
          <UButton v-if="auth.user.value?.security?.mfaRequired && !isSelf(user) && ['admin', 'oas'].includes(user.role?.type || '')" class="mb-3" label="Reset authenticator" icon="i-lucide-shield-check" color="neutral" variant="outline" size="sm" :loading="updating === user.id" @click="resetAuthenticator(user)" />
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex min-w-0 items-center gap-3">
            <span class="imapsu-brand-tile grid size-10 shrink-0 place-items-center rounded-lg text-sm font-semibold">{{ user.username.charAt(0).toUpperCase() }}</span>
            <div class="min-w-0">
              <p class="truncate font-medium text-highlighted">
                {{ user.username }}
                <span v-if="isSelf(user)" class="ml-1 text-xs text-muted">(you)</span>
                <UBadge v-if="user.blocked" color="error" variant="subtle" class="ml-1">Deactivated</UBadge>
              </p>
              <p class="truncate text-sm text-muted">{{ user.email }}</p>
            </div>
          </div>

          <div class="flex flex-wrap items-center gap-3">
            <UBadge :color="roleColor(user.role?.type)" variant="subtle">{{ roleLabel(user.role?.type) }}</UBadge>

            <USelect
              v-if="auth.isAdmin.value"
              :aria-label="`Role for ${user.username}`"
              :model-value="user.role?.type"
              :items="ROLE_OPTIONS"
              :disabled="updating === user.id || isSelf(user)"
              class="w-44"
              @update:model-value="(value: unknown) => value && changeRole(user, String(value))"
            />

            <UButton
              v-if="auth.isAdmin.value && !isSelf(user)"
              label="Edit"
              icon="i-lucide-pencil"
              color="neutral"
              variant="ghost"
              size="sm"
              @click="openEdit(user)"
            />

            <UButton
              v-if="auth.isAdmin.value && !isSelf(user)"
              label="Reset password"
              icon="i-lucide-key-round"
              color="neutral"
              variant="ghost"
              size="sm"
              @click="openReset(user)"
            />

            <UButton
              v-if="auth.isAdmin.value && !isSelf(user)"
              :label="user.blocked ? 'Activate' : 'Deactivate'"
              :icon="user.blocked ? 'i-lucide-check-circle-2' : 'i-lucide-circle-slash'"
              :color="user.blocked ? 'success' : 'warning'"
              variant="ghost"
              size="sm"
              :loading="toggling === user.id"
              @click="toggleActive(user)"
            />

            <UButton
              v-if="auth.isAdmin.value && !isSelf(user)"
              label="Delete"
              icon="i-lucide-trash-2"
              color="error"
              variant="ghost"
              size="sm"
              @click="remove(user)"
            />
          </div>
        </div>
      </UCard></template>
      </AppRecordTable>
    </div>

    <UModal v-model:open="createOpen" class="max-w-2xl" title="Create account" description="Provision a new account. New passwords must satisfy the configured password policy.">
      <template #body>
        <form class="space-y-4" @submit.prevent="createUser">
          <UFormField label="Username" required>
            <UInput required v-model="createUsername" type="text" autocomplete="off" :disabled="creating" />
          </UFormField>

          <UFormField label="Email" required>
            <UInput required v-model="createEmail" type="email" autocomplete="off" :disabled="creating" />
          </UFormField>

          <UFormField label="Password" required>
            <UInput required v-model="createPassword" type="password" autocomplete="new-password" :disabled="creating" />
          </UFormField>

          <UFormField label="Role" required>
            <USelect v-model="createRole" :items="ROLE_OPTIONS" :disabled="creating" />
          </UFormField>

          <UAlert v-if="createError" color="error" icon="i-lucide-triangle-alert" :description="createError" />

          <div class="flex justify-end gap-2">
            <UButton label="Cancel" color="neutral" variant="ghost" :disabled="creating" @click="createOpen = false" />
            <UButton data-prominent="true" type="submit" :loading="creating">Create account</UButton>
          </div>
        </form>
      </template>
    </UModal>

    <UModal v-model:open="resetOpen" class="max-w-xl" title="Reset password" :description="resetUser ? `Set a new password for ${resetUser.username}.` : ''">
      <template #body>
        <form class="space-y-4" @submit.prevent="submitReset">
          <UFormField label="New password" required>
            <UInput required v-model="resetPassword" type="password" autocomplete="new-password" :disabled="resetting" />
          </UFormField>

          <UAlert v-if="resetError" color="error" icon="i-lucide-triangle-alert" :description="resetError" />

          <div class="flex justify-end gap-2">
            <UButton label="Cancel" color="neutral" variant="ghost" :disabled="resetting" @click="resetOpen = false" />
            <UButton data-prominent="true" type="submit" :loading="resetting">Reset password</UButton>
          </div>
        </form>
      </template>
    </UModal>

    <UModal v-model:open="editOpen" class="max-w-2xl" title="Edit user" :description="editUser ? `Update ${editUser.username}'s account details.` : ''">
      <template #body>
        <form class="space-y-4" @submit.prevent="saveEdit">
          <UFormField label="Username" required>
            <UInput required v-model="editUsername" type="text" autocomplete="off" :disabled="saving" />
          </UFormField>

          <UFormField label="Email" required>
            <UInput required v-model="editEmail" type="email" autocomplete="off" :disabled="saving" />
          </UFormField>

          <UAlert v-if="editError" color="error" icon="i-lucide-triangle-alert" :description="editError" />

          <div class="flex justify-end gap-2">
            <UButton label="Cancel" color="neutral" variant="ghost" :disabled="saving" @click="editOpen = false" />
            <UButton data-prominent="true" type="submit" :loading="saving">Save changes</UButton>
          </div>
        </form>
      </template>
    </UModal>
    <AppRecordPagination :state="recordsPage" :response="data" :pending="status === 'pending'" />
  </main>
</template>
