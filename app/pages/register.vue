<script setup lang="ts">
// Each sign-up state has its own root, which would replay the route fade on every change.
definePageMeta({ middleware: 'guest', pageTransition: false })
useHead({ title: 'Create Account | iMapSU' })

const auth = useAuth()
const toast = useToast()

const username = ref('')
const email = ref('')
const fullName = ref('')
const contactNumber = ref('')
const businessName = ref('')
const password = ref('')
const confirmPassword = ref('')
const showPassword = ref(false)
const showConfirmPassword = ref(false)
const role = ref('student')
const privacyConsent = ref(false)
const privacyOpen = ref(false)
const loading = ref(false)
const registeredEmail = ref('')
const deliveryFailed = ref(false)
const resending = ref(false)
const registrationError = ref('')
const attempted = ref(false)
const RESEND_COOLDOWN_SECONDS = 90
const resendCooldown = ref(0)

let cooldownTimer: ReturnType<typeof setInterval> | null = null

function startResendCooldown(seconds = RESEND_COOLDOWN_SECONDS) {
  resendCooldown.value = seconds
  if (cooldownTimer) clearInterval(cooldownTimer)
  cooldownTimer = setInterval(() => {
    resendCooldown.value -= 1
    if (resendCooldown.value <= 0 && cooldownTimer) {
      clearInterval(cooldownTimer)
      cooldownTimer = null
    }
  }, 1000)
}

onBeforeUnmount(() => {
  if (cooldownTimer) clearInterval(cooldownTimer)
})

const { bounced, start: watchForBounce, stop: stopBounceWatch } = useEmailBounceWatch(() => registeredEmail.value)

const useDifferentEmail = () => {
  stopBounceWatch()
  bounced.value = false
  registeredEmail.value = ''
  email.value = ''
}

// The pending account keeps its email and username until it is verified or removed,
// so returning to the form with those details has to say why they are refused.
const pendingEmail = ref('')
const backToRegistration = () => {
  stopBounceWatch()
  pendingEmail.value = registeredEmail.value
  registeredEmail.value = ''
}

const panelFeatures = ['Explore campus stalls', 'Apply for rental spaces', 'Get announcements & updates']

// Phones open on a short introduction; from 1024px up the form is always beside the panel.
const showMobileForm = ref(false)
const formCard = useTemplateRef<HTMLElement>('formCard')
const openMobileForm = async () => {
  showMobileForm.value = true
  await nextTick()
  window.scrollTo({ top: 0 })
  formCard.value?.focus({ preventScroll: true })
}

const roleOptions = [
  { label: 'Student', value: 'student', description: 'View the map and submit feedback about tenants.' },
  { label: 'Aspiring Tenant', value: 'aspiring-tenant', description: 'Browse vacant spaces and apply to rent one.' }
]

const passwordCheck = computed(() => checkPasswordStrength(password.value))
const passwordsMatch = computed(() => password.value === confirmPassword.value)
// Flag a mismatch live once the user starts typing the confirmation, not only after submitting.
const confirmPasswordError = computed(() =>
  (confirmPassword.value || attempted.value) && !passwordsMatch.value ? 'Passwords do not match.' : undefined
)

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

  if (!passwordsMatch.value) {
    toast.add({ title: 'Passwords do not match', color: 'error', icon: 'i-lucide-triangle-alert' })
    return
  }

  if (!privacyConsent.value) {
    toast.add({ title: 'Consent required', description: 'Please read and agree to the Data Privacy Notice to create an account.', color: 'error', icon: 'i-lucide-triangle-alert' })
    return
  }

  loading.value = true
  try {
    const result = await auth.register({
      username: username.value,
      email: email.value,
      password: password.value,
      role: role.value,
      fullName: fullName.value,
      contactNumber: contactNumber.value,
      privacyConsent: true,
      ...(role.value === 'student' ? {} : { businessName: businessName.value })
    })
    deliveryFailed.value = result.verificationEmailSent === false
    pendingEmail.value = ''
    registeredEmail.value = email.value
    if (!deliveryFailed.value) startResendCooldown()
    watchForBounce()
  } catch (error: unknown) {
    const message = (error as { data?: { error?: { message?: string } } })?.data?.error?.message
    registrationError.value = message ?? 'Unable to complete the request. Please try again.'
    toast.add({ title: 'Registration failed', description: message ?? 'Unable to complete the request. Please try again.', color: 'error', icon: 'i-lucide-triangle-alert' })
  } finally {
    loading.value = false
  }
}

const resendVerification = async () => {
  if (!registeredEmail.value || resendCooldown.value > 0) return
  resending.value = true
  try {
    await auth.resendConfirmation(registeredEmail.value)
    toast.add({ title: 'Verification requested', description: 'If the account needs verification, a new code has been requested.', color: 'success', icon: 'i-lucide-mail-check' })
    startResendCooldown()
  } catch {
    toast.add({ title: 'Unable to resend', description: 'Please try again in a moment.', color: 'error', icon: 'i-lucide-triangle-alert' })
  } finally {
    resending.value = false
  }
}
</script>

<template>
  <AuthShell
    v-if="bounced"
    variant="center"
    heading="This email address can't receive mail"
    description="The mail server rejected our verification code, so the address may not exist. Your registration was cancelled."
  >
    <div class="space-y-5">
      <AuthEmailStatus tone="error" label="We could not deliver the code to" :email="registeredEmail" hint="Check the spelling, or register with another address." />
      <UButton data-prominent="true" block size="xl" @click="useDifferentEmail">Use a different email</UButton>
    </div>
    <template #footer>
      <NuxtLink to="/login" class="imapsu-auth-link flex items-center justify-center gap-2">
        <UIcon name="i-lucide-arrow-left" class="size-4" />
        Back to sign in
      </NuxtLink>
    </template>
  </AuthShell>

  <AuthShell
    v-else-if="registeredEmail"
    variant="center"
    heading="Verify your email"
    description="We need to confirm that your email address is valid before you can create an account."
  >
    <div class="space-y-5">
      <AuthEmailStatus
        v-if="deliveryFailed"
        tone="warning"
        label="We could not confirm delivery to"
        :email="registeredEmail"
        hint="Please request another code below."
      />
      <AuthEmailStatus
        v-else
        label="A 6-digit verification code was sent to"
        :email="registeredEmail"
        hint="Enter the code to continue with your registration."
      />
      <UButton data-prominent="true" block size="xl" :to="`/verify-email?email=${encodeURIComponent(registeredEmail)}`">
        Enter verification code
      </UButton>
      <AuthResendButton :cooldown="resendCooldown" :loading="resending" @click="resendVerification" />
    </div>
    <template #footer>
      <button type="button" class="imapsu-auth-link flex w-full items-center justify-center gap-2" @click="backToRegistration">
        <UIcon name="i-lucide-arrow-left" class="size-4" />
        Back to registration
      </button>
    </template>
  </AuthShell>

  <AuthShell
    v-else
    heading="Create your account"
    description="Join iMapSU to explore the campus map, find rentable spaces, and manage stall applications."
    :features="panelFeatures"
    :compact="showMobileForm"
  >
    <div v-if="!showMobileForm" class="imapsu-auth-card lg:hidden">
      <UButton data-prominent="true" block size="xl" @click="openMobileForm">Create account</UButton>
      <p class="mt-4 text-center text-sm text-muted">
        Already have an account?
        <NuxtLink to="/login" class="imapsu-auth-link">Sign in</NuxtLink>
      </p>
    </div>

    <div ref="formCard" tabindex="-1" class="imapsu-auth-card imapsu-auth-card--open outline-none lg:block" :class="showMobileForm ? 'block' : 'hidden'">
      <h2 class="hidden text-4xl font-bold tracking-tight text-white lg:block">Create your account</h2>
      <p class="text-base text-muted lg:mt-2">Fill in the information below to get started with iMapSU.</p>

      <form method="post" class="mt-6 space-y-4" @submit.prevent="handleRegister">
        <UAlert v-if="registrationError" color="error" icon="i-lucide-triangle-alert" title="Unable to create your account" :description="registrationError" />
        <UAlert v-if="pendingEmail" color="info" variant="soft" icon="i-lucide-mail-question" title="Your account is still waiting for verification">
          <template #description>
            The email and username you used for {{ pendingEmail }} stay reserved for up to 24 hours, so use different ones to register again, or
            <NuxtLink :to="`/verify-email?email=${encodeURIComponent(pendingEmail)}`" class="font-medium underline">enter your code</NuxtLink>.
          </template>
        </UAlert>

        <UFormField label="I want to use iMapSU as" name="role" required>
          <USelect v-model="role" :items="roleOptions" size="lg" :disabled="loading" :portal="false" :ui="{ content: 'z-50' }" class="w-full" />
        </UFormField>

        <UFormField label="Full Name" name="fullName" required>
          <UInput required v-model="fullName" type="text" placeholder="Juan Dela Cruz" autocomplete="name" size="lg" :disabled="loading" autofocus :ui="{ root: 'w-full' }" />
        </UFormField>

        <div class="grid gap-4 min-[375px]:grid-cols-2">
          <UFormField label="Username" name="username" required>
            <UInput required v-model="username" type="text" placeholder="e.g. jdoe" autocomplete="username" size="lg" :disabled="loading" :ui="{ root: 'w-full' }" />
          </UFormField>

          <UFormField label="Email Address" name="email" required>
            <UInput required v-model="email" type="email" placeholder="you@email.com" autocomplete="email" size="lg" :disabled="loading" :ui="{ root: 'w-full' }" />
          </UFormField>
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField label="Contact Number" name="contactNumber" required :class="{ 'sm:col-span-2': role === 'student' }">
            <UInput required v-model="contactNumber" type="tel" placeholder="0917 000 0000" autocomplete="tel" size="lg" :disabled="loading" :ui="{ root: 'w-full' }" />
          </UFormField>

          <UFormField v-if="role !== 'student'" label="Business Name" name="businessName" hint="Optional">
            <UInput v-model="businessName" type="text" placeholder="Store or trade name" autocomplete="organization" size="lg" :disabled="loading" :ui="{ root: 'w-full' }" />
          </UFormField>
        </div>

        <div class="grid gap-4 min-[375px]:grid-cols-2">
          <UFormField label="Password" name="password" required :error="attempted && !passwordCheck.ok ? 'Complete the password requirements below.' : undefined">
            <UInput required v-model="password" :type="showPassword ? 'text' : 'password'" placeholder="••••••••" autocomplete="new-password" size="lg" :disabled="loading" :ui="{ root: 'w-full' }">
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

          <UFormField label="Confirm Password" name="confirmPassword" required :error="confirmPasswordError">
            <UInput required v-model="confirmPassword" :type="showConfirmPassword ? 'text' : 'password'" placeholder="••••••••" autocomplete="new-password" size="lg" :disabled="loading" :ui="{ root: 'w-full' }">
              <template #trailing>
                <button type="button" class="text-dimmed transition-colors hover:text-highlighted" :aria-label="showConfirmPassword ? 'Hide password' : 'Show password'" @click="showConfirmPassword = !showConfirmPassword">
                  <UIcon :name="showConfirmPassword ? 'i-lucide-eye-off' : 'i-lucide-eye'" class="size-4" />
                </button>
              </template>
            </UInput>
            <p v-if="confirmPassword && passwordsMatch" class="mt-1.5 flex items-center gap-1.5 text-xs text-success">
              <UIcon name="i-lucide-check-circle-2" class="size-3.5 shrink-0" />
              Passwords match
            </p>
          </UFormField>
        </div>

        <UFormField name="privacyConsent" :error="attempted && !privacyConsent ? 'You must agree to the Data Privacy Notice.' : undefined">
          <UCheckbox v-model="privacyConsent" :disabled="loading" size="lg">
            <template #label>
              <span class="text-sm text-default">
                I have read the
                <button type="button" class="imapsu-auth-link underline" @click.prevent="privacyOpen = true">Data Privacy Notice</button>
                and agree to iMapSU collecting and using my personal data as described, in line with the Data Privacy Act of 2012 (RA 10173).
              </span>
            </template>
          </UCheckbox>
        </UFormField>

        <UButton data-prominent="true" type="submit" block size="xl" :loading="loading">
          Create account
        </UButton>
      </form>

      <p class="mt-5 text-center text-sm text-muted">
        Already have an account?
        <NuxtLink to="/login" class="imapsu-auth-link">Sign in</NuxtLink>
      </p>
    </div>

    <UModal v-model:open="privacyOpen" :portal="false" title="Data Privacy Notice" description="How iMapSU collects, uses and protects your personal data." :ui="{ content: 'max-w-2xl' }">
      <template #body>
        <PrivacyNotice />
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton variant="ghost" color="neutral" @click="privacyOpen = false">Close</UButton>
          <UButton icon="i-lucide-check" @click="privacyConsent = true; privacyOpen = false">I agree</UButton>
        </div>
      </template>
    </UModal>
  </AuthShell>
</template>

