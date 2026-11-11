// R2-L: the pure part of the page-layout guard (rules P1..P9, route table, modes, profiles). STUB: red tests first.
// Design: docs/dev/design/r2l-page-layout.md. The CDP driver is scripts/check-page-layout.mjs and only calls these.
export const PAGE_WIDTH_PX = { narrow: 720, default: 1120, wide: 1480 }
/** [route pattern, width kind]; ":id" is resolved with resolveRoute(). Must equal web/src/app/pageWidths.ts (contract test). */
export const ROUTES = []
export const PROFILES = { quick: [], full: [] }
export function contrastRatio(_fg, _bg) { return NaN }
export function evaluateMetrics(_m, _ctx) { return [] }
export function modeFor(_modesText, _route) { return 'warn' }
export function resolveRoute(pattern, _ids) { return pattern }
