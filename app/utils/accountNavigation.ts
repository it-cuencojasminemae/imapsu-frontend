type Account = {
  role?: { type?: string } | null
  security?: { passwordChangeRequired?: boolean; mfaRequired: boolean; mfaEnabled: boolean; enrollmentDeadline: number | null }
} | null

export const SECURITY_PATH = '/account?section=security'

export function requiresAccountSetup(user: Account, now = Date.now()): boolean {
  const security = user?.security
  return !!(security?.passwordChangeRequired || (security?.mfaRequired && !security.mfaEnabled && security.enrollmentDeadline !== null && security.enrollmentDeadline <= now))
}

export function landingPath(user: Account, now = Date.now()): string {
  if (!user) return '/campus-map'
  if (requiresAccountSetup(user, now)) return SECURITY_PATH
  return ['oas', 'admin'].includes(user.role?.type ?? '') ? '/admin' : '/dashboard'
}

// Router destinations must stay on this origin, including after URL decoding.
export function internalRedirect(value: unknown): string | null {
  if (typeof value !== 'string' || !value.startsWith('/')) return null
  try {
    const decoded = decodeURIComponent(value)
    if (!decoded.startsWith('/') || decoded.startsWith('//') || /[\\\s\u0000-\u001f\u007f]/.test(decoded)) return null
    return value
  } catch { return null }
}

export const accountSections = ['profile', 'security', 'preferences'] as const
export type AccountSection = typeof accountSections[number]
export function accountSection(value: unknown): AccountSection {
  return accountSections.includes(value as AccountSection) ? value as AccountSection : 'profile'
}
