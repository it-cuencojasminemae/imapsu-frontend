import type { MapProperty } from '../types/map.ts'

export type StallPhoto = { id: number; url: string; name?: string }

export const stallKey = (property: MapProperty) => String(property.documentId ?? property.id ?? property.propertyCode)

export const visibleStalls = (properties: MapProperty[], isStudent: boolean) =>
  isStudent ? properties.filter(property => property.space_status === 'Occupied') : properties

export function stallTitle(property: MapProperty): string {
  return (property.space_status === 'Occupied' ? property.businessName?.trim() : '') || property.name?.trim() || property.propertyCode
}

/** Readable floor, e.g. "1" -> "1st floor", "G" -> "Ground floor"; free text is kept. */
export function stallFloorLabel(floor: string | undefined): string | null {
  const value = floor?.trim()
  if (!value) return null
  if (/^(g|gf|ground)( ?floor)?$/i.test(value)) return 'Ground floor'
  if (/^\d+$/.test(value)) {
    const n = Number(value)
    const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'
    return `${n}${suffix} floor`
  }
  return value
}

// Placeholder origin for an empty baseURL: uploads are then served by this
// site's own /uploads proxy, so the result stays a root-relative path.
const SAME_ORIGIN = 'http://same-origin.invalid'

export function resolveStallPhotoUrl(value: string | undefined, baseURL: string): string | null {
  if (!value?.trim()) return null
  try {
    const base = baseURL.trim() ? baseURL.trim().replace(/\/$/, '') : SAME_ORIGIN
    const url = new URL(value.trim(), `${base}/`)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.origin === SAME_ORIGIN ? `${url.pathname}${url.search}${url.hash}` : url.href
  } catch {
    return null
  }
}

/** Use only uploaded media already present in the permitted property response. */
export function stallPhotos(property: MapProperty, baseURL: string): StallPhoto[] {
  const resolve = (photos: MapProperty['photos']) => (photos ?? []).flatMap(photo => {
    const url = resolveStallPhotoUrl(photo.url, baseURL)
    return url ? [{ ...photo, url }] : []
  })
  const tenant = property.space_status === 'Occupied' ? resolve(property.tenantPhotos) : []
  return tenant.length ? tenant : resolve(property.photos)
}
