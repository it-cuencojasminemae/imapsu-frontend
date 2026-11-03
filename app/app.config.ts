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
    toaster: {
      slots: { base: 'duration-(--app-motion-menu)' },
      compoundVariants: [
        {
          position: ['bottom-left', 'bottom-center', 'bottom-right'],
          class: { base: 'data-[state=open]:animate-[toast-slide-in-from-bottom_var(--app-motion-overlay)_var(--app-overlay-ease)]' }
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
