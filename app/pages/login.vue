<script setup lang="ts">
import { internalRedirect, landingPath, requiresAccountSetup, SECURITY_PATH } from '~/utils/accountNavigation'
useHead({ title: 'Sign In | iMapSU' })

const auth = useAuth()
const toast = useToast()
const route = useRoute()
const router = useRouter()
const destination = () => {
  if (requiresAccountSetup(auth.user.value)) return SECURITY_PATH
  const requested = internalRedirect(route.query.redirect)
  if (requested) {
    const resolved = router.resolve(requested)
    const roles = resolved.meta.roles as string[] | undefined
    if (resolved.matched.length && !['/', '/login', '/register', '/verify-email'].includes(resolved.path)
      && (!roles?.length || roles.includes(auth.role.value ?? ''))) return resolved.fullPath
  }
  return landingPath(auth.user.value)
}

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
  try { await auth.completeMfa(authenticatorCode.value); await navigateTo(destination()) }
  catch (error: any) { loginError.value = error?.data?.error?.message || 'Verification failed. Check your code.' }
  finally { loading.value = false }
}

const handleLogin = async () => {
  loginError.value = ''
  loading.value = true
  try {
    await auth.login(identifier.value, password.value)
    if (auth.mfaPending.value) return
    toast.add({ title: 'Signed in successfully', description: `Signed in as ${auth.user.value?.username}`, color: 'success', icon: 'i-lucide-check-circle-2' })
    await navigateTo(destination())
  } catch (error: unknown) {
    const message = (error as { data?: { error?: { message?: string } } })?.data?.error?.message
    if (message && /verify.+email|confirmed/i.test(message)) {
      needsVerification.value = true
      verificationEmail.value = identifier.value.includes('@') ? identifier.value : ''
      return
    }
    loginError.value = message ?? 'Check your credentials and try again.'
    toast.add({ title: 'Sign in failed', description: message ?? 'Check your credentials and try again.', color: 'error', icon: 'i-lucide-triangle-alert' })
  } finally {
    loading.value = false
  }
}

const resendVerification = async () => {
  if (!verificationEmail.value) return
  resending.value = true
  try {
    await auth.resendConfirmation(verificationEmail.value)
    toast.add({ title: 'Verification requested', description: 'If the account needs verification, a new code has been requested.', color: 'success', icon: 'i-lucide-mail-check' })
    needsVerification.value = false
  } catch {
    toast.add({ title: 'Unable to resend', description: 'Please try again in a moment.', color: 'error', icon: 'i-lucide-triangle-alert' })
  } finally {
    resending.value = false
  }
}
</script>

<template>
  <div>

    <div class="imapsu-auth">
      <UCard :ui="{ root: 'shadow-none ring-1 ring-default', header: 'px-6 pb-4 pt-8 sm:px-8', body: 'px-6 pb-6 sm:px-8', footer: 'px-6 pb-8 sm:px-8' }">
        <form v-if="auth.mfaPending.value" class="mb-6 space-y-4" @submit.prevent="submitMfa">
          <h2 class="text-lg font-semibold">Verify your sign-in</h2>
          <p class="text-sm text-muted">Enter your authenticator code or a single-use recovery code.</p>
          <UFormField label="Authenticator or recovery code"><UInput v-model="authenticatorCode" autocomplete="one-time-code" /></UFormField>
          <UButton type="submit" label="Verify sign-in" :loading="loading" />
        </form>
        <template #header>
          <div class="flex flex-col items-center text-center">
            <BrandLogo size="size-16" />
            <h1 class="mt-4 text-2xl font-bold tracking-tight text-highlighted">Sign in to iMapSU</h1>
            <p class="mt-1 text-sm text-muted">Access your university stall management account.</p>
          </div>
        </template>

        <UAlert v-if="needsVerification" color="warning" icon="i-lucide-mail-warning" variant="soft" title="Email not verified yet" class="mb-5">
          <template #description>
            <p class="text-sm">Check your inbox for the 6-digit verification code, or request a new one below.</p>
            <div class="mt-3 flex flex-col gap-2 sm:flex-row">
              <UInput v-model="verificationEmail" aria-label="Verification email address" type="email" placeholder="you@email.com" size="sm" :disabled="resending" :ui="{ root: 'w-full' }" />
              <UButton size="sm" :loading="resending" icon="i-lucide-refresh-cw" @click="resendVerification">
                Resend code
              </UButton>
            </div>
          </template>
        </UAlert>

        <form class="space-y-5" @submit.prevent="handleLogin">
          <UAlert v-if="loginError" color="error" icon="i-lucide-triangle-alert" title="Unable to sign in" :description="loginError" />
          <UFormField label="Email or username" name="identifier" required>
            <UInput v-model="identifier" required type="text" leading-icon="i-lucide-mail" placeholder="you@email.com" autocomplete="username" size="lg" :disabled="loading" autofocus :ui="{ root: 'w-full' }" />
          </UFormField>

          <UFormField label="Password" name="password" required>
            <UInput v-model="password" required :type="showPassword ? 'text' : 'password'" leading-icon="i-lucide-lock" placeholder="••••••••" autocomplete="current-password" size="lg" :disabled="loading" :ui="{ root: 'w-full' }">
              <template #trailing>
                <button type="button" class="text-dimmed transition-colors hover:text-highlighted" :aria-label="showPassword ? 'Hide password' : 'Show password'" @click="showPassword = !showPassword">
                  <UIcon :name="showPassword ? 'i-lucide-eye-off' : 'i-lucide-eye'" class="size-4" />
                </button>
              </template>
            </UInput>
          </UFormField>

          <UButton data-prominent="true" type="submit" block size="lg" icon="i-lucide-log-in" :loading="loading">
            Sign in
          </UButton>
        </form>

        <template #footer>
          <div class="space-y-3">
            <p class="text-center text-sm text-muted">
              No account yet?
              <NuxtLink to="/register" class="font-medium text-primary hover:underline">Create one</NuxtLink>
            </p>
            <div class="flex items-center justify-center gap-1.5 text-sm text-muted">
              <UIcon name="i-lucide-arrow-left" class="size-3.5" />
              <NuxtLink to="/campus-map" class="font-medium text-primary hover:underline">Back to campus map</NuxtLink>
            </div>
          </div>
        </template>
      </UCard>
    </div>
  </div>
</template>
