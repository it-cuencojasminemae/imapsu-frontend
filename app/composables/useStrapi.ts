export const useStrapi = () => {
  const config = useRuntimeConfig()
  const baseURL = ''

  const authHeaders = computed<Record<string, string>>(() => ({}))

  const $api = useSecureApi()

  const getErrorMessage = (err: unknown) =>
    (err as any)?.data?.error?.message ?? (err as any)?.data?.message ?? 'Unable to complete the request. Please try again.'

  return { baseURL, authHeaders, $api, getErrorMessage }
}
