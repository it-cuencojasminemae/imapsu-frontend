import { requiresAccountSetup, SECURITY_PATH } from '~/utils/accountNavigation'

export default defineNuxtRouteMiddleware((to) => {
  const { user } = useAuth()
  if (requiresAccountSetup(user.value) && !['/account', '/login', '/register', '/verify-email', '/forgot-password', '/privacy'].includes(to.path)) {
    return navigateTo(SECURITY_PATH, { replace: true })
  }
})
