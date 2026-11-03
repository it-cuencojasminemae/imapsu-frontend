<script setup lang="ts">
const props = withDefaults(defineProps<{ cooldown: number; loading?: boolean; disabled?: boolean; label?: string }>(), { label: 'Resend verification email' })
defineEmits<{ click: [] }>()

const remaining = computed(() => {
  const minutes = Math.floor(props.cooldown / 60)
  const seconds = props.cooldown % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
})
</script>

<template>
  <div class="flex justify-center">
    <UButton variant="ghost" color="neutral" icon="i-lucide-refresh-cw" :loading="loading" :disabled="disabled || cooldown > 0" @click="$emit('click')">
      <template v-if="cooldown > 0">
        {{ label }} in <span class="font-semibold text-primary tabular-nums">{{ remaining }}</span>
      </template>
      <template v-else>{{ label }}</template>
    </UButton>
  </div>
</template>
