<script setup lang="ts">
import { checkPasswordStrength, PASSWORD_REQUIREMENTS } from '~/utils/password'
const auth = useAuth()
const { $api, getErrorMessage } = useStrapi()
const toast = useToast()
const emit = defineEmits<{ passwordUpdated: [] }>()
const props = defineProps<{ beforeUpdate?: () => boolean | Promise<boolean> }>()
const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const showCurrentPassword = ref(false)
const showNewPassword = ref(false)
const showConfirmPassword = ref(false)
const savingPassword = ref(false)
const passwordError = ref('')

const savePassword = async () => {
  if (savingPassword.value) return
  passwordError.value = ''
  if (!currentPassword.value || !newPassword.value || !confirmPassword.value) {
    passwordError.value = 'All fields are required.'
    return
  }
  if (newPassword.value !== confirmPassword.value) {
    passwordError.value = 'New passwords do not match.'
    return
  }
  const check = checkPasswordStrength(newPassword.value)
  if (!check.ok) {
    passwordError.value = `Password requirements: ${check.missing.map(key => PASSWORD_REQUIREMENTS.find(item => item.key === key)?.label ?? key).join('; ')}.`
    return
  }
  if (props.beforeUpdate && !await props.beforeUpdate()) return
  savingPassword.value = true
  try {
    await $api('/api/auth/account', {
      method: 'PUT',
      body: { currentPassword: currentPassword.value, newPassword: newPassword.value }
    })
    toast.add({ title: 'Password updated', description:'Sign in again with your new password.', color: 'success', icon: 'i-lucide-check-circle-2' })
    currentPassword.value = ''; newPassword.value = ''; confirmPassword.value = ''
    emit('passwordUpdated')
    auth.user.value = null
    await navigateTo('/login')
  } catch (err) {
    passwordError.value = getErrorMessage(err)
  } finally {
    savingPassword.value = false
  }
}

const dirty = computed(() => !!(currentPassword.value || newPassword.value || confirmPassword.value))
defineExpose({ dirty, reset: () => { currentPassword.value = ''; newPassword.value = ''; confirmPassword.value = '' } })
</script>

<template>
<UCard>
<template #header><h2 class="text-base font-semibold text-highlighted">Change password</h2><p class="mt-1 text-sm text-muted">Choose a new password to secure your account. You will sign in again after saving.</p></template>
        <form class="space-y-4" @submit.prevent="savePassword">
          <div class="rounded-lg border border-default bg-muted/20 px-4 py-3 text-sm">
            <p class="font-medium text-highlighted">{{ auth.user.value?.username }}</p>
            <p class="text-muted">{{ auth.user.value?.email }}</p>
          </div>

          <UFormField label="Current password" name="currentPassword" required>
            <UInput v-model="currentPassword" :type="showCurrentPassword ? 'text' : 'password'" autocomplete="current-password" :disabled="savingPassword" :ui="{ root: 'w-full' }">
              <template #trailing>
                <button type="button" class="text-dimmed transition-colors hover:text-highlighted" :aria-label="showCurrentPassword ? 'Hide password' : 'Show password'" @click="showCurrentPassword = !showCurrentPassword">
                  <UIcon :name="showCurrentPassword ? 'i-lucide-eye-off' : 'i-lucide-eye'" class="size-4" />
                </button>
              </template>
            </UInput>
          </UFormField>

          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField label="New password" name="newPassword" required>
              <UInput v-model="newPassword" :type="showNewPassword ? 'text' : 'password'" autocomplete="new-password" :disabled="savingPassword" :ui="{ root: 'w-full' }">
                <template #trailing>
                  <button type="button" class="text-dimmed transition-colors hover:text-highlighted" :aria-label="showNewPassword ? 'Hide password' : 'Show password'" @click="showNewPassword = !showNewPassword">
                    <UIcon :name="showNewPassword ? 'i-lucide-eye-off' : 'i-lucide-eye'" class="size-4" />
                  </button>
                </template>
              </UInput>
            </UFormField>
            <UFormField label="Confirm new password" name="confirmPassword" required>
              <UInput v-model="confirmPassword" :type="showConfirmPassword ? 'text' : 'password'" autocomplete="new-password" :disabled="savingPassword" :ui="{ root: 'w-full' }">
                <template #trailing>
                  <button type="button" class="text-dimmed transition-colors hover:text-highlighted" :aria-label="showConfirmPassword ? 'Hide password' : 'Show password'" @click="showConfirmPassword = !showConfirmPassword">
                    <UIcon :name="showConfirmPassword ? 'i-lucide-eye-off' : 'i-lucide-eye'" class="size-4" />
                  </button>
                </template>
              </UInput>
            </UFormField>
          </div>

          <UAlert v-if="passwordError" color="error" icon="i-lucide-triangle-alert" :description="passwordError" />

          <div class="flex justify-end gap-2">
            <UButton type="submit" :loading="savingPassword">Update password</UButton>
          </div>
        </form>
</UCard>
</template>
