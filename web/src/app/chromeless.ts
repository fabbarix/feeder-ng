// Routes that render without the AppShell bars: the wall-mounted kitchen board,
// Cook Mode, which wants the whole screen, and the receipt screens (their own Back and sticky action bar). Plain TypeScript.

const CHROMELESS = /^\/(board|cook|scan\/receipt)(\/|$)/

/** True for /board and /cook and anything under them (but not /boards or /cooking). Query and hash are ignored. */
export function isChromeless(pathname: string): boolean {
  const path = pathname.split(/[?#]/)[0] ?? ''
  return CHROMELESS.test(path)
}
