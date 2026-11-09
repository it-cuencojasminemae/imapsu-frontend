export type StatusHistoryEntry = {
  id: number
  fromStatus?: string | null
  toStatus: string
  changedAt: string
  changedBy?: { id: number; username?: string } | null
}

export type StatusHistoryEntityType = 'rental-application' | 'renewal-intent' | 'maintenance-ticket' | 'bill' | 'tenancy'

// Loads the recorded status changes of one record, for the history modal and
// for pages that show the history inline.
export const useStatusHistory = (entityType: MaybeRefOrGetter<StatusHistoryEntityType>, entityId: MaybeRefOrGetter<string>) => {
  const { $api, getErrorMessage } = useStrapi()
  const entries = ref<StatusHistoryEntry[]>([])
  const loading = ref(false)
  const loadError = ref('')

  const load = async () => {
    loading.value = true
    loadError.value = ''
    try {
      entries.value = await $api<StatusHistoryEntry[]>('/api/status-histories', {
        query: { entityType: toValue(entityType), entityId: toValue(entityId) }
      })
    } catch (err) {
      loadError.value = getErrorMessage(err)
    } finally {
      loading.value = false
    }
  }

  return { entries, loading, loadError, load }
}

export const formatHistoryDateTime = (value?: string) => value
  ? new Date(value).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  : ''
