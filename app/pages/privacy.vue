<script setup lang="ts">
useHead({ title: 'Data Privacy Notice | iMapSU' })
const auth = useAuth()
</script>

<template>
  <AuthShell
    variant="center"
    wide
    heading="Data Privacy Notice"
    description="How iMapSU collects, uses and protects your personal data."
  >
    <PrivacyNotice />

    <template #footer>
      <div class="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm">
        <NuxtLink to="/campus-map" class="imapsu-auth-link inline-flex items-center gap-2">
          <UIcon name="i-lucide-arrow-left" class="size-4" />
          Back to campus map
        </NuxtLink>
        <template v-if="!auth.user.value">
          <span class="text-dimmed" aria-hidden="true">|</span>
          <NuxtLink to="/register" class="imapsu-auth-link">Create an account</NuxtLink>
        </template>
      </div>
    </template>
  </AuthShell>
</template>
