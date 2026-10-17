import type { RequestStatus } from '~/utils/requestPresentation'

export function useDashboardPresentation(statuses: Ref<RequestStatus>[]) {
  const loaded = ref(statuses.every(status => status.value === 'success'))
  watch(statuses, values => {
    if (values.every(status => status === 'success')) loaded.value = true
  }, { flush: 'sync' })
  const loading = computed(() => !loaded.value && statuses.some(status => status.value === 'pending' || status.value === 'idle'))
  const failed = computed(() => !loaded.value && !loading.value && statuses.some(status => status.value === 'error'))
  return { loaded, loading, failed }
}
