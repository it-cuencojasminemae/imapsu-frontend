// When the server ends a signed-in session (for example after a lease turns
// an aspiring tenant into a current tenant, a password change, or an expired
// sign-in), send the user to sign in again with an explanation instead of a
// failed request.
export const useEndSession = () => {
  const nuxtApp = useNuxtApp()
  const authUser = useState<unknown>('auth-user', () => null)
  return () => nuxtApp.runWithContext(() => {
    if (!authUser.value) return
    authUser.value = null
    clearNuxtData()
    return navigateTo({ path: '/login', query: { reason: 'session-ended' } })
  })
}
