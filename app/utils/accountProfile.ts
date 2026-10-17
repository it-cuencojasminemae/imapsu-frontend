export const sharedProfileFields = ['fullName', 'contactNumber', 'bio'] as const
export const employeeProfileFields = ['position', 'department', 'employeeId', 'officeLocation'] as const
export type ProfileField = typeof sharedProfileFields[number] | typeof employeeProfileFields[number]
export type ProfileDraft = Record<ProfileField, string>

export const normalizeProfileText = (value: string | null | undefined): string => (value ?? '').trim()

export function profilePatch(draft: ProfileDraft, baseline: ProfileDraft, staff: boolean): Partial<Record<ProfileField, string | null>> {
  const fields = staff ? [...sharedProfileFields, ...employeeProfileFields] : sharedProfileFields
  return Object.fromEntries(fields
    .filter(key => normalizeProfileText(draft[key]) !== normalizeProfileText(baseline[key]))
    .map(key => [key, normalizeProfileText(draft[key]) || null]))
}
