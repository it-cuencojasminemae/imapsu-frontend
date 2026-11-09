<script setup lang="ts">
// Public stall rating: anyone can rate an occupied stall, no account needed.
// The browser keeps a random token so the server can allow one rating per
// stall per tenant; only a hash of it is stored.
const props = defineProps<{ stall: { documentId?: string; title: string } | null; portal?: string; ui?: Record<string, string> }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ rated: [] }>()

const COMMENT_MAX = 500
const categories = ['Product', 'Service', 'Cleanliness', 'Environment', 'Staff']
const ratingWords = ['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent']

const { $api, getErrorMessage } = useStrapi()
const notify = useNotify()

const rating = ref(0)
const hovered = ref(0)
const category = ref<string>()
const comment = ref('')
const submitting = ref(false)
const errorMessage = ref('')
const done = ref<'saved' | 'already' | null>(null)

watch(open, (value) => {
  if (!value) return
  rating.value = 0
  hovered.value = 0
  category.value = undefined
  comment.value = ''
  errorMessage.value = ''
  done.value = null
})

const TOKEN_KEY = 'imapsu-rater-token'
const deviceToken = () => {
  try {
    const saved = localStorage.getItem(TOKEN_KEY)
    if (saved && /^[A-Za-z0-9_-]{16,128}$/.test(saved)) return saved
    const fresh = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '')
    localStorage.setItem(TOKEN_KEY, fresh)
    return fresh
  } catch {
    // Private windows can block storage; the rating still works for this visit.
    return crypto.randomUUID().replace(/-/g, '')
  }
}

const remaining = computed(() => COMMENT_MAX - comment.value.length)
const shownRating = computed(() => hovered.value || rating.value)

const submit = async () => {
  errorMessage.value = ''
  if (!props.stall?.documentId) return
  if (rating.value < 1) {
    errorMessage.value = 'Please choose from 1 to 5 stars.'
    return
  }
  submitting.value = true
  try {
    await $api('/api/stall-ratings', {
      method: 'POST',
      body: { propertySpace: props.stall.documentId, rating: rating.value, category: category.value, comment: comment.value.trim() || undefined, deviceToken: deviceToken() }
    })
    done.value = 'saved'
    emit('rated')
    notify.success('Thanks for your rating', { description: `Your rating for ${props.stall.title} was sent.` })
  } catch (err: any) {
    const status = err?.statusCode ?? err?.status ?? err?.response?.status
    if (status === 409) done.value = 'already'
    else errorMessage.value = getErrorMessage(err)
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="stall ? `Rate ${stall.title}` : 'Rate this stall'"
    description="Your rating is anonymous. Anyone can see it on the stall's page unless the OAS hides it for breaking the community guidelines."
    :portal="portal"
    :ui="ui"
  >
    <template #body>
      <div v-if="done" class="py-2 text-center" role="status">
        <p class="text-base font-semibold text-highlighted">{{ done === 'saved' ? 'Thank you!' : 'You already rated this stall' }}</p>
        <p class="mt-1 text-sm text-muted">{{ done === 'saved' ? 'Your rating helps the stall and the OAS improve campus services.' : 'Each visitor can rate a stall once while it has the same tenant.' }}</p>
        <UButton class="mt-4" color="neutral" variant="outline" label="Close" @click="open = false" />
      </div>

      <form v-else class="space-y-5" @submit.prevent="submit">
        <div>
          <p id="rating-label" class="text-sm font-medium text-highlighted">Your rating</p>
          <div class="mt-2 flex items-center gap-3">
            <div class="flex items-center" role="radiogroup" aria-labelledby="rating-label" @mouseleave="hovered = 0">
              <button
                v-for="star in 5"
                :key="star"
                type="button"
                role="radio"
                class="rounded-md p-1 transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-primary motion-reduce:transition-none"
                :aria-checked="star === rating"
                :aria-label="`${star} star${star > 1 ? 's' : ''}, ${ratingWords[star]}`"
                :disabled="submitting"
                @mouseenter="hovered = star"
                @click="rating = star"
              >
                <RatingStar class="size-8" :class="star <= shownRating ? 'text-secondary' : 'text-(--ui-border-accented)'" />
              </button>
            </div>
            <span class="text-sm text-muted" aria-live="polite">{{ ratingWords[shownRating] }}</span>
          </div>
        </div>

        <div>
          <p class="text-sm font-medium text-highlighted">What is it about? <span class="font-normal text-muted">Optional</span></p>
          <div class="mt-2 flex flex-wrap gap-2">
            <UButton
              v-for="option in categories"
              :key="option"
              type="button"
              size="sm"
              :color="category === option ? 'primary' : 'neutral'"
              :variant="category === option ? 'solid' : 'outline'"
              :aria-pressed="category === option"
              :label="option"
              :disabled="submitting"
              @click="category = category === option ? undefined : option"
            />
          </div>
        </div>

        <UFormField label="Comment" hint="Optional" :help="`${remaining} characters left`">
          <UTextarea v-model="comment" :maxlength="COMMENT_MAX" :rows="4" placeholder="What did you like, or what could be better?" :disabled="submitting" class="w-full" />
        </UFormField>

        <p class="text-xs leading-relaxed text-muted">
          Keep it honest and respectful: no profanity, insults, links or contact details. Read the
          <NuxtLink to="/community-guidelines" target="_blank" class="font-medium text-primary hover:underline">community guidelines</NuxtLink>.
        </p>

        <UAlert v-if="errorMessage" color="error" variant="subtle" :description="errorMessage" />

        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" label="Cancel" :disabled="submitting" @click="open = false" />
          <UButton type="submit" label="Send rating" :loading="submitting" :disabled="rating < 1" />
        </div>
      </form>
    </template>
  </UModal>
</template>
