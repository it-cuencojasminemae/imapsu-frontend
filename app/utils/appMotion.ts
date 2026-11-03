export const appMotion = {
  fast: 0.2,
  press: 0.15,
  page: 0.6,
  reveal: 0.6,
  loaded: 0.6,
  reduced: 0.14,
  stagger: 0.1,
  staggerLimit: 3,
  ease: [0.16, 1, 0.3, 1] as [number, number, number, number],
  spring: { type: 'spring' as const, visualDuration: 0.6, bounce: 0 }
}

export function revealTransition(index = 0, reduced = false) {
  return { duration: reduced ? appMotion.reduced : appMotion.reveal, delay: reduced ? 0 : Math.min(Math.max(index, 0), appMotion.staggerLimit) * appMotion.stagger, ease: appMotion.ease }
}
