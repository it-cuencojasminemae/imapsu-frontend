<script setup lang="ts">
defineProps<{ title?: string; description?: string }>()
</script>

<template>
  <header class="imapsu-page-header">
    <div class="min-w-0">
      <h1 class="imapsu-page-heading"><slot name="title">{{ title }}</slot></h1>
      <div v-if="description || $slots.description" class="imapsu-page-description"><slot name="description">{{ description }}</slot></div>
    </div>
    <div v-if="$slots.actions" class="imapsu-page-actions"><slot name="actions" /></div>
  </header>
</template>
