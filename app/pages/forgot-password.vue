<script setup lang="ts">
useHead({ title: 'Reset Password | iMapSU' })

const route = useRoute()
const auth = useAuth()
const toast = useToast()

const OTP_LENGTH = 6

const step = ref<'request' | 'reset' | 'done'>('request')
const email = ref('')
const digits = ref<string[]>(Array(OTP_LENGTH).fill(''))
const inputRefs = ref<(HTMLElement | null)[]>([])
const password = ref('')
const confirmPassword = ref('')
const showPassword = ref(false)
const showConfirmPassword = ref(false)
const loading = ref(false)
const resending = ref(false)
const resendCooldown = ref(0)
const attempted = ref(false)
const errorMessage = ref('')

let cooldownTimer: ReturnType<typeof setInterval> | null = null

const code = computed(() => digits.value.join(''))
const codeComplete = computed(() => code.value.length === OTP_LENGTH)
const passwordCheck = computed(() => checkPasswordStrength(password.value))

const queryEmail = Array.isArray(route.query.email) ? route.query.email[0] : route.query.email
if (typeof queryEmail === 'string') email.value = queryEmail

const messageOf = (error: unknown, fallback: string) =>
  (error as { data?: { error?: { message?: string } } })?.data?.error?.message ?? fallback

function setInputRef(idx: number, el: unknown) {
  inputRefs.value[idx] = (el as HTMLElement | null) ?? null
}

function focusInput(idx: number) {
  const el = inputRefs.value[idx]
  if (el) {
    el.focus()
    ;(el as HTMLInputElement).select?.()
  }
}

function onDigitInput(idx: number, value: string) {
  const cleaned = value.replace(/[^0-9]/g, '').slice(-1)
  const next = [...digits.value]
  next[idx] = cleaned
  digits.value = next
  if (cleaned && idx < OTP_LENGTH - 1) focusInput(idx + 1)
}

function onDigitKeydown(idx: number, event: KeyboardEvent) {
  if (event.key === 'Backspace') {
    if (!digits.value[idx] && idx > 0) {
      event.preventDefault()
      focusInput(idx - 1)
    }
  } else if (event.key === 'ArrowLeft' && idx > 0) {
    event.preventDefault()
    focusInput(idx - 1)
  } else if (event.key === 'ArrowRight' && idx < OTP_LENGTH - 1) {
    event.preventDefault()
    focusInput(idx + 1)
  }
}

function onDigitPaste(event: ClipboardEvent) {
  event.preventDefault()
  const pasted = event.clipboardData?.getData('text').replace(/[^0-9]/g, '').slice(0, OTP_LENGTH) ?? ''
  if (!pasted) return
  digits.value = Array(OTP_LENGTH).fill('').map((_, i) => pasted[i] ?? '')
  focusInput(Math.min(pasted.length, OTP_LENGTH - 1))
}

// The server accepts one code request per minute for each address.
function startResendCooldown(seconds = 60) {
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

const requestCode = async () => {
  errorMessage.value = ''
  if (!email.value.includes('@')) {
    errorMessage.value = 'Enter the email address on your account.'
    return
  }
  loading.value = true
  try {
    await auth.requestPasswordReset(email.value)
    step.value = 'reset'
    startResendCooldown()
    await nextTick()
    focusInput(0)
  } catch (error: unknown) {
    errorMessage.value = messageOf(error, 'We could not send a reset code. Please try again in a moment.')
  } finally {
    loading.value = false
  }
}

const resend = async () => {
  if (resendCooldown.value > 0) return
  errorMessage.value = ''
  resending.value = true
  try {
    await auth.requestPasswordReset(email.value)
    digits.value = Array(OTP_LENGTH).fill('')
    toast.add({ title: 'Code requested', description: 'If an active account uses this email, a new code is on its way. Earlier codes no longer work.', color: 'success', icon: 'i-lucide-mail-check' })
    startResendCooldown()
  } catch (error: unknown) {
    errorMessage.value = messageOf(error, 'Unable to send another code. Please try again in a moment.')
  } finally {
    resending.value = false
  }
}

const resetPassword = async () => {
  attempted.value = true
  errorMessage.value = ''
  if (!codeComplete.value) {
    errorMessage.value = 'Enter the 6-digit reset code from your email.'
    return
  }
  if (!passwordCheck.value.ok) {
    errorMessage.value = `Password must contain ${PASSWORD_REQUIREMENTS.filter(requirement => passwordCheck.value.missing.includes(requirement.key)).map(requirement => requirement.label.toLowerCase()).join(', ')}.`
    return
  }
  if (password.value !== confirmPassword.value) {
    errorMessage.value = 'Passwords do not match.'
    return
  }
  loading.value = true
  try {
    await auth.resetPassword(email.value, code.value, password.value)
    password.value = ''
    confirmPassword.value = ''
    step.value = 'done'
  } catch (error: unknown) {
    errorMessage.value = messageOf(error, 'We could not reset your password. The code may be incorrect or expired.')
    if (/code/i.test(errorMessage.value)) {
      digits.value = Array(OTP_LENGTH).fill('')
      focusInput(0)
    }
  } finally {
    loading.value = false
  }
}

const changeEmail = () => {
  step.value = 'request'
  digits.value = Array(OTP_LENGTH).fill('')
  errorMessage.value = ''
  attempted.value = false
}

onBeforeUnmount(() => {
  if (cooldownTimer) clearInterval(cooldownTimer)
})
</script>

<template>
  <div class="imapsu-auth">
    <UCard class="w-full max-w-md ring-1 ring-default" :ui="{ body: 'p-6 sm:p-8' }">
      <template #header>
        <div class="flex flex-col items-center text-center">
          <span class="imapsu-brand-tile mb-4 grid size-12 place-items-center rounded-xl shadow-sm">
            <UIcon name="i-lucide-key-round" class="size-6" />
          </span>
          <h1 class="text-2xl font-bold tracking-tight text-highlighted">Reset your password</h1>
          <p class="mt-1 text-sm text-muted">
            {{ step === 'request' ? 'We will email you a 6-digit code to confirm it is you.' : step === 'reset' ? 'Enter the code and choose a new password.' : 'You can now sign in with your new password.' }}
          </p>
        </div>
      </template>

      <div v-if="step === 'done'" class="space-y-5 text-center">
        <span class="mx-auto grid size-14 place-items-center rounded-full bg-success/10 text-success">
          <UIcon name="i-lucide-shield-check" class="size-7" />
        </span>
        <div>
          <h2 class="text-lg font-semibold text-highlighted">Password updated</h2>
          <p class="mt-1 text-sm text-muted">For your security, every device that was signed in to your account has been signed out.</p>
        </div>
        <UButton block size="lg" icon="i-lucide-log-in" :to="{ path: '/login' }">Sign in</UButton>
      </div>

      <form v-else-if="step === 'request'" class="space-y-5" @submit.prevent="requestCode">
        <UAlert v-if="errorMessage" color="error" icon="i-lucide-triangle-alert" :description="errorMessage" />
        <UFormField label="Email address" name="email" required>
          <UInput v-model="email" required type="email" leading-icon="i-lucide-mail" placeholder="you@email.com" autocomplete="email" size="lg" :disabled="loading" autofocus :ui="{ root: 'w-full' }" />
        </UFormField>
        <UButton data-prominent="true" type="submit" block size="lg" icon="i-lucide-send" :loading="loading">
          Send reset code
        </UButton>
      </form>

      <form v-else class="space-y-5" @submit.prevent="resetPassword">
        <UAlert color="info" variant="soft" icon="i-lucide-mail" :description="`If an active account uses ${email}, we sent a reset code to it. Check your spam folder too.`" />
        <UAlert v-if="errorMessage" color="error" icon="i-lucide-triangle-alert" :description="errorMessage" />

        <UFormField label="Reset code" name="code" required>
          <div class="flex items-center justify-center gap-2 sm:gap-3" role="group" aria-label="6-digit reset code">
            <input
              v-for="(_, idx) in OTP_LENGTH"
              :key="idx"
              :ref="(el) => setInputRef(idx, el)"
              :value="digits[idx]"
              type="text"
              inputmode="numeric"
              autocomplete="one-time-code"
              maxlength="1"
              placeholder="0"
              class="h-14 w-11 rounded-xl border border-default bg-elevated text-center text-xl font-semibold tracking-wide text-highlighted outline-none transition-all placeholder:text-dimmed/40 focus:border-primary focus:ring-4 focus:ring-primary/15 disabled:opacity-50 sm:w-12"
              :class="digits[idx] ? 'border-primary' : ''"
              :disabled="loading"
              :aria-label="`Digit ${idx + 1}`"
              @input="onDigitInput(idx, ($event.target as HTMLInputElement).value)"
              @keydown="onDigitKeydown(idx, $event)"
              @paste="onDigitPaste"
            />
          </div>
          <p class="mt-2 text-center text-xs text-muted">The code expires in 10 minutes and works once.</p>
        </UFormField>

        <UFormField label="New password" name="password" required :error="attempted && !passwordCheck.ok ? 'Complete the password requirements below.' : undefined">
          <UInput v-model="password" required :type="showPassword ? 'text' : 'password'" leading-icon="i-lucide-lock" placeholder="••••••••" autocomplete="new-password" size="lg" :disabled="loading" :ui="{ root: 'w-full' }">
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

        <UFormField label="Confirm new password" name="confirmPassword" required :error="attempted && password !== confirmPassword ? 'Passwords do not match.' : undefined">
          <UInput v-model="confirmPassword" required :type="showConfirmPassword ? 'text' : 'password'" leading-icon="i-lucide-lock" placeholder="••••••••" autocomplete="new-password" size="lg" :disabled="loading" :ui="{ root: 'w-full' }">
            <template #trailing>
              <button type="button" class="text-dimmed transition-colors hover:text-highlighted" :aria-label="showConfirmPassword ? 'Hide password' : 'Show password'" @click="showConfirmPassword = !showConfirmPassword">
                <UIcon :name="showConfirmPassword ? 'i-lucide-eye-off' : 'i-lucide-eye'" class="size-4" />
              </button>
            </template>
          </UInput>
        </UFormField>

        <UButton data-prominent="true" type="submit" block size="lg" icon="i-lucide-shield-check" :loading="loading">
          Reset password
        </UButton>

        <div class="flex flex-wrap items-center justify-center gap-1.5 text-sm">
          <UButton variant="ghost" size="sm" :loading="resending" :disabled="resendCooldown > 0 || loading" @click="resend">
            {{ resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : 'Resend code' }}
          </UButton>
          <UButton variant="ghost" size="sm" color="neutral" :disabled="loading" @click="changeEmail">Use a different email</UButton>
        </div>
      </form>

      <template #footer>
        <div class="flex items-center justify-center gap-1.5 text-sm text-muted">
          <UIcon name="i-lucide-arrow-left" class="size-3.5" />
          <NuxtLink to="/login" class="font-medium text-primary hover:underline">Back to sign in</NuxtLink>
        </div>
      </template>
    </UCard>
  </div>
</template>
