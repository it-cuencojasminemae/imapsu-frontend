<script setup lang="ts">
// The address panel on the verification card. `error` is the same panel for an
// address the mail server rejected; `warning` is for a send we could not confirm.
withDefaults(defineProps<{
  email?: string
  label: string
  hint?: string
  tone?: 'default' | 'success' | 'warning' | 'error'
}>(), { email: undefined, hint: undefined, tone: 'default' })

const icons = { default: 'i-lucide-mail', success: 'i-lucide-mail-check', warning: 'i-lucide-mail-warning', error: 'i-lucide-mail-x' }
</script>

<template>
  <div class="imapsu-auth-status" :class="`imapsu-auth-status--${tone}`">
    <span class="imapsu-auth-status-icon" aria-hidden="true"><UIcon :name="icons[tone]" class="size-6" /></span>
    <div class="min-w-0">
      <p class="text-sm text-toned">{{ label }}</p>
      <p v-if="email" class="imapsu-auth-status-email">{{ email }}</p>
      <p v-if="hint" class="mt-1 text-sm text-muted">{{ hint }}</p>
    </div>
  </div>
</template>
