<script setup lang="ts">
import { landingPath } from '~/utils/accountNavigation'

definePageMeta({
  middleware: ['auth', () => {
    const auth = useAuth()
    if (auth.isStaff.value) return navigateTo(landingPath(auth.user.value), { replace: true })
  }],
  roles: ['student', 'aspiring-tenant', 'current-tenant']
})
useHead({ title: 'Dashboard | iMapSU' })
const auth = useAuth()
</script>

<template>
  <main class="imapsu-page">
    <MemberDashboard v-if="auth.isAuthenticated.value && !auth.isStaff.value" :key="`${auth.user.value?.id}:${auth.role.value}`" />
  </main>
</template>
