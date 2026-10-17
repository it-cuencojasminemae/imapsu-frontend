export const useSecureApi = () => {
  const requestFetch = useRequestFetch()
  const csrf = useState<string | null>('csrf-token', () => null)
  const reauthentication = useReauthentication()
  return async <T>(path: string, options: any = {}): Promise<T> => {
    const method = String(options.method || 'GET').toUpperCase()
    const headers = { ...(options.headers || {}) }
    if (!['GET','HEAD','OPTIONS'].includes(method)) {
      const result = await requestFetch<{ token: string }>('/api/auth/csrf')
      csrf.value = result.token
      headers['X-CSRF-Token'] = result.token
    }
    try { return await requestFetch<T>(path, { ...options, baseURL: '', headers }) as T }
    catch(error: any) {
      const message=error?.data?.error?.message||error?.data?.message||''
      if(import.meta.client && !options.skipReauthentication && /Recent authenticator verification/.test(message) && await reauthentication.request()) {
        const fresh=await requestFetch<{token:string}>('/api/auth/csrf')
        return requestFetch<T>(path,{...options,baseURL:'',headers:{...headers,'X-CSRF-Token':fresh.token}}) as Promise<T>
      }
      throw error
    }
  }
}
