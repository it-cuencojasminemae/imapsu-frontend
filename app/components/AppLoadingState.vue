<script setup lang="ts">
// Skeleton placeholders shaped like the content each page renders once its
// records arrive: record tables, card grids, stacked record cards, compact
// rows, dashboards, metric panels, and forms. "blocks" keeps plain bars for
// small inline spots.
type Variant = 'table' | 'cards' | 'list' | 'rows' | 'dashboard' | 'stats' | 'form' | 'blocks'
const props = withDefaults(defineProps<{ variant?: Variant; count?: number; height?: string; label?: string; toolbar?: boolean }>(), {
  variant: 'blocks', count: 4, height: 'h-24', label: 'Loading records…', toolbar: true
})
// Columns get varied widths so the placeholder reads as a table, not stripes.
const cellWidths = ['w-36', 'w-24', 'w-28', 'w-20', 'w-16']
const lineWidths = ['w-11/12', 'w-4/5', 'w-2/3']
const width = (list: string[], index: number) => list[index % list.length]
</script>

<template>
  <div class="imapsu-loading" :class="{ 'imapsu-loading--inline': variant === 'blocks' }" role="status" aria-live="polite" aria-busy="true">
    <span class="sr-only">{{ props.label }}</span>

    <!-- Search and filter card shown above record tables, card grids, and lists. -->
    <div v-if="toolbar && ['table', 'cards', 'list'].includes(variant)" class="mb-4 rounded-xl border border-default bg-default p-4" aria-hidden="true">
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div v-for="index in 4" :key="index" class="space-y-2" :class="{ 'hidden sm:block': index > 1 }">
          <USkeleton class="h-3.5 w-20" />
          <USkeleton class="h-8 w-full rounded-md" />
        </div>
      </div>
      <USkeleton class="mt-4 h-3.5 w-40" />
    </div>

    <template v-if="variant === 'table'">
      <div class="hidden overflow-hidden rounded-xl border border-default bg-default lg:block" aria-hidden="true">
        <div class="flex items-center gap-6 border-b border-default bg-elevated/40 px-4 py-3">
          <USkeleton v-for="column in 5" :key="column" class="h-3 flex-1" :class="column === 5 ? 'max-w-16' : 'max-w-24'" />
        </div>
        <div v-for="row in count" :key="row" class="flex items-center gap-6 border-b border-default px-4 py-4 last:border-b-0">
          <div class="flex flex-1 items-center gap-2"><USkeleton class="size-7 shrink-0 rounded-full" /><USkeleton class="h-4" :class="width(cellWidths, row)" /></div>
          <div class="flex-1"><USkeleton class="h-4" :class="width(cellWidths, row + 1)" /></div>
          <div class="flex-1"><USkeleton class="h-5 w-20 rounded-full" /></div>
          <div class="flex-1"><USkeleton class="h-4" :class="width(cellWidths, row + 3)" /></div>
          <div class="flex flex-1 justify-end gap-2"><USkeleton class="h-7 w-14 rounded-md" /><USkeleton class="size-7 rounded-md" /></div>
        </div>
      </div>
      <div class="space-y-3 lg:hidden" aria-hidden="true">
        <div v-for="row in Math.min(count, 4)" :key="row" class="rounded-xl border border-default bg-default p-4">
          <div class="flex items-center gap-3"><USkeleton class="size-10 shrink-0 rounded-full" /><div class="flex-1 space-y-2"><USkeleton class="h-4 w-2/3" /><USkeleton class="h-3 w-1/2" /></div><USkeleton class="h-5 w-16 rounded-full" /></div>
          <div class="mt-4 flex gap-2"><USkeleton class="h-7 w-16 rounded-md" /><USkeleton class="h-7 w-24 rounded-md" /></div>
        </div>
      </div>
    </template>

    <div v-else-if="variant === 'cards'" class="grid gap-4 md:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
      <div v-for="card in count" :key="card" class="rounded-xl border border-default bg-default p-5">
        <div class="flex items-start justify-between gap-3">
          <div class="flex-1 space-y-2"><USkeleton class="h-3 w-16" /><USkeleton class="h-5 w-3/4" /><USkeleton class="h-3.5 w-1/2" /></div>
          <USkeleton class="h-5 w-16 rounded-full" />
        </div>
        <USkeleton class="mt-4 h-28 w-full rounded-lg" />
        <div class="mt-4 space-y-2"><USkeleton class="h-3.5 w-full" /><USkeleton class="h-3.5" :class="width(lineWidths, card)" /></div>
        <div class="mt-5 flex gap-2"><USkeleton class="h-8 w-20 rounded-md" /><USkeleton class="h-8 w-20 rounded-md" /></div>
      </div>
    </div>

    <div v-else-if="variant === 'list'" class="space-y-4" aria-hidden="true">
      <div v-for="item in count" :key="item" class="rounded-xl border border-default bg-default p-5">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="flex-1 space-y-2"><USkeleton class="h-5" :class="item % 2 ? 'w-1/2' : 'w-2/5'" /><USkeleton class="h-3.5 w-1/3" /></div>
          <USkeleton class="h-5 w-20 rounded-full" />
        </div>
        <div class="mt-4 space-y-2"><USkeleton class="h-3.5 w-full" /><USkeleton class="h-3.5" :class="width(lineWidths, item)" /></div>
        <div class="mt-4 flex gap-2"><USkeleton class="h-8 w-24 rounded-md" /><USkeleton class="h-8 w-20 rounded-md" /></div>
      </div>
    </div>

    <div v-else-if="variant === 'rows'" class="overflow-hidden rounded-xl border border-default bg-default" aria-hidden="true">
      <div v-for="row in count" :key="row" class="flex items-center gap-4 border-b border-default px-5 py-3.5 last:border-b-0">
        <USkeleton class="size-8 shrink-0 rounded-lg" />
        <div class="min-w-0 flex-1 space-y-2"><USkeleton class="h-4" :class="width(['w-2/3', 'w-1/2', 'w-3/5'], row)" /><USkeleton class="h-3 w-1/3" /></div>
        <USkeleton class="hidden h-7 w-20 rounded-md sm:block" />
      </div>
    </div>

    <div v-else-if="variant === 'dashboard'" class="space-y-8" aria-hidden="true">
      <section>
        <USkeleton class="mb-3 h-5 w-48" />
        <div class="grid gap-3 lg:grid-cols-2">
          <div v-for="card in 2" :key="card" class="flex items-start gap-3 rounded-xl border border-default bg-default p-5">
            <USkeleton class="size-9 shrink-0 rounded-lg" />
            <div class="flex-1 space-y-2"><USkeleton class="h-3.5 w-32" /><USkeleton class="h-5 w-48" /><USkeleton class="h-3.5 w-3/4" /><USkeleton class="mt-3 h-8 w-36 rounded-md" /></div>
          </div>
        </div>
      </section>
      <section>
        <USkeleton class="mb-3 h-5 w-40" />
        <div class="grid gap-3 sm:grid-cols-3">
          <div v-for="card in 3" :key="card" class="rounded-xl border border-default bg-default p-5">
            <div class="flex items-center justify-between"><USkeleton class="h-3.5 w-24" /><USkeleton class="size-8 rounded-lg" /></div>
            <USkeleton class="mt-3 h-8 w-16" />
            <USkeleton class="mt-3 h-3.5 w-32" />
          </div>
        </div>
      </section>
      <section>
        <USkeleton class="mb-3 h-5 w-56" />
        <div class="grid gap-4 lg:grid-cols-2">
          <div v-for="card in 2" :key="card" class="rounded-xl border border-default bg-default">
            <div class="flex items-center justify-between border-b border-default px-5 py-4"><USkeleton class="h-5 w-32" /><USkeleton class="h-4 w-16" /></div>
            <div class="space-y-4 p-5">
              <div v-for="row in 4" :key="row" class="flex items-center justify-between"><USkeleton class="h-3.5" :class="width(cellWidths, row)" /><USkeleton class="h-4 w-8" /></div>
            </div>
          </div>
        </div>
      </section>
    </div>

    <div v-else-if="variant === 'stats'" class="space-y-6" aria-hidden="true">
      <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div v-for="tile in 4" :key="tile" class="flex items-center gap-3 rounded-xl border border-default bg-default p-5">
          <USkeleton class="size-10 shrink-0 rounded-lg" />
          <div class="flex-1 space-y-2"><USkeleton class="h-3 w-16" /><USkeleton class="h-5 w-24" /></div>
        </div>
      </div>
      <div class="grid gap-4 lg:grid-cols-2">
        <div v-for="panel in Math.max(count - 1, 1)" :key="panel" class="rounded-xl border border-default bg-default">
          <div class="border-b border-default px-5 py-4"><USkeleton class="h-5 w-40" /></div>
          <div class="space-y-4 p-5">
            <div v-for="row in 4" :key="row" class="flex items-center justify-between gap-4"><div class="flex-1 space-y-2"><USkeleton class="h-3.5" :class="width(['w-3/4', 'w-1/2', 'w-2/3'], row)" /><USkeleton class="h-3 w-1/3" /></div><USkeleton class="h-5 w-14 rounded-full" /></div>
          </div>
        </div>
      </div>
    </div>

    <div v-else-if="variant === 'form'" class="space-y-6" aria-hidden="true">
      <div v-for="section in count" :key="section" class="rounded-xl border border-default bg-default">
        <div class="space-y-2 border-b border-default px-5 py-4"><USkeleton class="h-5 w-36" /><USkeleton class="h-3.5 w-56" /></div>
        <div class="space-y-5 p-5">
          <div v-for="field in 2" :key="field" class="space-y-2"><USkeleton class="h-3.5 w-28" /><USkeleton class="h-3 w-64 max-w-full" /><USkeleton class="h-8 w-full rounded-md sm:w-80" /></div>
        </div>
      </div>
    </div>

    <div v-else class="space-y-3" aria-hidden="true">
      <USkeleton v-for="index in count" :key="index" class="rounded-xl" :class="height" />
    </div>
  </div>
</template>
