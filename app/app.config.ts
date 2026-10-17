export default defineAppConfig({
  ui: {
    colors: {
      primary: 'maroon',
      secondary: 'gold',
      neutral: 'stone'
    },
    button: {
      slots: {
        base: 'rounded-lg font-medium inline-flex items-center justify-center disabled:cursor-not-allowed aria-disabled:cursor-not-allowed disabled:opacity-75 aria-disabled:opacity-75 transition-colors duration-120',
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
      }
    },
    textarea: {
      slots: {
        root: 'w-full',
        base: 'rounded-lg transition-colors duration-120'
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
