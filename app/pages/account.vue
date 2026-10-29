<script setup lang="ts">
import type { StrapiFile, User } from '~/types/auth'
import { accountSection } from '~/utils/accountNavigation'
import { employeeProfileFields, sharedProfileFields, normalizeProfileText, profilePatch, type ProfileDraft, type ProfileField } from '~/utils/accountProfile'
import { prepareUpload } from '~/utils/uploadFile'

definePageMeta({ middleware: 'auth' })
useHead({ title: 'My Account | iMapSU' })

const auth = useAuth()
const route = useRoute()
const router = useRouter()
const colorMode = useColorMode()
const { $api, getErrorMessage } = useStrapi()
const toast = useToast()
const section = computed(() => accountSection(route.query.section))
const sections = [
  { value: 'profile', label: 'Profile', icon: 'i-lucide-circle-user-round' },
  { value: 'security', label: 'Security', icon: 'i-lucide-shield-check' },
  { value: 'preferences', label: 'Preferences', icon: 'i-lucide-sliders-horizontal' }
]
const fields = [...sharedProfileFields, ...employeeProfileFields]
const emptyDraft = (): ProfileDraft => ({ fullName: '', contactNumber: '', bio: '', position: '', department: '', employeeId: '', officeLocation: '' })
const form = reactive(emptyDraft())
const baseline = reactive(emptyDraft())
const saving = ref(false)
const profileError = ref('')
const fieldErrors = ref<Partial<Record<ProfileField, string>>>({})
const password = useTemplateRef('password')
const security = useTemplateRef('security')
const passwordUpdated = ref(false)
const sharedDirty = useState('account-unsaved-changes', () => false)
const changed = computed(() => profilePatch(form, baseline, auth.isStaff.value))
const dirty = computed(() => Object.keys(changed.value).length > 0)
const hasUnsavedChanges = computed(() => dirty.value || !!password.value?.dirty)
watchEffect(() => { sharedDirty.value = hasUnsavedChanges.value })
const identity = computed(() => `${auth.user.value?.id}:${auth.role.value}`)

const roleLabels: Record<string, string> = { student: 'Student', 'aspiring-tenant': 'Aspiring Tenant', 'current-tenant': 'Current Tenant', oas: 'OAS', admin: 'MIS' }
const roleLabel = computed(() => roleLabels[auth.role.value ?? ''] ?? 'Member')
const pendingMfa = computed(() => auth.isStaff.value && auth.user.value?.security?.mfaRequired && !auth.user.value.security.mfaEnabled)
const enrollmentDeadline = computed(() => {
  const deadline = auth.user.value?.security?.enrollmentDeadline
  return deadline == null ? '' : new Date(deadline).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' }) + ' (Philippine time)'
})
const openSecurity = async (enroll = false) => {
  await router.push({ path: '/account', query: { ...route.query, section: 'security' } })
  await nextTick()
  if (enroll) await security.value?.start()
}

const saveProfile = async () => {
  if (saving.value || !dirty.value) return
  profileError.value = ''; fieldErrors.value = {}
  // These fields are optional in the existing model; do not invent required values or phone formats.
  for (const key of fields) if (form[key].includes('\u0000')) fieldErrors.value[key] = 'Remove the invalid character.'
  if (Object.keys(fieldErrors.value).length) return
  saving.value = true
  const body = { ...changed.value }
  const owner = identity.value
  try {
    const updated = await $api<User>('/api/auth/account', { method: 'PUT', body })
    if (identity.value !== owner) return
    auth.user.value = { ...auth.user.value!, ...updated, security: updated.security ?? auth.user.value?.security }
    for (const key of Object.keys(body) as ProfileField[]) form[key] = updated[key] ?? ''
    toast.add({ title: 'Profile updated', color: 'success', icon: 'i-lucide-check-circle-2' })
  } catch (err: any) {
    profileError.value = getErrorMessage(err)
    for (const detail of err?.data?.error?.details?.errors ?? []) {
      const key = detail.path?.[0] as ProfileField
      if (fields.includes(key)) fieldErrors.value[key] = detail.message
    }
  } finally { saving.value = false }
}

const uploadingAvatar = ref(false)
const avatarError = ref('')
const avatarInput = ref<HTMLInputElement | null>(null)
const cropModalOpen = ref(false)
const cropSrc = ref<string | null>(null)
let cropObjectUrl: string | null = null
function handleCropModalOpenChange(value: boolean) {
  cropModalOpen.value = value
  if (!value) {
    if (cropObjectUrl) URL.revokeObjectURL(cropObjectUrl)
    cropObjectUrl = null; cropSrc.value = null
  }
}
const triggerAvatarPicker = () => { avatarError.value = ''; avatarInput.value?.click() }
const onAvatarSelected = (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  avatarError.value = ''
  if (!file.type.startsWith('image/')) { avatarError.value = 'Please choose an image file.'; return }
  handleCropModalOpenChange(false)
  cropObjectUrl = URL.createObjectURL(file)
  cropSrc.value = cropObjectUrl
  cropModalOpen.value = true
}
const saveAvatar = async (blob: Blob | null) => {
  if (uploadingAvatar.value) return
  handleCropModalOpenChange(false)
  avatarError.value = ''; uploadingAvatar.value = true
  const owner = identity.value
  try {
    let avatar: number | null = null
    if (blob) {
      const upload = new FormData()
      upload.append('purpose', 'avatar')
      upload.append('files', await prepareUpload(new File([blob], 'avatar.png', { type: 'image/png' })))
      const uploaded = await $api<StrapiFile[]>('/api/upload', { method: 'POST', body: upload })
      if (!uploaded[0]?.id) throw new Error('The photo upload returned no file.')
      avatar = uploaded[0].id
    }
    if (identity.value !== owner) return
    const updated = await $api<User>('/api/auth/account', { method: 'PUT', body: { avatar } })
    if (identity.value !== owner) return
    auth.user.value = { ...auth.user.value!, ...updated, security: updated.security ?? auth.user.value?.security }
    toast.add({ title: blob ? 'Profile photo updated' : 'Profile photo removed', color: 'success', icon: 'i-lucide-check-circle-2' })
  } catch (err) { if (identity.value === owner) avatarError.value = getErrorMessage(err) }
  finally { uploadingAvatar.value = false }
}

// Refresh clean fields while retaining edits, including during avatar/MFA refreshes.
watch(auth.user, (user, previous) => {
  const sameAccount = !!user && user.id === previous?.id && user.role?.type === previous?.role?.type
  for (const key of fields) {
    const incoming = user?.[key] ?? ''
    if (!sameAccount || normalizeProfileText(form[key]) === baseline[key]) form[key] = incoming
    baseline[key] = normalizeProfileText(incoming)
  }
  if (!sameAccount) {
    profileError.value = ''; fieldErrors.value = {}
    password.value?.reset()
    handleCropModalOpenChange(false)
  }
}, { immediate: true, flush: 'sync' })

const confirmLeave = () => !hasUnsavedChanges.value || passwordUpdated.value || window.confirm('You have unsaved account changes. Leave without saving?')
onBeforeRouteLeave(() => confirmLeave())
const beforePasswordUpdate = () => !dirty.value || window.confirm('Changing your password signs you out and discards your unsaved profile changes. Continue?')
const beforeUnload = (event: BeforeUnloadEvent) => {
  if (hasUnsavedChanges.value && !passwordUpdated.value) { event.preventDefault(); event.returnValue = '' }
}
onMounted(() => window.addEventListener('beforeunload', beforeUnload))
onBeforeUnmount(() => {
  sharedDirty.value = false
  window.removeEventListener('beforeunload', beforeUnload)
  if (cropObjectUrl) URL.revokeObjectURL(cropObjectUrl)
})
</script>

<template>
  <main class="imapsu-page account-page">
    <AppPageHeader title="My Account" description="Manage your profile, security, and account preferences." eyebrow="Your account" />

    <div v-if="auth.user.value?.security?.passwordChangeRequired || pendingMfa" class="mb-5 space-y-3">
      <UAlert v-if="auth.user.value?.security?.passwordChangeRequired" color="warning" variant="soft" icon="i-lucide-key-round" title="Password change required" description="Your configured password age has been reached. Update your password to restore access.">
        <template #actions><UButton label="Change password" color="warning" variant="soft" size="sm" @click="openSecurity()" /></template>
      </UAlert>
      <UAlert v-if="pendingMfa" color="warning" variant="soft" icon="i-lucide-shield-alert" title="Authenticator enrollment required" :description="enrollmentDeadline ? `Set up your MIS or OAS authenticator by ${enrollmentDeadline}.` : 'Set up your MIS or OAS authenticator to protect your account.'">
        <template #actions><UButton label="Set up authenticator" color="warning" variant="soft" size="sm" @click="openSecurity(true)" /></template>
      </UAlert>
    </div>

    <UCard class="mb-6" :ui="{ body: 'p-4 sm:p-5' }">
      <div class="flex flex-wrap items-center gap-4">
        <UAvatar :src="auth.avatarUrl.value ?? undefined" :text="auth.displayName.value.charAt(0).toUpperCase()" :alt="auth.displayName.value" class="!size-16 shrink-0" :ui="{ fallback: 'text-2xl' }" />
        <div class="min-w-0 flex-1 basis-36">
          <div class="flex flex-wrap items-center gap-2"><h2 class="text-lg font-semibold text-highlighted">{{ auth.displayName.value }}</h2><UBadge color="primary" variant="subtle">{{ roleLabel }}</UBadge></div>
          <p class="mt-0.5 break-all text-sm text-muted">@{{ auth.user.value?.username }}</p>
        </div>
        <div class="flex flex-wrap gap-2">
          <UButton :loading="uploadingAvatar" :disabled="saving || uploadingAvatar" color="neutral" variant="outline" icon="i-lucide-camera" label="Update photo" size="sm" @click="triggerAvatarPicker" />
          <UButton v-if="auth.user.value?.avatar" :disabled="uploadingAvatar || saving" color="neutral" variant="ghost" icon="i-lucide-trash-2" label="Remove" size="sm" @click="saveAvatar(null)" />
        </div>
      </div>
      <input ref="avatarInput" type="file" accept="image/*" class="hidden" aria-label="Choose profile photo" @change="onAvatarSelected" />
      <UAlert v-if="avatarError" class="mt-3" color="error" :description="avatarError" />
    </UCard>

    <div class="grid min-w-0 gap-5 lg:grid-cols-[12rem_minmax(0,1fr)] lg:gap-8">
      <nav aria-label="Account settings" class="flex gap-1 overflow-x-auto self-start rounded-xl border border-default bg-default p-2 lg:sticky lg:top-24 lg:flex-col">
        <NuxtLink v-for="item in sections" :key="item.value" :to="{ path: '/account', query: { ...route.query, section: item.value } }" :aria-current="section === item.value ? 'page' : undefined" class="flex shrink-0 items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-primary" :class="section === item.value ? 'bg-primary/10 text-primary' : 'text-muted hover:bg-muted/50 hover:text-highlighted'">
          <UIcon :name="item.icon" class="size-4 shrink-0" aria-hidden="true" />{{ item.label }}
        </NuxtLink>
      </nav>

      <div class="min-w-0">
        <section v-show="section === 'profile'" aria-label="Profile">
          <form class="space-y-5" @submit.prevent="saveProfile">
            <UCard>
              <template #header><h2 class="text-base font-semibold text-highlighted">Profile details</h2><p class="mt-1 text-sm text-muted">Update your personal and contact information.</p></template>
              <div class="grid gap-5 sm:grid-cols-2">
                <UFormField label="Full name" name="fullName" :error="fieldErrors.fullName" class="sm:col-span-2"><UInput v-model="form.fullName" placeholder="Your full name" autocomplete="name" :disabled="saving" class="w-full" size="md" /></UFormField>
                <UFormField label="Contact number" name="contactNumber" :error="fieldErrors.contactNumber"><UInput v-model="form.contactNumber" type="tel" autocomplete="tel" placeholder="e.g. 0917 000 0000" :disabled="saving" class="w-full" size="md" /></UFormField>
                <UFormField label="Email address" name="email" description="Managed by an administrator"><UInput :model-value="auth.user.value?.email" type="email" disabled class="w-full" size="md" /></UFormField>
                <UFormField label="Bio" name="bio" :error="fieldErrors.bio" class="sm:col-span-2"><UTextarea v-model="form.bio" placeholder="A little about you" :disabled="saving" class="w-full" :rows="3" /></UFormField>
              </div>
            </UCard>
            <UCard v-if="auth.isStaff.value">
              <template #header><h2 class="text-base font-semibold text-highlighted">Employee details</h2><p class="mt-1 text-sm text-muted">Your university position and office information.</p></template>
              <div class="grid gap-5 sm:grid-cols-2">
                <UFormField v-for="field in [{ key: 'position', label: 'Position' }, { key: 'department', label: 'Department' }, { key: 'employeeId', label: 'Employee ID' }, { key: 'officeLocation', label: 'Office location' }] as const" :key="field.key" :label="field.label" :name="field.key" :error="fieldErrors[field.key]">
                  <UInput v-model="form[field.key]" :disabled="saving" class="w-full" size="md" />
                </UFormField>
              </div>
            </UCard>
            <UAlert v-if="profileError" color="error" icon="i-lucide-triangle-alert" title="Unable to save profile" :description="profileError" />
            <div class="flex flex-wrap items-center justify-end gap-3">
              <span v-if="dirty" class="text-sm text-muted" role="status">Unsaved changes</span>
              <UButton type="submit" label="Save Changes" icon="i-lucide-check" data-prominent="true" :disabled="!dirty || uploadingAvatar" :loading="saving" />
            </div>
          </form>
        </section>

        <section v-show="section === 'security'" aria-label="Security" class="space-y-5">
          <AccountPassword :key="identity" ref="password" :before-update="beforePasswordUpdate" @password-updated="passwordUpdated = true" />
          <AccountSecurity :key="identity" ref="security" />
        </section>

        <section v-show="section === 'preferences'" aria-label="Preferences">
          <UCard>
            <template #header><h2 class="text-base font-semibold text-highlighted">Appearance</h2><p class="mt-1 text-sm text-muted">Choose how iMapSU looks on this browser.</p></template>
            <UFormField label="Color theme" name="theme" description="Applied immediately and shared with the theme control in the header.">
              <ClientOnly>
                <USelect v-model="colorMode.preference" :items="[{ label: 'Light', value: 'light' }, { label: 'Dark', value: 'dark' }, { label: 'Use device setting', value: 'system' }]" class="w-full sm:w-64" aria-label="Color theme" />
                <template #fallback><USkeleton class="h-8 w-full sm:w-64" /></template>
              </ClientOnly>
            </UFormField>
          </UCard>
        </section>
      </div>
    </div>
    <AvatarCropperModal :open="cropModalOpen" :src="cropSrc" @update:open="handleCropModalOpenChange" @cropped="saveAvatar" />
  </main>
</template>
