export type ConfirmTone = 'danger' | 'warning' | 'primary'

export type ConfirmOptions = {
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  tone?: ConfirmTone
  icon?: string
}

// One app-wide confirmation dialog (rendered by <ConfirmDialog /> in app.vue) that replaces window.confirm.
export const useConfirmDialog = () => {
  const open = useState('confirm-dialog-open', () => false)
  const options = useState<ConfirmOptions>('confirm-dialog-options', () => ({ title: '' }))
  const app = useNuxtApp() as any
  const finish = (confirmed: boolean) => {
    open.value = false
    app._confirmDialogResolve?.(confirmed)
    app._confirmDialogResolve = null
  }
  const confirm = (next: ConfirmOptions) => {
    if (import.meta.server) return Promise.resolve(false)
    // A newer request supersedes one still on screen.
    app._confirmDialogResolve?.(false)
    options.value = next
    open.value = true
    return new Promise<boolean>(resolve => { app._confirmDialogResolve = resolve })
  }
  return { open, options, confirm, finish }
}
