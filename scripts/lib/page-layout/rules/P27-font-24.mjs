// P27 (DS-07, DS-08, plan 3 section 9): at a larger browser text size, every visible text node is one of the type roles at that size
// (board and Cook excluded), and no heading is larger than the page title.
//
// STUB (B9-02 test author): the test web/src/app/pageLayoutRules.p27.test.ts fails against this. The developer implements it.
// B9-03's registry (scripts/lib/page-layout/) loads this module; it is pure (no browser) so vitest can test it.

/** The type roles of styles.css (DS-08), in rem: [role, size]. 1rem is the root font size the User chose. */
export const ROLE_REM = []

/** The role sizes in px at a root font size. */
export function roleSizesPx(rootPx) {
  return []
}

/** Routes P27 does not read: the board and Cook Mode have their own roles (--text-board-*, --text-cook-step-*). */
export function isExempt(route) {
  return false
}

/**
 * metrics: { rootPx, h1: number | null, texts: [{ sel, px }], headings: [{ sel, level, px }] }; ctx: { width, route, kind }.
 * Returns [{ rule: 'P27', message }].
 */
export function evaluate(metrics, ctx) {
  return []
}
