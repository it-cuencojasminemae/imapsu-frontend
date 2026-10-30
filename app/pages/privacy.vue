<script setup lang="ts">
useHead({ title: 'Data Privacy Notice | iMapSU' })
const auth = useAuth()
</script>

<template>
  <div class="imapsu-auth" style="max-width: 42rem">
    <UCard class="ring-1 ring-default">
      <template #header>
        <div class="flex flex-col items-center text-center">
          <span class="imapsu-brand-tile mb-4 grid size-12 place-items-center rounded-xl shadow-sm">
            <UIcon name="i-lucide-shield-check" class="size-6" />
          </span>
          <h1 class="text-2xl font-bold tracking-tight text-highlighted">Data Privacy Notice</h1>
          <p class="mt-1 text-sm text-muted">How iMapSU collects, uses and protects your personal data.</p>
        </div>
      </template>

      <PrivacyNotice />

      <template #footer>
        <div class="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm">
          <NuxtLink v-if="!auth.user.value" to="/register" class="font-medium text-primary hover:underline">Create an account</NuxtLink>
          <NuxtLink to="/campus-map" class="inline-flex items-center gap-1.5 font-medium text-primary hover:underline">
            <UIcon name="i-lucide-arrow-left" class="size-3.5" />
            Back to campus map
          </NuxtLink>
        </div>
      </template>
    </UCard>
  </div>
</template>
