// P14 (warn or fail by the route mode): A chip label cut by its ellipsis while its chip line has spare room.
// Moved verbatim out of evaluateMetrics in page-layout-rules.mjs (B9-03); the metrics come from the probes in ../probes/.
const f = (text) => ({ rule: 'P14', message: `P14 ${text}` })

export default {
  id: 'P14',
  title: 'A chip label cut by its ellipsis while its chip line has spare room',
  always: false,
  evaluate(m, _ctx) {
    const out = []
    // ds-plan round 3: a chip label cut by its ellipsis while its chip line has spare room (a lone chip must show in full).
    for (const c of m.clippedChips ?? []) out.push(f(`${c.sel} "${c.label}" is cut by its ellipsis with ${c.room} px spare on its line; let the chips take their natural width (flex 0 1 auto, min-inline-size 0) and no percentage cap`))
    return out
  },
}
