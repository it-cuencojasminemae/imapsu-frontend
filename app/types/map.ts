export type MapCorner = { x: number; z: number }

/** A point in the campus model's world space (Y up). */
export type MapPosition = { x: number; y: number; z: number }

/** A marker drawn on the campus map, e.g. a stall placed by the OAS. */
export type MapPin = MapPosition & {
  id: string
  label?: string
  status?: 'Vacant' | 'Occupied'
  muted?: boolean
}

/**
 * Where a click on the map landed, and which building it belongs to: the one
 * it hit, or the nearest one when it landed on the ground beside it.
 */
export type MapPointPick = MapPosition & {
  buildingOrder: number | null
  buildingName: string | null
  /** False when the building was resolved from the ground beside it. */
  onBuilding?: boolean
}

export type MapProperty = {
  documentId?: string
  id?: string | number
  propertyCode: string
  name: string
  building: string
  floor?: string
  space_status: 'Vacant' | 'Occupied'
  businessName?: string
  productsServices?: string
  operatingDetails?: string
  monthlyRent?: number | string
  photos?: { id: number; url?: string; name?: string }[] | null
  tenantPhotos?: { id: number; url?: string; name?: string }[] | null
  mapPosition?: MapPosition | null
}

export type MapZone = {
  buildingOrder?: number
  documentId?: string
  id?: string | number
  name: string
  description?: string
  color?: string
  height?: number | string
  baseY?: number | null
  type?: string
  corners: MapCorner[]
  propertySpace?: {
    documentId?: string
    propertyCode?: string
    name?: string
    building?: string
    space_status?: string
    monthlyRent?: number | string
  } | null
}
