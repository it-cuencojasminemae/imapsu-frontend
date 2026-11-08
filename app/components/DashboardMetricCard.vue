<script setup lang="ts">
defineOptions({ inheritAttrs: false })
const props = withDefaults(defineProps<{
  label: string
  value: number | string
  icon: string
  to: string
  sub?: string
  action: string
  tone?: 'neutral' | 'warning' | 'error'
}>(), { tone: 'neutral' })
// A refreshed figure flashes once so the change is noticed.
const changed = ref(false)
watch(() => props.value, (next, previous) => { if (previous !== undefined && next !== previous) changed.value = true })
</script>

<template>
  <NuxtLink :to="to" class="dashboard-metric" :class="[$attrs.class, `dashboard-metric--${tone}`]" :aria-label="`${label}: ${value}. ${action}`">
    <div class="flex items-start justify-between gap-3">
      <h3 class="min-w-0 text-sm font-medium leading-5 text-toned">{{ label }}</h3>
      <UIcon name="i-lucide-arrow-up-right" class="dashboard-metric-go size-4 shrink-0" aria-hidden="true" />
    </div>
    <p class="dashboard-metric-value" :class="{ 'imapsu-value-changed': changed }" @animationend="changed = false">{{ value }}</p>
    <p v-if="sub" class="mt-1 text-sm text-muted">{{ sub }}</p>
  </NuxtLink>
</template>

<style scoped>
.dashboard-metric { display: flex; flex-direction: column; height: 100%; padding: 1.25rem; border: 1px solid var(--ui-border); border-radius: var(--app-radius-card); background: var(--ui-bg); transition: border-color var(--app-motion-fast), background-color var(--app-motion-fast); }
.dashboard-metric:hover, .dashboard-metric:focus-visible { border-color: var(--ui-border-accented); background: var(--ui-bg-elevated); }
.dashboard-metric-go { color: var(--ui-text-dimmed); transition: color var(--app-motion-fast), transform var(--app-motion-fast) var(--app-ease); }
.dashboard-metric:hover .dashboard-metric-go { color: var(--ui-text-highlighted); transform: translate(2px, -2px); }
.dashboard-metric:focus-visible { outline-offset: -1px; }
.dashboard-metric--warning { border-left: 3px solid var(--app-accent); }
.dashboard-metric--error { border-left: 3px solid var(--ui-error); }
.dashboard-metric-value { margin-top: 0.75rem; margin-inline: -0.125rem; padding-inline: 0.125rem; font-size: 2.25rem; font-weight: 650; line-height: 1.2; font-variant-numeric: tabular-nums; letter-spacing: -0.035em; color: var(--ui-text-highlighted); overflow-wrap: anywhere; }
.dashboard-metric--error .dashboard-metric-value { color: var(--ui-error); }
</style>
