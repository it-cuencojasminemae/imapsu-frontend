export type StallStatus = 'Vacant' | 'Occupied' | 'In review'

/**
 * The status shown for a stall. A vacant stall the OAS is reviewing an
 * application for reads "In review", and nobody else can apply for it until
 * that review ends. The server sets `inReview` on every stall it returns.
 */
export function stallStatus(stall: { space_status?: unknown; inReview?: boolean | null }): StallStatus | null {
  const status = stall.space_status === 'Vacant' || stall.space_status === 'Occupied' ? stall.space_status : null
  return status === 'Vacant' && stall.inReview ? 'In review' : status
}

/** Nuxt UI badge colour for a stall status on the campus map. */
export function stallStatusColor(status: StallStatus | null): 'success' | 'error' | 'warning' | 'neutral' {
  return status === 'Vacant' ? 'success' : status === 'Occupied' ? 'error' : status === 'In review' ? 'warning' : 'neutral'
}
