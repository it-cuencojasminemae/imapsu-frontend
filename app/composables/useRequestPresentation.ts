import { requestPresentation, retainResponse, type RequestStatus } from '~/utils/requestPresentation'

export function useRequestPresentation<T>(source: Ref<T | null | undefined>, status: Ref<RequestStatus>) {
  const retained = shallowRef<T | null | undefined>(source.value)
  const hasLoaded = ref(status.value === 'success')
  watch([source, status], ([incoming, currentStatus]) => {
    retained.value = retainResponse(retained.value, incoming, currentStatus)
    if (currentStatus === 'success') hasLoaded.value = true
  }, { immediate: true, flush: 'sync' })
  const presentation = computed(() => requestPresentation(status.value, hasLoaded.value))
  return {
    data: computed(() => hasLoaded.value ? retained.value : source.value),
    hasLoaded,
    isInitialLoading: computed(() => presentation.value.isInitialLoading),
    isRefreshing: computed(() => presentation.value.isRefreshing),
    isInitialError: computed(() => presentation.value.isInitialError)
  }
}
