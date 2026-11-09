// Shared presentation for the OAS rental applications list and its review page.

export type ReviewMedia = { id: number; url?: string; name?: string }
export type ReviewUser = { id: number; username?: string; email?: string; avatar?: { url?: string } | null }

export type ApplicationStatus = 'Pending' | 'For Review' | 'For Recommendation' | 'Approved' | 'Declined' | 'Cancelled'
export type RenewalStatus = 'Pending' | 'Approved' | 'Rejected'

export type ApplicationItem = {
  kind: 'application'
  id: number | string
  documentId?: string
  status: ApplicationStatus
  message?: string
  createdAt?: string
  user?: ReviewUser | null
  evaluation?: string
  recommendation?: string
  letterOfIntent?: ReviewMedia | null
  dtiDocuments?: ReviewMedia[] | null
  birDocuments?: ReviewMedia[] | null
  businessPermits?: ReviewMedia[] | null
  productsServices?: string
  appearanceDate?: string
  appearanceConfirmed?: boolean
  propertySpace?: { documentId?: string; name?: string; propertyCode?: string; building?: string; monthlyRent?: number | string | null } | null
  tenancy?: { documentId?: string; startDate?: string; endDate?: string; status?: string } | null
  applicantRole?: string | null
}

export type RenewalItem = {
  kind: 'renewal'
  id: number | string
  documentId?: string
  status: RenewalStatus
  message?: string
  createdAt?: string
  user?: ReviewUser | null
  letterOfRenewal?: ReviewMedia | null
  tenancy?: { documentId?: string; propertySpace?: { name?: string; propertyCode?: string; building?: string } | null } | null
}

export type ReviewItem = ApplicationItem | RenewalItem
export type ReviewKind = ReviewItem['kind']

export const APPLICATION_STATUS_OPTIONS = ['Pending', 'For Review', 'For Recommendation', 'Approved', 'Declined', 'Cancelled'].map(value => ({ label: value, value }))
export const RENEWAL_STATUS_OPTIONS = ['Pending', 'Approved', 'Rejected'].map(value => ({ label: value, value }))

// Once a decision is made it only moves forward: an approved application can
// still be cancelled, and Declined, Cancelled and decided renewals are final.
// Keep in step with backend/src/utils/status-locks.ts.
const LOCKED_NEXT: Record<ReviewKind, Record<string, string[] | undefined>> = {
  application: { Approved: ['Cancelled'], Declined: [], Cancelled: [] },
  renewal: { Approved: [], Rejected: [] }
}

const nextStatuses = (item: ReviewItem) => LOCKED_NEXT[item.kind][item.status]

// An application keeps its link to the tenancy it became, even after that tenancy ends.
export const isLeasedApplication = (item: ReviewItem): item is ApplicationItem => item.kind === 'application' && !!item.tenancy
export const isLeaseActive = (item: ReviewItem) => isLeasedApplication(item) && item.tenancy?.status === 'Active'

// Locked items have no OAS action left, so the list offers Details instead of Review.
export const isReviewLocked = (item: ReviewItem) => isLeasedApplication(item) || nextStatuses(item)?.length === 0

export const reviewStatusOptions = (item: ReviewItem) => {
  const all = item.kind === 'renewal' ? RENEWAL_STATUS_OPTIONS : APPLICATION_STATUS_OPTIONS
  const next = nextStatuses(item)
  return next ? all.filter(option => option.value === item.status || next.includes(option.value)) : all
}

export const reviewStatusNote = (item: ReviewItem) => {
  if (isLeasedApplication(item)) return 'This application became a lease, so its status can no longer change.'
  const next = nextStatuses(item)
  if (!next) return undefined
  return next.length
    ? `Already ${item.status.toLowerCase()}. It can only be changed to ${next.join(' or ')}.`
    : `Already ${item.status.toLowerCase()}, so the status can no longer change.`
}

export const reviewStatusColor = (status: string) => {
  switch (status) {
    case 'Approved':
      return 'success' as const
    case 'Declined':
    case 'Rejected':
      return 'error' as const
    case 'Cancelled':
      return 'neutral' as const
    case 'For Review':
      return 'warning' as const
    default:
      return 'secondary' as const
  }
}

export const reviewStatusLabel = (item: ReviewItem) => isLeaseActive(item) ? 'Lease active' : isLeasedApplication(item) ? 'Lease ended' : item.status
export const reviewStatusBadgeColor = (item: ReviewItem) => isLeasedApplication(item) && !isLeaseActive(item) ? 'neutral' as const : reviewStatusColor(item.status)

export const reviewPropertyName = (item: ReviewItem) =>
  (item.kind === 'renewal' ? item.tenancy?.propertySpace?.name : item.propertySpace?.name) ?? 'Property removed'

export const reviewPropertyCode = (item: ReviewItem) =>
  item.kind === 'renewal' ? item.tenancy?.propertySpace?.propertyCode : item.propertySpace?.propertyCode

export const reviewKindLabel = (item: ReviewItem) => item.kind === 'renewal' ? 'Renewal' : 'Application'

export const reviewPath = (item: Pick<ReviewItem, 'kind' | 'documentId' | 'id'>) =>
  `/admin/applications/${item.kind}/${item.documentId ?? item.id}`

export const formatReviewDate = (value?: string) => {
  if (!value) return ''
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(value + 'T00:00:00') : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}
