import { landingPath } from '~/utils/accountNavigation'

// Sign-in pages are for signed-out visitors. Someone already signed in (for
// example after pressing Back from the dashboard) goes to their landing page.
export default defineNuxtRouteMiddleware(() => {
  const { user } = useAuth()
  if (user.value) return navigateTo(landingPath(user.value), { replace: true })
})
