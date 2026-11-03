// A tenant whose last tenancy ended goes back to aspiring tenant and keeps
// read-only access to their bills. Aspiring tenants who never rented have none,
// so links to the bills page only appear when there is something to read.
export const usePastBills = () => {
  const auth = useAuth()
  const { $api } = useStrapi()
  const key = computed(() => `past-bills:${auth.user.value?.id}:${auth.role.value}`)
  const { data } = useAsyncData(key, () => auth.isAspiringTenant.value ? $api<{ total: number }>('/api/dashboard/billing-summary') : Promise.resolve(null), { lazy: true })
  return { hasPastBills: computed(() => (data.value?.total ?? 0) > 0) }
}
