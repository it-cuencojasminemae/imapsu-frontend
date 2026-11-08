<script setup lang="ts">
import { internalRedirect, landingPath, requiresAccountSetup, RESTRICTED_SIGN_IN, SECURITY_PATH } from '~/utils/accountNavigation'
definePageMeta({ middleware: 'guest' })
useHead({ title: 'Sign in | iMapSU' })

const auth = useAuth()
const notify = useNotify()
const route = useRoute()
const router = useRouter()
const destination = () => {
  if (requiresAccountSetup(auth.user.value)) return SECURITY_PATH
  const requested = internalRedirect(route.query.redirect)
  if (requested) {
    const resolved = router.resolve(requested)
    const roles = resolved.meta.roles as string[] | undefined
    if (resolved.matched.length && !['/', '/login', '/register', '/verify-email', '/forgot-password'].includes(resolved.path)
      && (!roles?.length || roles.includes(auth.role.value ?? ''))) return resolved.fullPath
  }
  return landingPath(auth.user.value)
}

const sessionEnded = computed(() => route.query.reason === 'session-ended')
const restricted = computed(() => route.query.reason === RESTRICTED_SIGN_IN && !!auth.user.value)
const identifier = ref('')
const password = ref('')
const showPassword = ref(false)
const loading = ref(false)
const needsVerification = ref(false)
const loginError = ref('')
const verificationEmail = ref('')
const resending = ref(false)
const authenticatorCode = ref('')
const submitMfa = async () => {
  loading.value = true
  loginError.value = ''
  try { await auth.completeMfa(authenticatorCode.value); await navigateTo(destination(), { replace: true }) }
  catch (error: any) { loginError.value = error?.data?.error?.message || 'Verification failed. Check your code.' }
  finally { loading.value = false }
}

const handleLogin = async () => {
  loginError.value = ''
  loading.value = true
  try {
    await auth.login(identifier.value, password.value)
    if (auth.mfaPending.value) return
    notify.success('Signed in successfully', { description: `Signed in as ${auth.user.value?.username}` })
    await navigateTo(destination(), { replace: true })
  } catch (error: unknown) {
    const message = (error as { data?: { error?: { message?: string } } })?.data?.error?.message
    if (message && /verify.+email|confirmed/i.test(message)) {
      needsVerification.value = true
      verificationEmail.value = identifier.value.includes('@') ? identifier.value : ''
      return
    }
    loginError.value = message ?? 'Check your credentials and try again.'
    notify.error('Sign in failed', { description: message ?? 'Check your credentials and try again.' })
  } finally {
    loading.value = false
  }
}

const resendVerification = async () => {
  if (!verificationEmail.value) return
  resending.value = true
  try {
    await auth.resendConfirmation(verificationEmail.value)
    notify.success('Verification requested', { description: 'If the account needs verification, a new code has been requested.' })
    needsVerification.value = false
  } catch {
    notify.error('Unable to resend', { description: 'Please try again in a moment.' })
  } finally {
    resending.value = false
  }
}
</script>

<template>
  <AuthShell heading="Bills, receipts and repairs for your campus stall." description="Tenants pay bills and report repairs here. Applicants follow their rental application.">
    <div class="imapsu-auth-card imapsu-auth-card--login">
      <form method="post" v-if="auth.mfaPending.value" class="space-y-5" @submit.prevent="submitMfa">
        <div>
          <h2 class="text-xl font-semibold tracking-tight text-highlighted lg:text-4xl lg:font-bold">Verify your sign-in</h2>
          <p class="mt-1 text-sm text-muted lg:mt-2 lg:text-base">Enter your authenticator code or a single-use recovery code.</p>
        </div>
        <UAlert v-if="loginError" color="error" icon="i-lucide-triangle-alert" title="Unable to sign in" :description="loginError" />
        <UFormField label="Authenticator or recovery code" name="authenticatorCode" required>
          <UInput v-model="authenticatorCode" required autocomplete="one-time-code" size="lg" :disabled="loading" autofocus :ui="{ root: 'w-full' }" />
        </UFormField>
        <UButton data-prominent="true" type="submit" block size="lg" :loading="loading">Verify sign-in</UButton>
        <div class="flex justify-center">
          <UButton variant="ghost" color="neutral" size="sm" :disabled="loading" @click="auth.mfaPending.value = false; loginError = ''">Use a different account</UButton>
        </div>
      </form>

      <template v-else>
        <h2 class="text-xl font-semibold tracking-tight text-highlighted lg:text-4xl lg:font-bold">Sign in to your account</h2>
        <p class="mt-1 text-sm text-muted lg:mt-2 lg:text-base">Access your university stall management account.</p>

        <UAlert v-if="needsVerification" color="warning" icon="i-lucide-mail-warning" variant="soft" title="Email not verified yet" class="mt-5">
          <template #description>
            <p class="text-sm">Check your inbox for the 6-digit verification code, or request a new one below.</p>
            <div class="mt-3 flex flex-col gap-2 sm:flex-row">
              <UInput v-model="verificationEmail" aria-label="Verification email address" type="email" placeholder="you@email.com" size="sm" :disabled="resending" :ui="{ root: 'w-full' }" />
              <UButton size="sm" :loading="resending" icon="i-lucide-refresh-cw" class="shrink-0 justify-center" @click="resendVerification">
                Resend code
              </UButton>
            </div>
          </template>
        </UAlert>

        <UAlert v-if="sessionEnded && !loginError" color="info" icon="i-lucide-log-in" variant="soft" title="Please sign in again" description="Your session ended because your account changed, for example when your lease became active. Sign in to continue." class="mt-5" />

        <UAlert v-if="restricted && !loginError" color="warning" icon="i-lucide-shield-alert" variant="soft" title="This page needs a different account" class="mt-5">
          <template #description>
            You are signed in as {{ auth.user.value?.username }}, which can't open this page. Sign in with an account that can, or
            <NuxtLink :to="landingPath(auth.user.value)" class="font-medium underline">go back to your dashboard</NuxtLink>.
          </template>
        </UAlert>

        <form method="post" class="mt-5 space-y-5" @submit.prevent="handleLogin">
          <UAlert v-if="loginError" color="error" icon="i-lucide-triangle-alert" title="Unable to sign in" :description="loginError" />
          <UFormField label="Email or username" name="identifier" required>
            <UInput v-model="identifier" required type="text" placeholder="you@email.com" autocomplete="username" size="lg" :disabled="loading" autofocus :ui="{ root: 'w-full' }" />
          </UFormField>

          <UFormField label="Password" name="password" required>
            <UInput v-model="password" required :type="showPassword ? 'text' : 'password'" placeholder="Enter your password" autocomplete="current-password" size="lg" :disabled="loading" :ui="{ root: 'w-full' }">
              <template #trailing>
                <button type="button" class="text-dimmed transition-colors hover:text-highlighted" :aria-label="showPassword ? 'Hide password' : 'Show password'" @click="showPassword = !showPassword">
                  <UIcon :name="showPassword ? 'i-lucide-eye-off' : 'i-lucide-eye'" class="size-4" />
                </button>
              </template>
            </UInput>
            <template #hint>
              <NuxtLink :to="{ path: '/forgot-password', query: identifier.includes('@') ? { email: identifier } : {} }" class="imapsu-auth-link text-xs">Forgot password?</NuxtLink>
            </template>
          </UFormField>

          <UButton data-prominent="true" type="submit" block size="lg" :loading="loading">
            Sign in
          </UButton>
        </form>
      </template>

      <hr class="imapsu-auth-rule" />
      <p class="text-center text-sm text-muted">
        No account yet?
        <NuxtLink to="/register" class="imapsu-auth-link">Create one</NuxtLink>
      </p>
      <div class="mt-3 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs whitespace-nowrap sm:gap-x-3 sm:text-sm">
        <NuxtLink to="/" class="imapsu-auth-link inline-flex items-center gap-1.5">
          <UIcon name="i-lucide-arrow-left" class="size-3.5" />
          Back to home
        </NuxtLink>
        <span class="text-dimmed max-[339px]:hidden" aria-hidden="true">|</span>
        <NuxtLink to="/privacy" class="imapsu-auth-link">Data Privacy Notice</NuxtLink>
      </div>
    </div>
  </AuthShell>
</template>
