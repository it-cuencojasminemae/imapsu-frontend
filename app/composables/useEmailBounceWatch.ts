const POLL_INTERVAL_MS = 8000
const WATCH_DURATION_MS = 5 * 60 * 1000

// A mail server rejects a nonexistent mailbox within moments of receiving the
// code, so the sign-up screens watch briefly and report it while the person is
// still there. An account that is never reported is removed after 24 hours.
export function useEmailBounceWatch(email: () => string) {
  const auth = useAuth()
  const bounced = ref(false)
  let timer: ReturnType<typeof setInterval> | null = null

  const stop = () => {
    if (timer) clearInterval(timer)
    timer = null
  }

  const start = () => {
    stop()
    bounced.value = false
    const startedAt = Date.now()
    const check = async () => {
      if (Date.now() - startedAt > WATCH_DURATION_MS) return stop()
      try {
        const status = await auth.verificationStatus(email())
        if (status.undeliverable && timer) {
          bounced.value = true
          stop()
        }
      } catch {
        // A failed check is simply retried on the next tick.
      }
    }
    timer = setInterval(check, POLL_INTERVAL_MS)
    check()
  }

  onBeforeUnmount(stop)
  return { bounced, start, stop }
}
