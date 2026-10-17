<script setup lang="ts">
useHead({ title: 'Create Account | iMapSU' })

const auth = useAuth()
const toast = useToast()

const username = ref('')
const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const showPassword = ref(false)
const showConfirmPassword = ref(false)
const role = ref('student')
const loading = ref(false)
const registeredEmail = ref('')
const deliveryFailed = ref(false)
const resending = ref(false)
const registrationError = ref('')
const attempted = ref(false)

const roleOptions = [
  { label: 'Student', value: 'student', description: 'View the map and submit feedback about tenants.' },
  { label: 'Aspiring Tenant', value: 'aspiring-tenant', description: 'Browse vacant spaces and apply to rent one.' }
]

const passwordCheck = computed(() => checkPasswordStrength(password.value))

const handleRegister = async () => {
  attempted.value = true
  registrationError.value = ''
  if (!isStrongPassword(password.value)) {
    toast.add({
      title: 'Password is too weak',
      description: `Password must contain ${PASSWORD_REQUIREMENTS.filter(requirement => passwordCheck.value.missing.includes(requirement.key)).map(requirement => requirement.label).join(', ')}.`,
      color: 'error',
      icon: 'i-lucide-triangle-alert'
    })
    return
  }

  if (password.value !== confirmPassword.value) {
    toast.add({ title: 'Passwords do not match', color: 'error', icon: 'i-lucide-triangle-alert' })
    return
  }

  loading.value = true
  try {
    const result = await auth.register({ username: username.value, email: email.value, password: password.value, role: role.value })
    deliveryFailed.value = result.verificationEmailSent === false
    registeredEmail.value = email.value
  } catch (error: unknown) {
    const message = (error as { data?: { error?: { message?: string } } })?.data?.error?.message
    registrationError.value = message ?? 'Unable to complete the request. Please try again.'
    toast.add({ title: 'Registration failed', description: message ?? 'Unable to complete the request. Please try again.', color: 'error', icon: 'i-lucide-triangle-alert' })
  } finally {
    loading.value = false
  }
}

const resendVerification = async () => {
  if (!registeredEmail.value) return
  resending.value = true
  try {
    await auth.resendConfirmation(registeredEmail.value)
    toast.add({ title: 'Verification requested', description: 'If the account needs verification, a new code has been requested.', color: 'success', icon: 'i-lucide-mail-check' })
  } catch {
    toast.add({ title: 'Unable to resend', description: 'Please try again in a moment.', color: 'error', icon: 'i-lucide-triangle-alert' })
  } finally {
    resending.value = false
  }
}
</script>

<template>
  <div class="imapsu-auth">
    <UCard class="ring-1 ring-default">
      <template #header>
        <div class="flex flex-col items-center text-center">
          <span class="imapsu-brand-tile mb-4 grid size-12 place-items-center rounded-xl shadow-sm">
            <UIcon name="i-lucide-map-pinned" class="size-6" />
          </span>
          <h1 class="text-2xl font-bold tracking-tight text-highlighted">Create your account</h1>
          <p class="mt-1 text-sm text-muted">Choose how you'll use iMapSU.</p>
        </div>
      </template>

      <div v-if="registeredEmail" class="space-y-5 text-center">
        <span class="mx-auto grid size-14 place-items-center rounded-full bg-success/10 text-success">
          <UIcon name="i-lucide-mail-check" class="size-7" />
        </span>
        <div>
          <h2 class="text-lg font-semibold text-highlighted">{{ deliveryFailed ? 'Account created; email delivery failed' : 'Check your inbox' }}</h2>
          <p class="mt-2 text-sm text-muted">
            <span v-if="deliveryFailed">Delivery could not be confirmed. Please request another code. </span>
            <span v-else>We emailed a </span><span class="font-medium text-highlighted">6-digit verification code</span> to
            <span class="font-medium text-highlighted">{{ registeredEmail }}</span>. Enter it to activate your account — you
            can only sign in after verifying your email. The code expires in 10 minutes.
          </p>
        </div>
        <UButton block size="lg" icon="i-lucide-key-round" :to="`/verify-email?email=${encodeURIComponent(registeredEmail)}`">
          Enter verification code
        </UButton>
        <UButton block variant="ghost" size="sm" :loading="resending" icon="i-lucide-refresh-cw" @click="resendVerification">
          Resend verification email
        </UButton>
        <NuxtLink to="/login" class="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
          <UIcon name="i-lucide-log-in" class="size-4" />
          Go to sign in
        </NuxtLink>
      </div>

      <form v-else class="space-y-5" @submit.prevent="handleRegister">
        <UAlert v-if="registrationError" color="error" icon="i-lucide-triangle-alert" title="Unable to create your account" :description="registrationError" />
        <UFormField label="Username" name="username" required>
          <UInput required v-model="username" type="text" leading-icon="i-lucide-circle-user-round" placeholder="jdoe" autocomplete="username" size="lg" :disabled="loading" autofocus :ui="{ root: 'w-full' }" />
        </UFormField>

        <UFormField label="Email" name="email" required>
          <UInput required v-model="email" type="email" leading-icon="i-lucide-mail" placeholder="you@email.com" autocomplete="email" size="lg" :disabled="loading" :ui="{ root: 'w-full' }" />
        </UFormField>

        <UFormField label="I want to use iMapSU as" name="role" required>
          <USelect v-model="role" :items="roleOptions" size="lg" :disabled="loading" />
          <p class="mt-1 text-xs text-muted">{{ roleOptions.find(option => option.value === role)?.description }}</p>
        </UFormField>

        <div class="grid gap-5 sm:grid-cols-2">
          <UFormField label="Password" name="password" required :error="attempted && !passwordCheck.ok ? 'Complete the password requirements below.' : undefined">
            <UInput required v-model="password" :type="showPassword ? 'text' : 'password'" leading-icon="i-lucide-lock" placeholder="••••••••" autocomplete="new-password" size="lg" :disabled="loading" :ui="{ root: 'w-full' }">
              <template #trailing>
                <button type="button" class="text-dimmed transition-colors hover:text-highlighted" :aria-label="showPassword ? 'Hide password' : 'Show password'" @click="showPassword = !showPassword">
                  <UIcon :name="showPassword ? 'i-lucide-eye-off' : 'i-lucide-eye'" class="size-4" />
                </button>
              </template>
            </UInput>
            <ul v-if="password" class="mt-1.5 space-y-1">
              <li
                v-for="requirement in PASSWORD_REQUIREMENTS"
                :key="requirement.key"
                class="flex items-center gap-1.5 text-xs"
                :class="passwordCheck.missing.includes(requirement.key) ? 'text-muted' : 'text-success'"
              >
                <UIcon :name="passwordCheck.missing.includes(requirement.key) ? 'i-lucide-circle' : 'i-lucide-check-circle-2'" class="size-3.5 shrink-0" />
                {{ requirement.label }}
              </li>
            </ul>
          </UFormField>

          <UFormField label="Confirm password" name="confirmPassword" required :error="attempted && password !== confirmPassword ? 'Passwords do not match.' : undefined">
            <UInput required v-model="confirmPassword" :type="showConfirmPassword ? 'text' : 'password'" leading-icon="i-lucide-lock" placeholder="••••••••" autocomplete="new-password" size="lg" :disabled="loading" :ui="{ root: 'w-full' }">
              <template #trailing>
                <button type="button" class="text-dimmed transition-colors hover:text-highlighted" :aria-label="showConfirmPassword ? 'Hide password' : 'Show password'" @click="showConfirmPassword = !showConfirmPassword">
                  <UIcon :name="showConfirmPassword ? 'i-lucide-eye-off' : 'i-lucide-eye'" class="size-4" />
                </button>
              </template>
            </UInput>
          </UFormField>
        </div>

        <UButton data-prominent="true" type="submit" block size="lg" :loading="loading">
          Create account
        </UButton>
      </form>

      <template #footer>
        <p class="text-center text-sm text-muted">
          Already have an account?
          <NuxtLink to="/login" class="font-medium text-primary hover:underline">Sign in</NuxtLink>
        </p>
      </template>
    </UCard>
  </div>
</template>
