const labels: Record<string, string> = { admin: 'MIS Administrator', oas: 'OAS staff' }

export const staffRoleLabel = (role?: string | null) => (role && labels[role]) || role || ''
