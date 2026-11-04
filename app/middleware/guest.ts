import { landingPath, RESTRICTED_SIGN_IN } from '~/utils/accountNavigation'

// Sign-in pages are for signed-out visitors. Someone already signed in (for
// example after pressing Back from the dashboard) goes to their landing page,
// unless they were sent here to use a different account for an admin page.
export default defineNuxtRouteMiddleware((to) => {
  const { user } = useAuth()
  if (user.value && to.query.reason !== RESTRICTED_SIGN_IN) return navigateTo(landingPath(user.value), { replace: true })
})
