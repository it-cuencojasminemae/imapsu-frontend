import { useReducedMotion } from 'motion-v'
import { appMotion, revealTransition } from '~/utils/appMotion'

export function useAppMotion() {
  const reducedMotion = useReducedMotion()
  // This is set only after an actual client navigation, so SSR content is visible.
  const navigated = useState('app-has-navigated', () => false)
  return { reducedMotion, navigated, appMotion, revealTransition }
}
