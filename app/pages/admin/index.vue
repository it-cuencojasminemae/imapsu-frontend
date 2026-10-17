<script setup lang="ts">
definePageMeta({
  middleware: ['auth', 'role'],
  roles: ['oas', 'admin']
})

useHead({ title: 'Dashboard | iMapSU' })

const auth = useAuth()
</script>

<template>
  <main class="imapsu-page imapsu-page--admin">
    <AdminDashboard v-if="auth.isAdmin.value" />
    <OasDashboard v-else />
  </main>
</template>
