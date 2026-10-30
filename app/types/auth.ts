export type UserRoleType = 'student' | 'aspiring-tenant' | 'current-tenant' | 'oas' | 'admin'

export interface UserRole {
  id: number
  documentId?: string
  name: string
  description?: string
  type: UserRoleType
}

export interface StrapiFile {
  id: number
  documentId?: string
  name: string
  url: string
  mime?: string
  size?: number
  width?: number
  height?: number
}

export interface User {
  security?: { mfaEnabled: boolean; mfaRequired: boolean; enrollmentDeadline: number | null; passwordChangeRequired?: boolean }
  id: number
  documentId?: string
  username: string
  email: string
  confirmed?: boolean
  blocked?: boolean
  role?: UserRole | null
  fullName?: string | null
  contactNumber?: string | null
  position?: string | null
  department?: string | null
  employeeId?: string | null
  officeLocation?: string | null
  businessName?: string | null
  bio?: string | null
  avatar?: StrapiFile | null
  createdAt?: string
  updatedAt?: string
}

export interface AuthResponse {
  mfaRequired?: boolean
  user: User
  verificationEmailSent?: boolean
}

export interface RegisterInput {
  username: string
  email: string
  password: string
  role: string
  fullName: string
  contactNumber: string
  businessName?: string
  privacyConsent: boolean
}
