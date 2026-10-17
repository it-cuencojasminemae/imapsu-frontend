<script setup lang="ts">
defineProps<{ title?: string; description?: string; eyebrow?: string }>()
</script>

<template>
  <header class="imapsu-page-header">
    <div class="min-w-0">
      <p v-if="eyebrow || $slots.eyebrow" class="imapsu-page-eyebrow"><slot name="eyebrow">{{ eyebrow }}</slot></p>
      <h1 class="imapsu-page-heading"><slot name="title">{{ title }}</slot></h1>
      <div v-if="description || $slots.description" class="imapsu-page-description"><slot name="description">{{ description }}</slot></div>
    </div>
    <div v-if="$slots.actions" class="imapsu-page-actions"><slot name="actions" /></div>
  </header>
</template>
