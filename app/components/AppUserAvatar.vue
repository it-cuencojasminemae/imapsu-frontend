<script setup lang="ts">
type AvatarUser = { username?: string; email?: string; fullName?: string; avatar?: { url?: string } | null }

const props = withDefaults(defineProps<{ user?: AvatarUser | null; size?: '3xs' | '2xs' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' }>(), { size: '2xs' })

const name = computed(() => props.user?.fullName || props.user?.username || props.user?.email || '?')
// Same rule as the account menu: render the photo after hydration, so a missing
// file falls back to the initial instead of the browser's alt text.
const mounted = ref(false)
onMounted(() => { mounted.value = true })
</script>

<template>
  <UAvatar :src="(mounted && user?.avatar?.url) || undefined" :text="name.charAt(0).toUpperCase()" :alt="name" :size="size" class="shrink-0" />
</template>
