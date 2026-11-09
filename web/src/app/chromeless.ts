// Routes that render without the AppShell bars: the wall-mounted kitchen board
// and Cook Mode, which wants the whole screen. Plain TypeScript.

/** True for /board and /cook and anything under them (but not /boards or /cooking). Query and hash are ignored. */
export function isChromeless(_pathname: string): boolean {
  throw new Error('TODO')
}
