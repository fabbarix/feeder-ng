import { useMediaQuery } from '../../ui'
export function X() {
  const a = useMediaQuery('(min-width: 768px)')
  const b = useMediaQuery("(max-width: 599px)")
  return a || b ? null : null
}
