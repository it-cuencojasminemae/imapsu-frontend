import type { AuthResponse, User } from '~/types/auth'

export const useAuth = () => {
  const request = useSecureApi()
  const user = useState<User | null>('auth-user', () => null)
  const loading = useState('auth-loading', () => false)
  const mfaPending = useState('auth-mfa-pending', () => false)
  const role = computed(() => user.value?.role?.type ?? null)
  const isStudent = computed(() => role.value === 'student')
  const isAspiringTenant = computed(() => role.value === 'aspiring-tenant')
  const isCurrentTenant = computed(() => role.value === 'current-tenant')
  const isOas = computed(() => role.value === 'oas')
  const isAdmin = computed(() => role.value === 'admin')
  const setUser = (next: User | null) => {
    if (import.meta.client && (next?.id !== user.value?.id || next?.role?.type !== user.value?.role?.type)) clearNuxtData()
    user.value = next
  }
  const refreshMe = async () => {
    loading.value = true
    try { setUser(await request<User>('/api/auth/me')) }
    catch (error: any) { if (error?.statusCode === 401 || error?.status === 401) setUser(null) }
    finally { loading.value = false }
  }
  return {
    user, loading, mfaPending, role, isStudent, isAspiringTenant, isCurrentTenant, isOas, isAdmin,
    isStaff: computed(() => isOas.value || isAdmin.value),
    isAuthenticated: computed(() => !!user.value),
    displayName: computed(() => user.value?.fullName || user.value?.username || 'Account'),
    avatarUrl: computed(() => user.value?.avatar?.url || null),
    refreshMe, init: refreshMe,
    login: async (identifier: string, password: string) => {
      const data = await request<AuthResponse>('/api/auth/login', { method: 'POST', body: { identifier, password } })
      mfaPending.value = !!data.mfaRequired
      setUser(mfaPending.value ? null : data.user ?? null)
      if (!mfaPending.value) await refreshMe()
      return data.user
    },
    completeMfa: async (code: string) => { const result=await request<AuthResponse>('/api/auth/mfa/challenge', { method: 'POST', body: { code } }); mfaPending.value = false; setUser(result.user ?? null); await refreshMe() },
    register: (input: { username: string; email: string; password: string; role: string }) => request<AuthResponse>('/api/auth/register-with-role', { method: 'POST', body: input }),
    confirmEmail: async (email: string, code: string) => { const result = await request<AuthResponse>('/api/auth/confirm-email', { method: 'POST', body: { email, code } }); mfaPending.value = !!result.mfaRequired; setUser(mfaPending.value ? null : result.user ?? null); if (mfaPending.value) await navigateTo('/login'); else await refreshMe(); return result.user },
    resendConfirmation: (email: string) => request('/api/auth/resend-confirmation', { method: 'POST', body: { email } }),
    requestPasswordReset: (email: string) => request('/api/auth/password-recovery/request', { method: 'POST', body: { email } }),
    verifyPasswordReset: async (email: string, code: string) => (await request<{ resetToken: string }>('/api/auth/password-recovery/verify', { method: 'POST', body: { email, code } })).resetToken,
    // The server signs out every session, so drop any local account state too.
    resetPassword: async (email: string, resetToken: string, password: string) => { await request('/api/auth/password-recovery/reset', { method: 'POST', body: { email, resetToken, password } }); setUser(null) },
    logout: async () => { await request('/api/auth/logout', { method: 'POST' }); setUser(null) },
  }
}
