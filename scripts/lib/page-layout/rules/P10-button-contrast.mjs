// P10 (warn or fail by the route mode): A Button label reaches 4.5:1 on its own background, in the light and the dark scheme.
// Moved verbatim out of evaluateMetrics in page-layout-rules.mjs (B9-03); the metrics come from the probes in ../probes/.
const f = (text) => ({ rule: 'P10', message: `P10 ${text}` })

/** FU-4: the P10 findings of the Button probe run in the dark scheme (none for an undefined or empty list). */
export function darkButtonFindings(lowContrastButtonsDark) {
  return (lowContrastButtonsDark ?? []).map((b) => ({ rule: 'P10', message: `P10 Button "${b.label}" contrast ${b.ratio}:1 (dark scheme)` }))
}

export default {
  id: 'P10',
  title: 'A Button label reaches 4.5:1 on its own background, in the light and the dark scheme',
  always: false,
  evaluate(m, _ctx) {
    const out = []
    // QA-1: a Button label must reach 4.5:1 on its own background (the probe reports the ones that do not).
    for (const b of m.lowContrastButtons ?? []) out.push(f(`Button "${b.label}" contrast ${b.ratio}:1 (< 4.5)`))
    // FU-4: the same probe in the dark scheme (the driver emulates prefers-color-scheme: dark for it).
    out.push(...darkButtonFindings(m.lowContrastButtonsDark))
    return out
  },
  // B9-03: the dark pass. The driver re-runs the probes marked `dark` (buttons) in the dark scheme and hands their metrics here.
  evaluateDark(dm, _ctx) {
    return darkButtonFindings(dm.lowContrastButtons)
  },
}
