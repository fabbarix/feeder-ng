import { useMediaQuery } from './useMediaQuery'
export const useBreakpoint = (em: number) => useMediaQuery(`(min-width: ${em}em)`)
export const old = () => useMediaQuery('(min-width: 768px)') // inside ui/lib the width is the module's business
