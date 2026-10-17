<script setup lang="ts">
const { open, finish } = useReauthentication()
const api = useSecureApi()
const code = ref(''), error = ref(''), busy = ref(false)
watch(open, value => { if(value){code.value='';error.value=''} })
const submit = async () => {
  busy.value = true; error.value = ''
  try { await api('/api/auth/mfa/reauthenticate', { method:'POST', body:{code:code.value}, skipReauthentication:true }); finish(true) }
  catch(e:any){error.value=e?.data?.error?.message||e?.data?.message||'Verification failed. Check your code.'}
  finally{busy.value=false}
}
</script>
<template>
  <UModal :open="open" title="Verify this sensitive action" description="Enter an authenticator or recovery code. Your unsaved work will remain on this page." @update:open="value => { if(!value)finish(false) }">
    <template #body><form class="space-y-4" @submit.prevent="submit">
      <UFormField label="Authenticator or recovery code"><UInput v-model="code" autocomplete="one-time-code" class="w-full" autofocus /></UFormField>
      <UAlert v-if="error" color="error" :title="error" />
      <a href="/account" target="_blank" rel="noopener" class="text-sm text-primary underline">Set up or manage your authenticator</a>
      <div class="flex justify-end gap-2"><UButton color="neutral" variant="outline" label="Cancel" @click="finish(false)" /><UButton type="submit" label="Verify and continue" :loading="busy" /></div>
    </form></template>
  </UModal>
</template>
