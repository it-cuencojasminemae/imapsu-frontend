export type HomeService = { title: string; description: string; to: string; icon: string; action: string }
const service = (title: string, description: string, to: string, icon: string, action: string): HomeService => ({ title, description, to, icon: `i-lucide-${icon}`, action })
const map = service('Campus Stall Directory', 'Explore stall locations and view listed business, occupancy, and availability information where permitted.', '/campus-map', 'map-pinned', 'Open Campus Map')
const rentals = service('Rental Applications', "Review available rental spaces and submit an application through the university's established process.", '/properties', 'clipboard-list', 'Browse Rentable Spaces')
const announcements = service('Announcements', 'View official notices, advisories, and updates from the Office of Auxiliary Services.', '/announcements', 'megaphone', 'View Announcements')
export function homePresentation(role: string | null) {
  if (role === 'admin') return {
    heading: 'System Administration', description: 'Manage user access, review system activity, and monitor the campus stall management platform.',
    primary: { label: 'Open Admin Dashboard', to: '/admin', icon: 'i-lucide-layout-dashboard' }, secondary: { label: 'View System Monitoring', to: '/admin/system-monitoring', icon: 'i-lucide-activity' },
    services: [service('User Management', 'Review user accounts and manage access to campus services.', '/admin/users', 'users-round', 'Manage Users'), service('System Monitoring', 'Review platform health, sign-in activity, and recorded system errors.', '/admin/system-monitoring', 'activity', 'View Monitoring'), service('Audit History', 'Review recorded administrative actions and system activity.', '/admin/audit-logs', 'scroll-text', 'View Audit Logs')]
  }
  if (role === 'oas') return {
    heading: 'Campus Stall Operations', description: 'Manage rental applications, monitor stall occupancy, review billing records, and address maintenance requests.',
    primary: { label: 'Open OAS Dashboard', to: '/admin', icon: 'i-lucide-layout-dashboard' }, secondary: { label: 'View Campus Map', to: '/campus-map', icon: 'i-lucide-map-pinned' },
    services: [service('Rental Applications', 'Review applications, supporting documents, and scheduled office visits.', '/admin/applications', 'clipboard-list', 'Review Applications'), service('Receipt Verification', 'Review submitted receipts and manage billing records.', '/admin/bills', 'file-check-2', 'Review Bills'), service('Maintenance', 'Review reported issues and update maintenance requests.', '/admin/maintenance', 'wrench', 'View Requests')]
  }
  if (role === 'current-tenant') return {
    heading: 'Your Campus Tenancy', description: 'Review your tenancy details and bills, submit maintenance requests, and keep your account information up to date.',
    primary: { label: 'View My Bills', to: '/bills', icon: 'i-lucide-receipt' }, secondary: { label: 'My Account', to: '/account', icon: 'i-lucide-circle-user-round' },
    services: [service('My Tenancy', 'View your rental space, contract details, and renewal information.', '/tenancy', 'key-round', 'View Tenancy'), service('Advance Billing and Receipts', 'Review advance billing notices and submit official receipts after paying through the University Cashier.', '/bills', 'receipt', 'View Bills'), service('Maintenance Requests', 'Report a maintenance concern and track its recorded status.', '/maintenance', 'wrench', 'View Requests'), announcements]
  }
  if (role === 'aspiring-tenant') return {
    heading: 'Campus Stall Rentals', description: 'View listed campus stalls and property spaces, review rental requirements, and track your applications.',
    primary: { label: 'View My Applications', to: '/rental-applications', icon: 'i-lucide-clipboard-list' }, secondary: { label: 'Browse Vacant Spaces', to: '/properties', icon: 'i-lucide-store' },
    services: [service('Rental Applications', 'Track your applications and review requirements for your scheduled office visit.', '/rental-applications', 'clipboard-list', 'View Applications'), rentals, announcements]
  }
  if (role === 'student') return {
    heading: 'Campus Stall Information', description: 'Locate campus stalls, view information about occupied property spaces, and read official campus announcements.',
    primary: { label: 'Explore Campus Map', to: '/campus-map', icon: 'i-lucide-map-pinned' }, secondary: { label: 'View Properties', to: '/properties', icon: 'i-lucide-store' },
    services: [map, announcements, service('Student Feedback', 'Submit feedback about the products and services offered by campus stall tenants.', '/feedback', 'message-square-text', 'View Feedback')]
  }
  return {
    heading: 'Campus Stalls and Services', description: 'Explore rentable spaces, locate campus stalls, and view listed business information through the interactive campus map.',
    primary: { label: 'Explore Campus Map', to: '/campus-map', icon: 'i-lucide-map-pinned' }, secondary: { label: 'Sign In', to: '/login', icon: 'i-lucide-log-in' },
    // The existing property directory requires authentication.
    services: [map, { ...rentals, to: '/register', action: 'Register to Get Started' }, announcements, service('Student Feedback', 'Students can submit feedback about the products and services offered by campus stall tenants. Sign in with an authorized account.', '/login?redirect=/feedback', 'message-square-text', 'Sign In for Feedback')]
  }
}
export function propertySummary(records: { space_status?: string | null }[], student: boolean) {
  const visible = student ? records.filter(record => record.space_status === 'Occupied') : records
  const summary = [{ label: 'Listed property spaces', value: visible.length }, { label: 'Occupied property spaces', value: visible.filter(record => record.space_status === 'Occupied').length }]
  if (!student) summary.push({ label: 'Available property spaces', value: visible.filter(record => record.space_status === 'Vacant').length })
  return summary
}
