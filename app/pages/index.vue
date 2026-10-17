<script setup lang="ts">
import { landingPath } from '~/utils/accountNavigation'
definePageMeta({ middleware: () => navigateTo(landingPath(useAuth().user.value), { replace: true }) })
</script>

<template><div /></template>
