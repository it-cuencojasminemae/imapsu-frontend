export default defineNuxtPlugin(() => {
  const navigated = useState('app-has-navigated', () => false)
  const router = useRouter()
  router.afterEach((to, from, failure) => {
    if (!failure && from.matched.length && to.path !== from.path) navigated.value = true
  })
})
