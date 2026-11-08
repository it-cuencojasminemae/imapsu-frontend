type Toast = ReturnType<typeof useToast>['toasts']['value'][number]

// Every toast gets the same status icon for its color (red alert, green
// check, blue info, amber warning), however the page that raised it was
// written. A spinner icon is kept for toasts that report work in progress,
// and the filled "highlight" style keeps its own icon.
const STATUS_ICONS: Record<string, string> = {
  success: 'i-lucide-circle-check',
  error: 'i-lucide-circle-alert',
  warning: 'i-lucide-triangle-alert',
  info: 'i-lucide-info',
  primary: 'i-lucide-bell'
}

type StyledToast = Toast & { _styled?: boolean; highlight?: boolean }

export function styleToast(toast: StyledToast) {
  if (toast._styled) return
  toast._styled = true
  // Action buttons such as Retry sit beside the title rather than under it.
  if (toast.actions?.length && !toast.orientation) toast.orientation = 'horizontal'
  if (toast.avatar || toast.highlight) return
  // Neutral notices read as information, like the blue toast in the design.
  if (!toast.color || toast.color === 'neutral' || toast.color === 'secondary') toast.color = 'info'
  if (typeof toast.icon === 'string' && toast.icon.includes('loader')) return
  toast.icon = STATUS_ICONS[toast.color] ?? STATUS_ICONS.info
}

export default defineNuxtPlugin(() => {
  const toasts = useState<StyledToast[]>('toasts', () => [])
  // Runs synchronously, before the new toast is drawn.
  watch(toasts, (list) => { for (const toast of list) styleToast(toast) }, { flush: 'sync', deep: 1 })
})
