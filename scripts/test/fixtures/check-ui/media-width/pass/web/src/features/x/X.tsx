import { useBreakpoint, useMediaQuery } from '../../ui'
export function X() {
  const wide = useBreakpoint('md')
  const coarse = useMediaQuery('(pointer: coarse)')
  return wide || coarse ? null : null
}
