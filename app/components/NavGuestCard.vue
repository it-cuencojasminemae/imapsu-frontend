<script setup lang="ts">
// Fills the navigation for signed-out visitors, who only have two links.
defineProps<{ onNavigate?: () => void }>()
</script>

<template>
  <div class="imapsu-nav-guest">
    <div class="imapsu-nav-guest-art" aria-hidden="true">
      <img src="/login-register-image.jpg" alt="" loading="lazy" />
    </div>
    <div class="px-3 pb-3">
      <p class="font-semibold text-white">Welcome to iMapSU</p>
      <p class="mt-1 text-xs leading-relaxed text-maroon-200">Sign in to apply for a stall, view your bills, and send feedback.</p>
      <UButton to="/login" block icon="i-lucide-log-in" label="Sign in" class="mt-3 bg-maroon-700 hover:bg-maroon-600" @click="onNavigate?.()" />
      <NuxtLink to="/register?role=aspiring-tenant" class="mt-2.5 block text-center text-xs font-medium text-maroon-100 hover:text-white hover:underline" @click="onNavigate?.()">Apply Now</NuxtLink>
    </div>
  </div>
</template>
