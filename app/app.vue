<script setup lang="ts">
import { MotionConfig } from 'motion-v'
import { appMotion } from '~/utils/appMotion'
</script>

<template>
  <UApp>
    <ReauthenticationDialog />
    <MotionConfig reduced-motion="user" :transition="{ duration: appMotion.reveal, ease: appMotion.ease }">
      <NuxtLayout>
        <NuxtPage :page-key="route => route.path" />
      </NuxtLayout>
    </MotionConfig>
  </UApp>
</template>
