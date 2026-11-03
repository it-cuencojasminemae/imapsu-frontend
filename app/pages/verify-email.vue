<script setup lang="ts">
import type { User } from '~/types/auth'
import { landingPath } from '~/utils/accountNavigation'

definePageMeta({
  title: 'Verify your email',
  description: 'Enter the verification code to activate your iMapSU account.',
  middleware: 'guest',
  // Each state has its own root, which would replay the route fade on every change.
  pageTransition: false
})

const route = useRoute()
const auth = useAuth()
const toast = useToast()

const OTP_LENGTH = 6
const RESEND_COOLDOWN_SECONDS = 90

const email = ref('')
const digits = ref<string[]>(Array(OTP_LENGTH).fill(''))
const inputRefs = ref<(HTMLElement | null)[]>([])
const verifying = ref(false)
const resending = ref(false)
const resendCooldown = ref(0)
const verifiedUser = ref<User | null>(null)
const errorMessage = ref('')

let cooldownTimer: ReturnType<typeof setInterval> | null = null

const code = computed(() => digits.value.join(''))
const codeComplete = computed(() => code.value.length === OTP_LENGTH)

const queryEmail = Array.isArray(route.query.email) ? route.query.email[0] : (route.query.email as string | undefined)
if (queryEmail) {
  email.value = queryEmail
} else if (auth.user.value?.email) {
  email.value = auth.user.value.email
}

function setInputRef(idx: number, el: unknown) {
  inputRefs.value[idx] = (el as HTMLElement | null) ?? null
}

function focusInput(idx: number) {
  const el = inputRefs.value[idx]
  if (el) {
    el.focus()
    el.select?.()
  }
}

function onDigitInput(idx: number, value: string) {
  const cleaned = value.replace(/[^0-9]/g, '').slice(-1)
  const next = [...digits.value]
  next[idx] = cleaned
  digits.value = next
  if (cleaned && idx < OTP_LENGTH - 1) {
    focusInput(idx + 1)
  }
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

function onDigitPaste(_idx: number, event: ClipboardEvent) {
  event.preventDefault()
  const pasted = event.clipboardData?.getData('text').replace(/[^0-9]/g, '').slice(0, OTP_LENGTH) ?? ''
  if (!pasted) return
  digits.value = Array(OTP_LENGTH)
    .fill('')
    .map((_, i) => pasted[i] ?? '')
  focusInput(Math.min(pasted.length, OTP_LENGTH - 1))
}

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

const verify = async () => {
  errorMessage.value = ''
  if (!email.value.includes('@')) {
    errorMessage.value = 'No email address to verify. Open this page from the registration screen.'
    return
  }
  if (!codeComplete.value) {
    errorMessage.value = 'Enter the 6-digit verification code from your email.'
    return
  }

  verifying.value = true
  try {
    verifiedUser.value = await auth.confirmEmail(email.value, code.value)
    toast.add({ title: 'Email verified', description: 'Your account is now active. You can now sign in to access campus services.', color: 'success', icon: 'i-lucide-mail-check' })
  } catch (error: unknown) {
    errorMessage.value = (error as { data?: { error?: { message?: string } } })?.data?.error?.message
      ?? 'We could not verify that code. It may be incorrect or expired.'
    digits.value = Array(OTP_LENGTH).fill('')
    focusInput(0)
  } finally {
    verifying.value = false
  }
}

const resend = async () => {
  if (resendCooldown.value > 0) return
  errorMessage.value = ''
  resending.value = true
  try {
    await auth.resendConfirmation(email.value)
    toast.add({ title: 'New code sent', description: `A fresh verification code was sent to ${email.value}.`, color: 'success', icon: 'i-lucide-mail-check' })
    startResendCooldown()
  } catch {
    toast.add({ title: 'Unable to resend', description: 'Please try again in a moment.', color: 'error', icon: 'i-lucide-triangle-alert' })
  } finally {
    resending.value = false
  }
}

const goToDashboard = async () => {
  await navigateTo(landingPath(verifiedUser.value), { replace: true })
}

const { bounced, start: watchForBounce } = useEmailBounceWatch(() => email.value)

onMounted(() => {
  focusInput(0)
  startResendCooldown()
  if (email.value) watchForBounce()
})

onBeforeUnmount(() => {
  if (cooldownTimer) clearInterval(cooldownTimer)
})

watch(code, (value) => {
  if (value.length === OTP_LENGTH && !verifiedUser.value && !verifying.value) {
    verify()
  }
})
</script>

<template>
  <AuthShell
    v-if="verifiedUser"
    variant="center"
    heading="Your email is verified"
    description="Your account is now active and you're signed in."
  >
    <div class="space-y-5">
      <AuthEmailStatus tone="success" :label="`Hello, ${verifiedUser.username}! This address is now confirmed:`" :email="email" />
      <UButton data-prominent="true" block size="xl" trailing-icon="i-lucide-arrow-right" @click="goToDashboard">Continue to your dashboard</UButton>
    </div>
  </AuthShell>

  <AuthShell
    v-else-if="bounced"
    variant="center"
    heading="This email address can't receive mail"
    description="The mail server rejected our verification code, so the address may not exist. Your registration was cancelled."
  >
    <div class="space-y-5">
      <AuthEmailStatus tone="error" label="We could not deliver the code to" :email="email" hint="Check the spelling, or register with another address." />
      <UButton data-prominent="true" block size="xl" to="/register">Register with a different email</UButton>
    </div>
    <template #footer>
      <NuxtLink to="/login" class="imapsu-auth-link flex items-center justify-center gap-2">
        <UIcon name="i-lucide-arrow-left" class="size-4" />
        Back to sign in
      </NuxtLink>
    </template>
  </AuthShell>

  <AuthShell
    v-else
    variant="center"
    heading="Verify your email"
    description="We need to confirm that your email address is valid before you can create an account."
  >
    <form method="post" class="space-y-5" @submit.prevent="verify">
      <UAlert v-if="errorMessage" color="error" icon="i-lucide-triangle-alert" :description="errorMessage" />

      <AuthEmailStatus v-if="email" label="A 6-digit verification code was sent to" :email="email" hint="Enter the code to continue with your registration. It expires in 10 minutes." />
      <UAlert
        v-else
        color="warning"
        icon="i-lucide-mail-question"
        title="No email address found"
        description="Open the verification link from the registration page, or sign in to request a new code."
      />

      <UFormField label="Verification code" name="code" required>
        <div class="mx-auto grid max-w-sm grid-cols-6 gap-2 sm:gap-3" role="group" aria-label="6-digit verification code">
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
            class="h-14 w-full min-w-0 rounded-xl border border-accented bg-elevated text-center text-xl font-semibold tracking-wide text-highlighted outline-none transition-all placeholder:text-dimmed/40 focus:border-primary focus:ring-4 focus:ring-primary/15 disabled:opacity-50"
            :class="digits[idx] ? 'border-primary' : ''"
            :disabled="verifying"
            :aria-label="`Digit ${idx + 1}`"
            @input="onDigitInput(idx, ($event.target as HTMLInputElement).value)"
            @keydown="onDigitKeydown(idx, $event)"
            @paste="onDigitPaste(idx, $event)"
          />
        </div>
      </UFormField>

      <UButton data-prominent="true" type="submit" block size="xl" :loading="verifying" :disabled="!codeComplete">
        Verify &amp; activate account
      </UButton>

      <AuthResendButton :cooldown="resendCooldown" :loading="resending" :disabled="!email" @click="resend" />
    </form>

    <template #footer>
      <div class="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm">
        <NuxtLink to="/register" class="imapsu-auth-link inline-flex items-center gap-2">
          <UIcon name="i-lucide-arrow-left" class="size-4" />
          Back to registration
        </NuxtLink>
        <span class="text-dimmed" aria-hidden="true">|</span>
        <NuxtLink to="/login" class="imapsu-auth-link">Sign in</NuxtLink>
      </div>
    </template>
  </AuthShell>
</template>