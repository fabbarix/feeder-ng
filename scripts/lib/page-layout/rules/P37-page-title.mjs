// P37 (always fail; B9-49, A11Y-01; was "P18" in the chapter): the document title is "Feeder", or does not match the page. Every routed page
// is titled "<page> · <parent> · Feeder" (a sign-in page "Sign in to Feeder"). The metrics come from probes/page-title.mjs:
//   pageTitle: { title: string, h1: string | null } | null
// The title must end with " · Feeder" (or be "Sign in to Feeder") and start with the h1's text, except where the page passes a stable title
// instead of a heading that is a question changing with the step (TITLE_OVERRIDES) and Cook Mode ("Cook Mode · <Recipe> · Feeder"). A page
// with no h1 yet (loading, failed) still has a title that is not "Feeder": the shell sets one from the route table.
// No metrics (the resize walk, older probes): no findings. Pure, so vitest tests it (web/src/app/pageLayoutRules.b9-49.test.ts).
const f = (text) => ({ rule: 'P37', message: `P37 ${text}` })

/** Routes whose title is stable while their h1 changes with the step (A11Y-01 "Title override"). */
export const TITLE_OVERRIDES = {
  '/scan': 'Scan',
  '/scan/receipt': 'Receipt',
  '/scan/receipt/review': 'Receipt review',
}
const SUFFIX = ' · Feeder'

export default {
  id: 'P37',
  title: 'document.title is "Feeder", or does not match the h1 (A11Y-01)',
  always: true,
  evaluate(m, ctx) {
    const t = m.pageTitle
    if (!t || typeof t.title !== 'string') return []
    const title = t.title
    if (title === 'Feeder' || title === '') return [f(`document.title is "${title}": every page names itself, "<h1> · Feeder" (A11Y-01)`)]
    if (title === 'Sign in to Feeder') return []
    if (!title.endsWith(SUFFIX)) return [f(`document.title "${title}" does not end with " · Feeder" (A11Y-01)`)]
    const route = ctx?.route ?? ''
    const override = TITLE_OVERRIDES[route]
    const head = override ?? (route.startsWith('/cook') ? 'Cook Mode' : t.h1)
    if (head && !title.startsWith(head)) {
      return [f(`document.title "${title}" does not start with ${override ? `the route's title "${override}"` : route.startsWith('/cook') ? '"Cook Mode"' : `the h1 "${head}"`} (A11Y-01)`)]
    }
    return []
  },
}
