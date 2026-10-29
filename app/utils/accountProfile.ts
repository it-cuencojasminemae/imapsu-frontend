export const sharedProfileFields = ['fullName', 'contactNumber', 'bio'] as const
export const employeeProfileFields = ['position', 'department', 'employeeId', 'officeLocation'] as const
export const tenantProfileFields = ['businessName'] as const
export const allProfileFields = [...sharedProfileFields, ...employeeProfileFields, ...tenantProfileFields] as const
export type ProfileField = typeof allProfileFields[number]
export type ProfileDraft = Record<ProfileField, string>

export const emptyProfileDraft = (): ProfileDraft => Object.fromEntries(allProfileFields.map(key => [key, ''])) as ProfileDraft

export const normalizeProfileText = (value: string | null | undefined): string => (value ?? '').trim()

// The profile fields a member may edit on their own account, by role.
export function editableProfileFields(role: string | null | undefined): readonly ProfileField[] {
  if (role === 'oas' || role === 'admin') return [...sharedProfileFields, ...employeeProfileFields]
  if (role === 'aspiring-tenant' || role === 'current-tenant') return [...sharedProfileFields, ...tenantProfileFields]
  return sharedProfileFields
}

export function profilePatch(draft: ProfileDraft, baseline: ProfileDraft, role: string | null | undefined): Partial<Record<ProfileField, string | null>> {
  return Object.fromEntries(editableProfileFields(role)
    .filter(key => normalizeProfileText(draft[key]) !== normalizeProfileText(baseline[key]))
    .map(key => [key, normalizeProfileText(draft[key]) || null]))
}
