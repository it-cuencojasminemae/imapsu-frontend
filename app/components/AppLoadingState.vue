<script setup lang="ts">
withDefaults(defineProps<{ count?: number; height?: string; label?: string }>(), { count: 4, height: 'h-24', label: 'Loading records…' })
</script>

<template>
  <div class="imapsu-loading space-y-3" role="status" aria-live="polite" aria-busy="true">
    <p class="flex items-center gap-2 text-sm text-muted"><UIcon name="i-lucide-hourglass" class="size-4" />{{ label }}</p>
    <USkeleton v-for="index in count" :key="index" class="rounded-xl" :class="height" aria-hidden="true" />
  </div>
</template>
