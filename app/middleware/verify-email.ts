const STATUS_TIMEOUT_MS = 4000

// The code page stays in browser history after its address is rejected, so Back
// or Forward can return to it. Replacing the entry keeps that registration from
// reopening. A failed check lets the page open, and the page keeps watching.
export default defineNuxtRouteMiddleware(async (to) => {
  // A full page load must hydrate the page the server rendered, so the page's own
  // watch reports the rejection there.
  if (import.meta.server || useNuxtApp().isHydrating) return
  const email = Array.isArray(to.query.email) ? to.query.email[0] : to.query.email
  if (!email) return
  try {
    const status = await useAuth().verificationStatus(email, { timeout: STATUS_TIMEOUT_MS })
    if (status.undeliverable) return navigateTo('/register', { replace: true })
  } catch {
    // The address could still be valid, so it is not treated as rejected.
  }
})
