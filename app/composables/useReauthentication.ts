export const useReauthentication = () => {
  const open = useState('reauthentication-open', () => false)
  const app = useNuxtApp() as any
  const request = () => {
    if(app._reauthenticationPromise)return app._reauthenticationPromise as Promise<boolean>
    open.value = true
    app._reauthenticationPromise = new Promise<boolean>(resolve => { app._reauthenticationResolve = resolve })
    return app._reauthenticationPromise as Promise<boolean>
  }
  const finish = (verified: boolean) => { open.value = false; app._reauthenticationResolve?.(verified); app._reauthenticationResolve = null; app._reauthenticationPromise = null }
  return { open, request, finish }
}
