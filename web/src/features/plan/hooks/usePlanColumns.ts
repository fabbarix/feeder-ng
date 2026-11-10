import { useMediaQuery } from '../../../ui'
import { planColumns } from '../lib/columns'

/** 2, 4 or 7 columns from the viewport (useMediaQuery on 768 px and 1200 px; no matchMedia means desktop, 7). */
export function usePlanColumns(): 2 | 4 | 7 {
  const tablet = useMediaQuery('(min-width: 768px)')
  const desktop = useMediaQuery('(min-width: 1200px)')
  return planColumns(desktop ? 1200 : tablet ? 768 : 0)
}
