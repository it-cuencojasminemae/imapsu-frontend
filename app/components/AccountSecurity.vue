<script setup lang="ts">
const auth = useAuth()
const { $api } = useStrapi()
const secret = ref('')
const uri = ref('')
const code = ref('')
const recoveryCodes = ref<string[]>([])
const busy = ref(false)
const error = ref('')
const message = ref('')
const start = async () => {
  if (busy.value || secret.value || auth.user.value?.security?.mfaEnabled) return
  busy.value = true; error.value = ''
  try { const result = await $api<{ secret: string; uri: string }>('/api/auth/mfa/enrollment', { method: 'POST' }); secret.value = result.secret; uri.value = result.uri }
  catch (e: any) { error.value = e?.data?.error?.message || 'Unable to begin enrollment.' }
  finally { busy.value = false }
}
const verify = async () => {
  if (busy.value) return
  busy.value = true; error.value = ''; message.value = ''
  try {
    if (secret.value) {
      const result = await $api<{ recoveryCodes: string[] }>('/api/auth/mfa/enable', { method: 'POST', body: { code: code.value } })
      recoveryCodes.value = result.recoveryCodes; secret.value = ''; uri.value = ''; await auth.refreshMe()
      message.value = 'Authenticator enabled. Save your recovery codes in a safe place.'
    } else {
      await $api('/api/auth/mfa/reauthenticate', { method: 'POST', body: { code: code.value } })
      message.value = 'Verified. You can perform sensitive actions for five minutes.'
    }
    code.value = ''
  } catch (e: any) { error.value = e?.data?.error?.message || 'Verification failed. Please try again.' }
  finally { busy.value = false }
}
defineExpose({ start })
</script>
<template>
  <UCard v-if="auth.isStaff.value">
    <template #header><h2 class="text-base font-semibold text-highlighted">Authenticator</h2></template>
    <p class="text-sm text-muted">{{ auth.user.value?.security?.mfaEnabled ? 'Your authenticator is enabled.' : 'An authenticator is required for MIS and OAS accounts.' }}</p>
    <p v-if="!auth.user.value?.security?.mfaEnabled && auth.user.value?.security?.enrollmentDeadline" class="mt-2 text-sm">Enroll by {{ new Date(auth.user.value.security.enrollmentDeadline).toLocaleString('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' }) }} (Philippine time).</p>
    <UButton v-if="!auth.user.value?.security?.mfaEnabled && !secret" class="mt-4" label="Set up authenticator" :loading="busy" @click="start" />
    <div v-if="secret" class="mt-4 space-y-3">
      <p class="text-sm">Add a time-based account in your authenticator using this setup key, then enter its six-digit code.</p>
      <code class="block break-all rounded bg-muted p-3 select-all">{{ secret }}</code>
      <a :href="uri" class="text-sm text-primary underline">Open in an authenticator app</a>
    </div>
    <form v-if="secret || auth.user.value?.security?.mfaEnabled" class="mt-4 flex flex-wrap items-end gap-3" @submit.prevent="verify">
      <UFormField :label="secret ? 'Authenticator code' : 'Verify a sensitive action'" description="Authenticator or recovery code"><UInput v-model="code" autocomplete="one-time-code" :disabled="busy" required /></UFormField>
      <UButton type="submit" :label="secret ? 'Enable authenticator' : 'Verify'" :loading="busy" />
    </form>
    <UAlert v-if="error" class="mt-4" color="error" :title="error" />
    <UAlert v-if="message" class="mt-4" color="success" :title="message" />
    <div v-if="recoveryCodes.length" class="mt-4"><p class="mb-2 text-sm">Each recovery code works once. These codes are shown only now.</p><pre class="select-all overflow-auto rounded bg-muted p-3 text-sm">{{ recoveryCodes.join('\n') }}</pre></div>
  </UCard>
</template>
