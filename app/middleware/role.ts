import { RESTRICTED_SIGN_IN } from '~/utils/accountNavigation'

export default defineNuxtRouteMiddleware((to) => {
  const { role } = useAuth()
  const allowed = (to.meta.roles ?? []) as string[]

  if (allowed.length === 0) return

  if (!role.value || !allowed.includes(role.value)) {
    // Admin addresses ask for an account that can open them instead of landing
    // somewhere unrelated. The sign-in page lets a signed-in visitor through on this reason.
    if (to.path === '/admin' || to.path.startsWith('/admin/')) {
      return navigateTo({ path: '/login', query: { redirect: to.fullPath, reason: RESTRICTED_SIGN_IN } })
    }
    return navigateTo('/properties')
  }
})
