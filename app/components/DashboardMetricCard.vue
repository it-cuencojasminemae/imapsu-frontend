<script setup lang="ts">
defineOptions({ inheritAttrs: false })
withDefaults(defineProps<{
  label: string
  value: number | string
  icon: string
  to: string
  sub?: string
  action: string
  tone?: 'neutral' | 'warning' | 'error'
}>(), { tone: 'neutral' })
</script>

<template>
  <NuxtLink :to="to" class="dashboard-metric" :class="[$attrs.class, `dashboard-metric--${tone}`]" :aria-label="`${label}: ${value}. ${action}`">
    <div class="flex items-start gap-3">
      <span class="dashboard-metric-icon"><UIcon :name="icon" class="size-5" aria-hidden="true" /></span>
      <h3 class="min-w-0 pt-1 text-sm font-medium leading-5 text-highlighted">{{ label }}</h3>
    </div>
    <p class="dashboard-metric-value">{{ value }}</p>
    <p v-if="sub" class="mt-1 text-xs text-muted">{{ sub }}</p>
    <span class="mt-4 flex items-center justify-between gap-2 text-sm font-medium text-toned">
      {{ action }}<UIcon name="i-lucide-arrow-right" class="size-4 shrink-0" aria-hidden="true" />
    </span>
  </NuxtLink>
</template>

<style scoped>
.dashboard-metric { display: flex; flex-direction: column; height: 100%; padding: 1.25rem; border: 1px solid var(--ui-border); border-radius: var(--app-radius-card); background: var(--ui-bg); transition: border-color var(--app-motion-fast), background-color var(--app-motion-fast); }
.dashboard-metric:hover, .dashboard-metric:focus-visible { border-color: var(--ui-primary); background: var(--ui-bg-elevated); }
.dashboard-metric-icon { display: grid; place-items: center; flex-shrink: 0; width: 2rem; height: 2rem; border-radius: var(--app-radius-control); color: var(--ui-primary); background: var(--ui-bg-muted); }
.dashboard-metric--warning .dashboard-metric-icon { color: var(--ui-warning); background: color-mix(in srgb, var(--ui-warning) 10%, var(--ui-bg)); }
.dashboard-metric--error .dashboard-metric-icon { color: var(--ui-error); background: color-mix(in srgb, var(--ui-error) 10%, var(--ui-bg)); }
.dashboard-metric-value { margin-top: 1rem; font-size: 1.875rem; font-weight: 650; line-height: 1.2; font-variant-numeric: tabular-nums; letter-spacing: -0.035em; color: var(--ui-text-highlighted); overflow-wrap: anywhere; }
.dashboard-metric--error .dashboard-metric-value { color: var(--ui-error); }
.dashboard-metric > span:last-child { margin-top: auto; padding-top: 1rem; }
</style>
