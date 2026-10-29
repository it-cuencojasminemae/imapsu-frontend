<script setup lang="ts">
definePageMeta({
  middleware: ['auth', 'role'],
  roles: ['student', 'current-tenant']
})

type Feedback = {
  id: number | string
  documentId?: string
  tenantName?: string
  rating: number
  category?: string
  comment?: string
  createdAt?: string
  propertySpace?: { documentId?: string; name?: string; propertyCode?: string; building?: string } | null
}

type PropertySpace = { documentId: string; name: string; propertyCode: string; building: string }
type ListResponse<T> = { data: T[] }

useHead({ title: 'Feedback | iMapSU' })

const auth = useAuth()
const toast = useToast()
const { baseURL, $api, getErrorMessage } = useStrapi()
const headers = {}

const recordsPage = useRecordPage([], {  })
const { data: responseData, status, error, refresh } = await useFetch<ListResponse<Feedback>>('/api/feedbacks', {
  baseURL,
  headers,
  query: computed(() => ({
    'populate[propertySpace]': true,
    sort: 'createdAt:desc', ...recordsPage.query.value }))
})
const { data, hasLoaded, isInitialLoading, isRefreshing, isInitialError } = useRequestPresentation(responseData, status)


const { data: propertyData } = await useCompleteFetch<ListResponse<PropertySpace>>('/api/properties', {
  baseURL,
  headers,
  query: {
    'fields[0]': 'name',
    'fields[1]': 'propertyCode',
    'fields[2]': 'building',
    'pagination[pageSize]': 100
  }
})

const { data: tenantData } = await useFetch<ListResponse<{ propertyDocumentId: string; tenantName: string | null }>>('/api/properties/active-tenants', {
  baseURL,
  headers
})

const feedbacks = computed(() => data.value?.data ?? [])
const properties = computed(() => propertyData.value?.data ?? [])
const propertyOptions = computed(() => properties.value.map(property => ({
  label: `${property.name} (${property.propertyCode})`,
  value: property.documentId
})))

// Optional quick tags; "Other" is the stored default when none is picked.
const categoryOptions = ['Product', 'Service', 'Cleanliness', 'Environment', 'Staff']

// "Rate this stall" links from the map and property cards open the form
// with the stall already chosen.
const route = useRoute()
const selectedProperty = ref<string | undefined>(typeof route.query.property === 'string' ? route.query.property : undefined)
const rating = ref(0)
const category = ref<string>()
const comment = ref('')
const submitting = ref(false)
const errorMessage = ref('')

const tenantMap = computed(() => new Map((tenantData.value?.data ?? []).map(entry => [entry.propertyDocumentId, entry.tenantName ?? ''])))

const tenantName = computed(() => tenantMap.value.get(selectedProperty.value ?? '') ?? '')

const toggleCategory = (value: string) => {
  category.value = category.value === value ? undefined : value
}

const submit = async () => {
  errorMessage.value = ''
  if (!selectedProperty.value) {
    errorMessage.value = 'Please choose a property.'
    return
  }
  if (rating.value < 1) {
    errorMessage.value = 'Please pick a rating.'
    return
  }

  submitting.value = true
  try {
    await $api('/api/feedbacks', {
      method: 'POST',
      body: {
        rating: rating.value,
        category: category.value,
        comment: comment.value || undefined,
        propertySpace: selectedProperty.value
      }
    })
    selectedProperty.value = undefined
    rating.value = 0
    category.value = undefined
    comment.value = ''
    toast.add({ title: 'Feedback submitted', color: 'success', icon: 'i-lucide-check-circle-2' })
    await refresh()
  } catch (err) {
    errorMessage.value = getErrorMessage(err)
  } finally {
    submitting.value = false
  }
}

const formatDate = (value?: string) => value
  ? new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  : ''
</script>

<template>
  <main class="imapsu-page">
    <AppPageHeader>
      <template #eyebrow>Student feedback</template>
      <template #title>Feedback</template>
      <template #description><p class="mt-2 max-w-xl text-muted">{{ auth.isStudent.value ? 'Submit feedback about the products and services offered by campus stall tenants.' : 'Review student feedback associated with your tenancy.' }}</p></template>
      <template #actions><UButton label="Refresh" icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="status === 'pending'" @click="refresh" /></template>
    </AppPageHeader>

    <div class="grid items-start gap-6 lg:grid-cols-5">
      <UCard v-if="auth.isStudent.value" class="lg:col-span-3">
        <template #header>
          <h2 class="text-lg font-semibold text-highlighted">Submit feedback</h2>
        </template>

        <form class="space-y-5" @submit.prevent="submit">
          <UFormField label="Stall" name="propertySpace" required>
            <AppRecordLookup v-model="selectedProperty" endpoint="/api/properties" :fields="['name','propertyCode','building']" :label="item => item.name + ' (' + item.propertyCode + ')'" :value="item => item.documentId" :query="{}" :fallback="propertyOptions" />
            <p v-if="tenantName" class="mt-1.5 flex items-center gap-1.5 text-xs text-muted"><UIcon name="i-lucide-user-round" class="size-3.5" /> Run by {{ tenantName }}</p>
          </UFormField>

          <UFormField label="Rating" name="rating" required>
            <div class="flex items-center gap-1">
              <UButton
                v-for="star in 5"
                :key="star"
                type="button"
                color="neutral"
                variant="ghost"
                size="xl"
                square
                icon="i-lucide-star"
                :class="star <= rating ? 'text-secondary fill-current' : 'text-toned'"
                :aria-label="`Rate ${star} star${star > 1 ? 's' : ''}`"
                :aria-pressed="star === rating"
                :disabled="submitting"
                @click="rating = star"
              />
            </div>
          </UFormField>

          <UFormField label="What is it about?" name="category" hint="Optional">
            <div class="flex flex-wrap gap-2">
              <UButton
                v-for="option in categoryOptions"
                :key="option"
                type="button"
                size="sm"
                :color="category === option ? 'primary' : 'neutral'"
                :variant="category === option ? 'solid' : 'outline'"
                :aria-pressed="category === option"
                :label="option"
                :disabled="submitting"
                @click="toggleCategory(option)"
              />
            </div>
          </UFormField>

          <UFormField label="Comment" name="comment" hint="Optional">
            <UTextarea v-model="comment" placeholder="Tell us about your experience…" :rows="4" :disabled="submitting" />
          </UFormField>

          <UAlert v-if="errorMessage" color="error" icon="i-lucide-triangle-alert" :description="errorMessage" />

          <UButton data-prominent="true" type="submit" block :loading="submitting">Submit feedback</UButton>
        </form>
      </UCard>

      <div class="lg:col-span-2" :class="auth.isStudent.value ? '' : 'lg:col-span-5'">
        <AppRefreshState :refreshing="isRefreshing" :failed="hasLoaded && !!error" @retry="refresh" />
    <AppLoadingState v-if="isInitialLoading" :count="4" height="h-28" />

        <UAlert v-else-if="isInitialError" color="error" icon="i-lucide-triangle-alert" title="Unable to load feedback" description="Please try again." ><template #actions><UButton label="Retry" color="neutral" variant="outline" @click="refresh" /></template></UAlert>

        <UEmpty v-else-if="feedbacks.length === 0" icon="i-lucide-message-square-text" title="No feedback yet" description="Feedback shared by students will appear here." />

        <div v-else class="space-y-4">
          <UCard v-for="item in feedbacks" :key="item.documentId ?? item.id" :ui="{ body: 'p-5' }">
            <div class="flex items-start justify-between gap-3">
              <div class="flex items-center gap-1">
                <UIcon
                  v-for="star in 5"
                  :key="star"
                  name="i-lucide-star"
                  class="size-4"
                  :class="star <= item.rating ? 'text-secondary fill-current' : 'text-toned'"
                />
              </div>
              <div class="flex items-center gap-2">
                <UBadge v-if="item.category && item.category !== 'Other'" color="neutral" variant="subtle" size="sm">{{ item.category }}</UBadge>
                <p class="text-xs text-muted">{{ formatDate(item.createdAt) }}</p>
              </div>
            </div>
            <p class="mt-3 text-sm leading-relaxed text-toned">{{ item.comment || 'No comment left.' }}</p>
            <p class="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
              <span v-if="item.propertySpace" class="flex items-center gap-1">
                <UIcon name="i-lucide-building-2" class="size-3.5" />
                {{ item.propertySpace.name }}
                <span class="font-mono">({{ item.propertySpace.propertyCode }})</span>
              </span>
              <span v-if="item.tenantName">· Tenant: {{ item.tenantName }}</span>
            </p>
          </UCard>
        </div>
      </div>
    </div>
    <AppRecordPagination :state="recordsPage" :response="data" :pending="status === 'pending'" />
  </main>
</template>
