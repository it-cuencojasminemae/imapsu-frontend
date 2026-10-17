export type RequestStatus = 'idle' | 'pending' | 'success' | 'error'

// A failed or pending refresh must never replace the last successful response.
export function retainResponse<T>(previous: T | null | undefined, incoming: T | null | undefined, status: RequestStatus) {
  return status === 'success' ? incoming : previous
}

export function requestPresentation(status: RequestStatus, hasLoaded: boolean) {
  return {
    isInitialLoading: !hasLoaded && (status === 'pending' || status === 'idle'),
    isRefreshing: hasLoaded && status === 'pending',
    isInitialError: !hasLoaded && status === 'error'
  }
}
