<script setup lang="ts">
definePageMeta({
  middleware: ['auth', 'role'],
  roles: ['oas']
})

type Closure = { id: number; documentId: string; date: string; reason: string }
type ListResponse<T> = { data: T[] }

useHead({ title: 'Office Closures | iMapSU' })

const notify = useNotify()
const { confirm } = useConfirmDialog()
const { baseURL, $api, getErrorMessage } = useStrapi()

const todayInManila = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const today = ref(todayInManila())

// Only upcoming closures matter: past ones no longer move any visit.
const { data, status, error, refresh } = await useFetch<ListResponse<Closure>>('/api/office-closures', {
  lazy: true,
  baseURL,
  query: computed(() => ({ 'filters[date][$gte]': today.value, sort: 'date:asc', 'pagination[pageSize]': 100 }))
})
const closures = computed(() => data.value?.data ?? [])

const formatDay = (value: string) => new Date(value.slice(0, 10) + 'T00:00:00').toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
const isFriday = (value: string) => new Date(value.slice(0, 10) + 'T00:00:00').getDay() === 5

const form = reactive({ date: '', reason: '' })
const saving = ref(false)
const formError = ref('')

const addClosure = async () => {
  formError.value = ''
  if (!form.date || !form.reason.trim()) {
    formError.value = 'Choose the day and enter the reason.'
    return
  }
  saving.value = true
  try {
    const result = await $api<{ meta?: { movedVisits?: number } }>('/api/office-closures', {
      method: 'POST',
      body: { data: { date: form.date, reason: form.reason.trim() } }
    })
    const moved = result.meta?.movedVisits ?? 0
    notify.success('Office closure added', {
      description: moved
        ? `${moved} office visit${moved === 1 ? ' was' : 's were'} moved to the next open Friday and the applicant${moved === 1 ? ' was' : 's were'} notified.`
        : 'No office visits were scheduled that day.'
    })
    form.date = ''
    form.reason = ''
    today.value = todayInManila()
    await refresh()
  } catch (err) {
    formError.value = getErrorMessage(err)
  } finally {
    saving.value = false
  }
}

const removing = ref<string | null>(null)
const removeClosure = async (closure: Closure) => {
  if (!await confirm({
    title: 'Remove this closure?',
    description: `${formatDay(closure.date)} will be treated as an open day again. Visits already moved off it stay on their new day.`,
    confirmLabel: 'Remove closure',
    icon: 'i-lucide-trash-2'
  })) return
  removing.value = closure.documentId
  try {
    await $api(`/api/office-closures/${closure.documentId}`, { method: 'DELETE' })
    notify.success('Closure removed')
    await refresh()
  } catch (err) {
    notify.error('Unable to remove the closure', { description: getErrorMessage(err) })
  } finally {
    removing.value = null
  }
}
</script>

<template>
  <main class="imapsu-page imapsu-page--admin">
    <AppPageHeader>
      <template #title>Office closures</template>
      <template #description><p class="mt-2 max-w-xl text-muted">Days the OAS office is closed, such as holidays and class suspensions. Approved applicants are never asked to report on these days. A visit set for a closed Friday moves to the next open Friday.</p></template>
      <template #actions><UButton label="Refresh" icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="status === 'pending'" @click="refresh" /></template>
    </AppPageHeader>

    <div class="space-y-6">
      <UCard>
        <form class="grid gap-4 sm:grid-cols-[12rem_1fr_auto] sm:items-end" @submit.prevent="addClosure">
          <UFormField label="Day" required>
            <UInput v-model="form.date" type="date" required :min="today" :disabled="saving" :ui="{ root: 'w-full' }" />
          </UFormField>
          <UFormField label="Reason" required>
            <UInput v-model="form.reason" required maxlength="120" placeholder="e.g. Bonifacio Day" :disabled="saving" :ui="{ root: 'w-full' }" />
          </UFormField>
          <UButton data-prominent="true" type="submit" icon="i-lucide-calendar-x" :loading="saving">Add closure</UButton>
        </form>
        <UAlert v-if="formError" class="mt-4" color="error" icon="i-lucide-triangle-alert" :description="formError" />
        <p class="mt-3 text-xs text-muted">Visits already set for that day move right away, and each applicant gets a notification with the new day.</p>
      </UCard>

      <AppLoadingState v-if="status === 'pending' && !data" variant="list" :toolbar="false" :count="3" label="Loading office closures…" />
      <UAlert v-else-if="error && !data" color="error" icon="i-lucide-triangle-alert" title="Unable to load office closures" description="Please try again."><template #actions><UButton label="Retry" color="neutral" variant="outline" @click="refresh" /></template></UAlert>
      <UEmpty v-else-if="closures.length === 0" icon="i-lucide-calendar-check" title="No upcoming closures" description="The office is open every weekday ahead. Add a day above when a holiday or suspension is announced." />
      <UCard v-else :ui="{ body: 'p-0 sm:p-0' }">
        <ul class="divide-y divide-default">
          <li v-for="closure in closures" :key="closure.documentId" class="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <div class="min-w-0">
              <p class="flex flex-wrap items-center gap-2 font-medium text-highlighted">
                {{ formatDay(closure.date) }}
                <UBadge v-if="isFriday(closure.date)" color="warning" variant="subtle" size="sm">Visit day</UBadge>
              </p>
              <p class="text-sm text-muted">{{ closure.reason }}</p>
            </div>
            <UButton label="Remove" size="sm" color="error" variant="ghost" icon="i-lucide-trash-2" :loading="removing === closure.documentId" @click="removeClosure(closure)" />
          </li>
        </ul>
      </UCard>
    </div>
  </main>
</template>
