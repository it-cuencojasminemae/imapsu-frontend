<script setup lang="ts">
import { formatHistoryDateTime, type StatusHistoryEntry } from '~/composables/useStatusHistory'

defineProps<{
  entries: StatusHistoryEntry[]
  loading?: boolean
  error?: string
}>()

const emit = defineEmits<{ viewReceipt: [receipt: { url: string; name?: string | null }] }>()

const { baseURL } = useStrapi()

// Bill history entries name the workflow step behind the status change.
const EVENT_LABELS: Record<string, string> = {
  'issued': 'Bill issued',
  'correction-issued': 'Corrected bill issued',
  'corrected': 'Corrected bill issued in its place',
  'receipt-submitted': 'Receipt submitted',
  'receipt-removed': 'Staged receipt removed',
  'payment-verified': 'Payment verified',
  'payment-rejected': 'Payment rejected',
  'receipt-recorded': 'Office receipt recorded and verified',
  'voided': 'Bill voided'
}

const eventLabel = (entry: StatusHistoryEntry) => EVENT_LABELS[entry.details?.event ?? ''] ?? null

const formatAmount = (value?: number | string) => value == null || value === ''
  ? ''
  : new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 2 }).format(Number(value))

// The automatic overdue sweep runs without a signed-in user.
const actor = (entry: StatusHistoryEntry) => entry.changedBy?.username ?? (entry.toStatus === 'Overdue' ? 'System' : null)
</script>

<template>
  <div v-if="loading" class="space-y-3">
    <USkeleton v-for="index in 3" :key="index" class="h-12 rounded-lg" />
  </div>

  <UAlert v-else-if="error" color="error" icon="i-lucide-triangle-alert" :description="error" />

  <div v-else-if="entries.length === 0" class="rounded-lg border border-dashed border-default px-4 py-8 text-center text-sm text-muted">
    No status changes recorded yet.
  </div>

  <ol v-else class="relative space-y-4">
    <li v-for="entry in entries" :key="entry.id" class="flex items-start gap-3">
      <span class="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
      <div class="min-w-0 flex-1">
        <p v-if="eventLabel(entry)" class="text-sm font-semibold text-highlighted">{{ eventLabel(entry) }}</p>
        <p class="text-sm" :class="eventLabel(entry) ? 'text-muted' : 'text-highlighted'">
          <span v-if="entry.fromStatus && entry.fromStatus !== entry.toStatus" class="font-medium">{{ entry.fromStatus }}</span>
          <UIcon v-if="entry.fromStatus && entry.fromStatus !== entry.toStatus" name="i-lucide-arrow-right" class="mx-1 size-3.5 align-[-2px] text-muted" />
          <span :class="eventLabel(entry) ? 'font-medium' : 'font-semibold'">{{ entry.toStatus }}</span>
          <template v-if="entry.details?.amount != null"> · {{ formatAmount(entry.details.amount) }}</template>
          <template v-if="entry.details?.orNumber"> · OR <span class="font-mono">{{ entry.details.orNumber }}</span></template>
        </p>
        <p v-if="entry.details?.reason" class="mt-1 rounded-md bg-elevated px-2.5 py-1.5 text-sm text-toned">{{ entry.details.reason }}</p>
        <button v-if="entry.details?.receipt?.url" type="button" class="mt-1.5 inline-flex items-center gap-2 text-xs font-medium text-primary hover:underline" @click="emit('viewReceipt', { url: entry.details.receipt.url, name: entry.details.receipt.name })">
          <img :src="`${baseURL}${entry.details.receipt.url}`" :alt="entry.details.receipt.name || 'Receipt'" class="h-10 w-8 rounded border border-default object-cover" />
          View receipt
        </button>
        <p class="mt-0.5 text-xs text-muted">
          {{ formatHistoryDateTime(entry.changedAt) }}
          <template v-if="actor(entry)"> · {{ actor(entry) }}</template>
        </p>
      </div>
    </li>
  </ol>
</template>
