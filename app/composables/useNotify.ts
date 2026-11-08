// Short helpers over Nuxt UI's toasts. The status icon is filled in by the
// toast-style plugin, so callers only give the words.
type NotifyOptions = {
  description?: string
  duration?: number
  actions?: { label: string; onClick: () => void }[]
}

export function useNotify() {
  const toast = useToast()
  const show = (color: 'success' | 'error' | 'warning' | 'info', title: string, options: NotifyOptions = {}) =>
    toast.add({
      title,
      description: options.description,
      color,
      duration: options.duration,
      actions: options.actions?.map(action => ({ label: action.label, size: 'xs' as const, color: 'neutral' as const, variant: 'outline' as const, onClick: action.onClick }))
    })

  return {
    success: (title: string, options?: NotifyOptions) => show('success', title, options),
    error: (title: string, options?: NotifyOptions) => show('error', title, { duration: 7000, ...options }),
    warning: (title: string, options?: NotifyOptions) => show('warning', title, options),
    info: (title: string, options?: NotifyOptions) => show('info', title, options),
    // Work in progress: a spinner and no countdown until it is updated or removed.
    loading: (title: string, description?: string) =>
      toast.add({ title, description, color: 'info', icon: 'i-lucide-loader-circle', duration: 0, progress: false, ui: { icon: 'animate-spin motion-reduce:animate-none' } }),
    // Closes a toast, usually a loading one once its work has finished.
    dismiss: (shown?: { id: string | number } | null) => { if (shown) toast.remove(shown.id) },
    // The filled maroon card for news worth noticing, such as a new announcement.
    highlight: (title: string, options: NotifyOptions & { icon?: string } = {}) =>
      toast.add({
        title,
        description: options.description,
        icon: options.icon ?? 'i-lucide-megaphone',
        color: 'primary',
        duration: options.duration,
        highlight: true,
        actions: options.actions?.map(action => ({ label: action.label, size: 'xs' as const, color: 'neutral' as const, variant: 'solid' as const, class: 'bg-white text-maroon-900 hover:bg-maroon-50', onClick: action.onClick })),
        ui: {
          root: 'bg-maroon-800 ring-maroon-900 text-white',
          title: 'text-white',
          description: 'text-maroon-100',
          icon: 'text-gold-300',
          close: 'text-maroon-100 hover:text-white hover:bg-white/10',
          progress: '[&_[data-slot=indicator]]:bg-gold-400'
        }
      } as Parameters<typeof toast.add>[0])
  }
}
