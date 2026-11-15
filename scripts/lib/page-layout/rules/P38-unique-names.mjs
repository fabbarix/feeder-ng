// P38 (by mode; B9-32, A11Y-08): two visible buttons in `main` share an accessible name. "Swap, Pin, Swap, Pin" tells a screen-reader User nothing:
// each repeated action names its Recipe, day and Meal Slot ("Swap Pasta al pomodoro, Sun 15 Breakfast"). Two row targets may share a name
// ("Flour", "Flour") only when their descriptions (aria-describedby: meta, value) differ.
// Metrics (probes/button-names.mjs): duplicateButtonNames: [{ name, count }].
const f = (text) => ({ rule: 'P38', message: `P38 ${text}` })

export default {
  id: 'P38',
  title: 'Two visible buttons in main share a name (A11Y-08)',
  always: true, // B9-55: always fail at release (plan section 9)
  evaluate(m, _ctx) {
    const out = []
    for (const d of m.duplicateButtonNames ?? []) {
      out.push(f(`${d.count} visible buttons are named "${d.name}"; name each by what it acts on (its Recipe, day and Meal Slot), or, for row targets, describe them so they differ`))
    }
    return out
  },
}
