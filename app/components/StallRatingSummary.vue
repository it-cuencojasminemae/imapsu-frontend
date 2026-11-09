<script setup lang="ts">
// How visitors rate a stall's current tenant: the average, the count and the
// latest ratings. Anyone can read it, signed in or not; hidden ratings never
// appear. `refreshKey` reloads it, for example after a new rating is sent.
type PublicRating = { rating: number; category?: string | null; comment?: string | null; createdAt?: string | null }
type Summary = { average: number | null; count: number; ratings: PublicRating[] }

const props = defineProps<{ documentId: string; refreshKey?: number }>()

const { $api } = useStrapi()
const summary = ref<Summary | null>(null)
const failed = ref(false)
const loading = ref(false)
const showAll = ref(false)

let sequence = 0
const load = async () => {
  const current = ++sequence
  loading.value = true
  failed.value = false
  try {
    const response = await $api<{ data: Summary }>(`/api/stall-ratings/${encodeURIComponent(props.documentId)}`)
    if (current === sequence) summary.value = response.data
  } catch {
    if (current === sequence) failed.value = true
  } finally {
    if (current === sequence) loading.value = false
  }
}
watch(() => [props.documentId, props.refreshKey], () => {
  showAll.value = false
  load()
}, { immediate: true })

const shown = computed(() => (summary.value?.ratings ?? []).slice(0, showAll.value ? undefined : 3))
const formatDate = (value?: string | null) => value
  ? new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  : ''
</script>

<template>
  <section aria-label="Stall ratings" class="space-y-3">
    <h4 class="text-sm font-semibold">Ratings</h4>
    <p v-if="loading && !summary" class="text-sm text-muted">Loading ratings…</p>
    <p v-else-if="failed" class="text-sm text-muted">
      Ratings are unavailable right now.
      <button type="button" class="font-medium text-primary hover:underline" @click="load">Retry</button>
    </p>
    <template v-else-if="summary">
      <p v-if="summary.count === 0" class="text-sm text-muted">No ratings yet for this stall.</p>
      <template v-else>
        <div class="flex flex-wrap items-center gap-2">
          <div class="flex items-center gap-0.5" :aria-label="`Average ${summary.average} out of 5 stars`">
            <RatingStar v-for="star in 5" :key="star" class="size-4" :class="star <= Math.round(summary.average ?? 0) ? 'text-secondary' : 'text-(--ui-border-accented)'" />
          </div>
          <span class="text-sm font-semibold text-highlighted">{{ summary.average?.toFixed(1) }}</span>
          <span class="text-xs text-muted">from {{ summary.count }} rating{{ summary.count === 1 ? '' : 's' }}</span>
        </div>
        <ul class="divide-y divide-default rounded-lg border border-default">
          <li v-for="(item, index) in shown" :key="index" class="px-3.5 py-3">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div class="flex items-center gap-0.5" :aria-label="`${item.rating} out of 5 stars`">
                <RatingStar v-for="star in 5" :key="star" class="size-3.5" :class="star <= item.rating ? 'text-secondary' : 'text-(--ui-border-accented)'" />
              </div>
              <div class="flex items-center gap-2">
                <UBadge v-if="item.category && item.category !== 'Other'" color="neutral" variant="subtle" size="sm">{{ item.category }}</UBadge>
                <span class="text-xs text-muted">{{ formatDate(item.createdAt) }}</span>
              </div>
            </div>
            <p v-if="item.comment" class="mt-1.5 text-sm leading-relaxed text-toned">{{ item.comment }}</p>
          </li>
        </ul>
        <button v-if="!showAll && summary.ratings.length > shown.length" type="button" class="text-sm font-medium text-primary hover:underline" @click="showAll = true">
          Show {{ summary.ratings.length - shown.length }} more
        </button>
      </template>
    </template>
  </section>
</template>
