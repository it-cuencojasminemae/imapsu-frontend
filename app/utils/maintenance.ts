// Shared presentation for maintenance tickets (OAS and tenant pages).

export type MaintenanceStatus = 'Pending' | 'In Progress' | 'Completed'
export type MaintenancePriority = 'Low' | 'Normal' | 'High' | 'Critical'
export type MaintenanceCategory = 'Plumbing' | 'Electrical' | 'Structural' | 'Internet' | 'Other'

export type MaintenancePhoto = { id: number; url?: string; name?: string }

export type MaintenanceTicket = {
  id: number | string
  documentId?: string
  category: MaintenanceCategory
  priority: MaintenancePriority
  description: string
  status: MaintenanceStatus
  createdAt?: string
  completedAt?: string | null
  archivedAt?: string | null
  actionNotes?: string | null
  images?: MaintenancePhoto[] | null
  propertySpace?: { documentId?: string; name?: string; propertyCode?: string; building?: string } | null
  reporter?: { id: number; username?: string; email?: string } | null
  followUps?: { message: string; author: string; createdAt: string }[] | null
}

export type MaintenanceActivity = {
  id: number | string
  action: 'submitted' | 'status_changed' | 'priority_changed' | 'category_changed' | 'notes_updated' | 'reopened' | 'archived' | 'unarchived'
  fromValue?: string | null
  toValue?: string | null
  note?: string | null
  performedBy?: { id: number; username?: string | null } | null
  createdAt: string
}

export const MAINTENANCE_STATUSES: MaintenanceStatus[] = ['Pending', 'In Progress', 'Completed']
export const MAINTENANCE_CATEGORIES: MaintenanceCategory[] = ['Plumbing', 'Electrical', 'Structural', 'Internet', 'Other']
export const MAINTENANCE_PRIORITIES: MaintenancePriority[] = ['Low', 'Normal', 'High', 'Critical']

export const ticketKey = (ticket: Pick<MaintenanceTicket, 'id' | 'documentId'>) => String(ticket.documentId ?? ticket.id)

// A readable reference built from the numeric id, e.g. MT-0007.
export const ticketNumber = (ticket: Pick<MaintenanceTicket, 'id'>) =>
  /^\d+$/.test(String(ticket.id)) ? `MT-${String(ticket.id).padStart(4, '0')}` : 'MT-—'

// "MT-7", "mt0007" or "7" typed into a search box → 7.
export const parseTicketNumber = (value: string) => {
  const match = value.trim().match(/^(?:mt-?)?0*(\d+)$/i)
  return match && /mt/i.test(value) ? Number(match[1]) : null
}

export const maintenanceStatusColor = (status: MaintenanceStatus) =>
  status === 'Completed' ? 'success' : status === 'In Progress' ? 'secondary' : 'primary'

export const maintenancePriorityColor = (priority: MaintenancePriority) => {
  switch (priority) {
    case 'Critical': return 'error'
    case 'High': return 'warning'
    case 'Low': return 'neutral'
    default: return 'secondary'
  }
}

export const maintenanceCategoryIcon = (category: MaintenanceCategory) => {
  switch (category) {
    case 'Plumbing': return 'i-lucide-droplets'
    case 'Electrical': return 'i-lucide-zap'
    case 'Structural': return 'i-lucide-hammer'
    case 'Internet': return 'i-lucide-wifi'
    default: return 'i-lucide-package-open'
  }
}

export const formatTicketDate = (value?: string | null) => value
  ? new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  : ''

export const formatTicketDateTime = (value?: string | null) => value
  ? new Date(value).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  : ''

// How long an unresolved ticket has been waiting, in whole days.
export const openDuration = (createdAt?: string, now = Date.now()) => {
  if (!createdAt) return ''
  const days = Math.max(0, Math.floor((now - new Date(createdAt).getTime()) / 86_400_000))
  return days === 0 ? 'Opened today' : `Open ${days} day${days === 1 ? '' : 's'}`
}

const by = (entry: MaintenanceActivity) => entry.performedBy?.username ?? 'a former account'

export const activityTitle = (entry: MaintenanceActivity, reporterId?: number | null) => {
  switch (entry.action) {
    case 'submitted': {
      const tenant = entry.toValue ?? 'tenant'
      const filedByStaff = entry.performedBy && reporterId != null && entry.performedBy.id !== reporterId
      return filedByStaff ? `Filed by ${by(entry)} on behalf of ${tenant}` : `Submitted by ${tenant}`
    }
    case 'status_changed':
      if (entry.toValue === 'Completed') return `Completed by ${by(entry)}`
      return entry.fromValue === 'Pending' || !entry.fromValue
        ? `Status changed to ${entry.toValue} by ${by(entry)}`
        : `Status changed from ${entry.fromValue} to ${entry.toValue} by ${by(entry)}`
    case 'priority_changed':
      return `Priority changed from ${entry.fromValue ?? 'none'} to ${entry.toValue} by ${by(entry)}`
    case 'category_changed':
      return `Category changed from ${entry.fromValue} to ${entry.toValue} by ${by(entry)}`
    case 'notes_updated':
      return `Action notes updated by ${by(entry)}`
    case 'reopened':
      return `Reopened by ${by(entry)}`
    case 'archived':
      return `Archived by ${by(entry)}`
    case 'unarchived':
      return `Restored from the archive by ${by(entry)}`
  }
}

export const activityIcon = (entry: MaintenanceActivity) => {
  switch (entry.action) {
    case 'submitted': return 'i-lucide-inbox'
    case 'status_changed':
      return entry.toValue === 'Completed' ? 'i-lucide-check-check' : entry.toValue === 'In Progress' ? 'i-lucide-play' : 'i-lucide-clock'
    case 'priority_changed': return 'i-lucide-flag'
    case 'category_changed': return 'i-lucide-tag'
    case 'notes_updated': return 'i-lucide-notebook-pen'
    case 'reopened': return 'i-lucide-rotate-ccw'
    case 'archived': return 'i-lucide-archive'
    case 'unarchived': return 'i-lucide-archive-restore'
  }
}
