// Routes that render without the AppShell bars: the wall-mounted kitchen board,
// Cook Mode, which wants the whole screen, and the receipt screens (their own Back and sticky action bar). Plain TypeScript.

const CHROMELESS = /^\/(board|cook|scan\/receipt)(\/|$)/

/** True for /board, /cook and /scan/receipt and anything under them (but not /boards, /cooking or /scan/receipts). Query and hash are ignored. */
export function isChromeless(pathname: string): boolean {
  const path = pathname.split(/[?#]/)[0] ?? ''
  return CHROMELESS.test(path)
}

const RECEIPT = /^\/scan\/receipt(\/|$)/

/** True for the receipt screens (/scan/receipt and anything under it): chromeless, but they show the timers' finish banner (PC-04). */
export function isReceiptScreen(pathname: string): boolean {
  const path = pathname.split(/[?#]/)[0] ?? ''
  return RECEIPT.test(path)
}
