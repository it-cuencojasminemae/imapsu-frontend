// Menus and dialogs read their speed from main.css, so the sign-in screens can keep their own.
const menuMotion = 'data-[state=open]:animate-[scale-in_var(--app-motion-menu)_var(--app-overlay-ease)] data-[state=closed]:animate-[scale-out_var(--app-motion-menu-exit)_var(--app-overlay-ease)]'

export default defineAppConfig({
  ui: {
    colors: {
      primary: 'maroon',
      secondary: 'gold',
      neutral: 'stone'
    },
    button: {
      slots: {
        base: 'rounded-lg font-medium inline-flex items-center justify-center disabled:cursor-not-allowed aria-disabled:cursor-not-allowed disabled:opacity-75 aria-disabled:opacity-75 transition-colors duration-(--app-motion-fast)',
        leadingIcon: 'size-4 shrink-0',
        trailingIcon: 'size-4 shrink-0'
      },
      compoundVariants: [
        {
          color: 'primary',
          variant: 'solid',
          class: 'text-white bg-maroon-800 hover:bg-maroon-700 active:bg-maroon-900 disabled:bg-maroon-800 aria-disabled:bg-maroon-800 outline-maroon-400/40 focus-visible:outline-3'
        }
      ]
    },
    card: {
      slots: {
        root: 'rounded-xl overflow-hidden ring-1 ring-default shadow-none',
        header: 'px-5 py-4',
        body: 'p-5',
        footer: 'px-5 py-4'
      }
    },
    input: {
      slots: {
        root: 'w-full',
        base: 'w-full rounded-lg border-0 appearance-none placeholder:text-dimmed disabled:cursor-not-allowed disabled:opacity-75 transition-colors'
      }
    },
    select: {
      slots: {
        base: 'w-full'
      },
      variants: {
        position: {
          popper: { content: menuMotion }
        }
      }
    },
    inputMenu: {
      slots: { content: menuMotion }
    },
    // A shade darker than the default so loading placeholders read on white cards.
    skeleton: {
      base: 'animate-pulse rounded-md bg-accented/80'
    },
    dropdownMenu: {
      slots: { content: menuMotion }
    },
    popover: {
      slots: { content: menuMotion }
    },
    tooltip: {
      slots: { content: 'data-[state=delayed-open]:animate-[scale-in_var(--app-motion-menu)_var(--app-overlay-ease)] data-[state=closed]:animate-[scale-out_var(--app-motion-menu-exit)_var(--app-overlay-ease)]' }
    },
    modal: {
      variants: {
        transition: {
          true: {
            overlay: 'data-[state=open]:animate-[fade-in_var(--app-motion-overlay)_var(--app-overlay-ease)] data-[state=closed]:animate-[fade-out_var(--app-motion-overlay-exit)_var(--app-overlay-ease)]',
            content: 'data-[state=open]:animate-[scale-in_var(--app-motion-overlay)_var(--app-overlay-ease)] data-[state=closed]:animate-[scale-out_var(--app-motion-overlay-exit)_var(--app-overlay-ease)]'
          }
        }
      }
    },
    // Toasts are white cards with a colored status icon, a bold title, a muted
    // description and a countdown bar along the bottom edge in the same color.
    // They slide in from the side with a slight scale and slide back out.
    toast: {
      slots: {
        root: 'relative group overflow-hidden bg-default rounded-xl ring-1 ring-default shadow-[0_12px_32px_-12px_rgb(28_25_23/0.28)] pl-4 pr-3 pt-3.5 pb-4 flex gap-3',
        title: 'text-sm font-semibold text-highlighted',
        description: 'text-sm leading-relaxed text-muted',
        icon: 'shrink-0 size-5',
        actions: 'flex gap-1.5 shrink-0',
        progress: 'absolute inset-x-0 bottom-0 [&_[data-slot=base]]:h-[3px] [&_[data-slot=base]]:rounded-none [&_[data-slot=base]]:bg-transparent'
      },
      variants: {
        orientation: {
          vertical: { root: 'items-start', actions: 'items-start mt-3' }
        }
      }
    },
    toaster: {
      slots: { viewport: 'w-[calc(100%-2rem)] sm:w-[25rem]' },
      compoundVariants: [
        {
          position: ['top-left', 'top-center', 'top-right', 'bottom-left', 'bottom-right'],
          class: { base: 'data-[state=open]:animate-[imapsu-toast-in_var(--app-motion-overlay)_var(--app-ease)] data-[state=closed]:animate-[imapsu-toast-out_220ms_var(--ease-in)]' }
        },
        {
          // Phones show toasts bottom-center (see app.vue), where they rise in from below.
          position: ['bottom-center'],
          class: { base: 'data-[state=open]:animate-[imapsu-toast-rise-in_var(--app-motion-overlay)_var(--app-ease)] data-[state=closed]:animate-[imapsu-toast-rise-out_220ms_var(--ease-in)]' }
        }
      ]
    },
    textarea: {
      slots: {
        root: 'w-full',
        base: 'rounded-lg transition-colors duration-(--app-motion-fast)'
      }
    },
    empty: {
      slots: { root: 'imapsu-empty', title: 'text-base font-semibold' }
    },
    badge: {
      slots: { base: 'rounded-md font-medium whitespace-normal' }
    }
  }
})
