<script setup lang="ts" generic="T">
type Column = { key: string; label: string; value: (item: T) => string | number; badge?: boolean; color?: (item: T) => 'primary' | 'secondary' | 'neutral' | 'success' | 'warning' | 'error' | 'info' }
const props = withDefaults(defineProps<{ items: T[]; columns: Column[]; itemKey: (item: T) => string | number; caption: string; expandable?: boolean }>(), { expandable: true })
const expanded = ref<string | number | null>(null)
const detailId = useId()
watch(() => props.items, items => {
  if (!items.some(item => props.itemKey(item) === expanded.value)) expanded.value = null
})
function toggle(item: T) {
  const key = props.itemKey(item)
  expanded.value = expanded.value === key ? null : key
}
</script>

<template>
  <AppMotionReveal loaded>
    <div class="hidden overflow-x-auto rounded-xl border border-default bg-default lg:block">
      <table class="imapsu-record-table">
        <caption class="sr-only">{{ caption }}</caption>
        <thead><tr><th v-for="column in columns" :key="column.key" scope="col">{{ column.label }}</th><th v-if="expandable" scope="col">Actions</th></tr></thead>
        <tbody>
          <template v-for="item in items" :key="itemKey(item)">
            <tr>
              <td v-for="column in columns" :key="column.key">
                <slot :name="`cell-${column.key}`" :item="item">
                  <UBadge v-if="column.badge" :color="column.color?.(item) ?? 'neutral'" variant="subtle">{{ column.value(item) }}</UBadge>
                  <span v-else :class="column.key === 'amount' ? 'font-semibold tabular-nums text-highlighted' : 'text-toned'">{{ column.value(item) }}</span>
                </slot>
              </td>
              <td v-if="expandable"><div class="imapsu-record-actions">
                <slot name="actions" :item="item" />
                <UButton :label="expanded === itemKey(item) ? 'Close details' : 'Details'" :icon="expanded === itemKey(item) ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" variant="ghost" color="neutral" size="sm" :aria-expanded="expanded === itemKey(item)" :aria-controls="`${detailId}-${itemKey(item)}`" @click="toggle(item)" />
              </div></td>
            </tr>
            <tr v-if="expanded === itemKey(item)"><td :colspan="columns.length + 1"><div :id="`${detailId}-${itemKey(item)}`"><slot name="details" :item="item" /></div></td></tr>
          </template>
        </tbody>
      </table>
    </div>
    <div class="space-y-3 lg:hidden"><div v-for="item in items" :key="itemKey(item)"><slot name="details" :item="item" /></div></div>
  </AppMotionReveal>
</template>
