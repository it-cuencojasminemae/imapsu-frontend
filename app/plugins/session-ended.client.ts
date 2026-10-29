// Pages load their records with useFetch, which bypasses useSecureApi. Watch
// every page request for a 401 so an ended session sends the user to sign in
// instead of leaving the page on an "Unable to load" message.
export default defineNuxtPlugin(nuxtApp => {
  const endSession = useEndSession()
  watch(() => Object.values(nuxtApp.payload._errors || {}), errors => {
    if (errors.some((error: any) => (error?.statusCode ?? error?.status) === 401)) endSession()
  })
})
