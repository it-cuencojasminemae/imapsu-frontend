export const appMotion = {
  fast: 0.12,
  press: 0.1,
  page: 0.16,
  reveal: 0.2,
  loaded: 0.14,
  stagger: 0.03,
  ease: [0.16, 1, 0.3, 1] as [number, number, number, number],
  spring: { type: 'spring' as const, stiffness: 350, damping: 35, mass: 1 }
}

export function revealTransition(index = 0, reduced = false) {
  return { duration: reduced ? appMotion.loaded : appMotion.reveal, delay: reduced || index >= 4 ? 0 : Math.max(index, 0) * appMotion.stagger, ease: appMotion.ease }
}
