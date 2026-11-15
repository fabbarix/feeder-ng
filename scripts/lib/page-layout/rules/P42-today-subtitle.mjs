// P42 (by mode; B9-44, RES-05): a .page-header__subtitle other than the Household's date on Today. The subtitle under "Today" is the date in the
// Household's zone ("Mon 9 Nov"), never the device's, and never anything else (no count, no greeting). Metrics (probes/today-subtitle.mjs):
// todaySubtitle: { texts: [string], expected: string | null, device: string } on `/`, null on every other route. Pure, so vitest tests it
// (web/src/app/pageLayoutRules.b9-44.test.ts).
const f = (text) => ({ rule: 'P42', message: `P42 ${text}` })

export default {
  id: 'P42',
  title: 'A .page-header__subtitle other than the Household date on Today (RES-05)',
  always: true, // B9-55: always fail at release (plan section 9)
  evaluate(m, ctx) {
    const s = m.todaySubtitle
    if (!s || ctx?.route !== '/') return []
    const out = []
    const texts = (s.texts ?? []).filter((t) => t !== '')
    if (texts.length > 1) out.push(f(`Today has ${texts.length} subtitles (${texts.map((t) => `"${t}"`).join(', ')}); it has one: the Household date`))
    for (const t of texts) {
      if (s.expected && t !== s.expected) {
        const why = t === s.device && s.device !== s.expected ? ' (the device date, not the Household\'s)' : ''
        out.push(f(`the subtitle is "${t}", not the Household date "${s.expected}"${why}`))
      } else if (!s.expected && !/^[A-Z][a-z]{2} \d{1,2} [A-Z][a-z]{2}$/.test(t)) {
        out.push(f(`the subtitle "${t}" is not a date like "Mon 9 Nov"`))
      }
    }
    return out
  },
}
