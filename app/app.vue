<script setup lang="ts">
import { MotionConfig } from 'motion-v'
import { useMediaQuery } from '@vueuse/core'
import { appMotion } from '~/utils/appMotion'

// Toasts sit bottom-center on phones (under Tailwind's 640px sm breakpoint)
// and bottom-right on wider screens.
const isPhone = useMediaQuery('(max-width: 639.98px)')
const toaster = computed(() => ({ position: isPhone.value ? 'bottom-center' as const : 'bottom-right' as const, duration: 5000 }))
</script>

<template>
  <UApp :toaster="toaster">
    <ReauthenticationDialog />
    <ConfirmDialog />
    <MotionConfig reduced-motion="user" :transition="{ duration: appMotion.reveal, ease: appMotion.ease }">
      <NuxtLayout>
        <NuxtPage :page-key="route => route.path" />
      </NuxtLayout>
    </MotionConfig>
  </UApp>
</template>
