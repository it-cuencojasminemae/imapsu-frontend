import type { MapProperty } from '../types/map.ts'

export type StallPhoto = { id: number; url: string; name?: string }

export const stallKey = (property: MapProperty) => String(property.documentId ?? property.id ?? property.propertyCode)

export const visibleStalls = (properties: MapProperty[], isStudent: boolean) =>
  isStudent ? properties.filter(property => property.space_status === 'Occupied') : properties

export function stallTitle(property: MapProperty): string {
  return (property.space_status === 'Occupied' ? property.businessName?.trim() : '') || property.name?.trim() || property.propertyCode
}

export function resolveStallPhotoUrl(value: string | undefined, baseURL: string): string | null {
  if (!value?.trim()) return null
  try {
    const url = new URL(value.trim(), `${baseURL.replace(/\/$/, '')}/`)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null
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
