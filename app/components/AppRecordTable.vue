<script setup lang="ts" generic="T">
// Desktop rows hold the actions; the details slot is the phone card and, when
// detailsToggle is on, the panel a row opens. Pages whose row action opens a
// full view turn detailsToggle off so nothing is shown twice.
type Column = { key: string; label: string; value: (item: T) => string | number; badge?: boolean; color?: (item: T) => 'primary' | 'secondary' | 'neutral' | 'success' | 'warning' | 'error' | 'info' }
const props = withDefaults(defineProps<{ items: T[]; columns: Column[]; itemKey: (item: T) => string | number; caption: string; expandable?: boolean; compactActions?: boolean; detailsToggle?: boolean; actionsLabel?: string }>(), { expandable: true, compactActions: false, detailsToggle: true })
const expanded = ref<string | number | null>(null)
const detailsLabel = (item: T) => expanded.value === props.itemKey(item) ? 'Close details' : 'Details'
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
      <table class="imapsu-record-table" :class="{ 'imapsu-record-table--compact': compactActions }">
        <caption class="sr-only">{{ caption }}</caption>
        <thead><tr><th v-for="column in columns" :key="column.key" scope="col" :class="{ 'is-numeric': column.key === 'amount' }">{{ column.label }}</th><th v-if="expandable" scope="col" class="is-actions"><template v-if="actionsLabel">{{ actionsLabel }}</template><span v-else class="sr-only">Actions</span></th></tr></thead>
        <tbody>
          <template v-for="item in items" :key="itemKey(item)">
            <tr>
              <td v-for="column in columns" :key="column.key" :class="{ 'is-numeric': column.key === 'amount' }">
                <slot :name="`cell-${column.key}`" :item="item">
                  <UBadge v-if="column.badge" :color="column.color?.(item) ?? 'neutral'" variant="subtle">{{ column.value(item) }}</UBadge>
                  <span v-else :class="column.key === 'amount' ? 'font-semibold tabular-nums text-highlighted' : 'text-toned'">{{ column.value(item) }}</span>
                </slot>
              </td>
              <td v-if="expandable"><div class="imapsu-record-actions" :class="{ 'imapsu-record-actions--compact': compactActions }">
                <slot name="actions" :item="item" />
                <UButton v-if="detailsToggle" :label="compactActions ? undefined : detailsLabel(item)" :aria-label="detailsLabel(item)" :title="compactActions ? detailsLabel(item) : undefined" :icon="expanded === itemKey(item) ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" variant="ghost" color="neutral" size="sm" :aria-expanded="expanded === itemKey(item)" :aria-controls="`${detailId}-${itemKey(item)}`" @click="toggle(item)" />
              </div></td>
            </tr>
            <tr v-if="detailsToggle && expanded === itemKey(item)"><td :colspan="columns.length + 1"><div :id="`${detailId}-${itemKey(item)}`"><slot name="details" :item="item" /></div></td></tr>
          </template>
        </tbody>
      </table>
    </div>
    <div class="space-y-3 lg:hidden"><div v-for="item in items" :key="itemKey(item)"><slot name="details" :item="item" /></div></div>
  </AppMotionReveal>
</template>
