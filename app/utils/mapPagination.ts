export type MapListResponse<T> = {
  data: T[]
  meta?: { pagination?: { page: number; pageSize: number; pageCount: number; total: number } }
}

/** Fetch the complete role-filtered list without exceeding Strapi's page limit. */
export async function fetchMapPages<T>(
  fetchPage: (page: number, pageSize: number) => Promise<MapListResponse<T>>
): Promise<MapListResponse<T>> {
  const items: T[] = []
  let page = 1
  let pageCount = 1
  do {
    const response = await fetchPage(page, 100)
    if (!Array.isArray(response.data)) throw new Error('Invalid map data response')
    const pagination = response.meta?.pagination
    if (!pagination) throw new Error('Map data pagination is unavailable')
    if (pagination.page !== page || !Number.isInteger(pagination.pageCount) || pagination.pageCount < 0) {
      throw new Error('Invalid map data pagination')
    }
    pageCount = pagination.pageCount
    if (page < pageCount && response.data.length === 0) throw new Error('Incomplete map data response')
    items.push(...response.data)
    page++
  } while (page <= pageCount)
  return { data: items }
}
