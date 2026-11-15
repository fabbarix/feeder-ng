// B9-16 (A11Y-09, SET-07; plan section 9): the scenarios of P36 and the household-errors check.
//   touch-targets-controls  Your preferences (the ruled Segmented, the colour swatches, the Switches) on a touch emulation, at 375 and 390;
//                           P36 only. A package that adopts IconSet or the coarse blocks adds its own scenario with `touch-targets-` and
//                           names it in probes/targets.mjs.
//   household-errors        Household settings with an invalid Currency, saved: the error lands under the field, as wide as the field's
//                           track (at least 120 px) and on at most two lines at 375 and 390 (SET-07: it was 112 x 54 px on three lines).
//                           The setup measures the errors itself, so the check holds before P40 (B9-13: a field error under 120 px) lands.
import { evaluate, js, press, byText, until } from '../helpers.mjs'

const TOUCH = [
  { method: 'Emulation.setTouchEmulationEnabled', params: { enabled: true, maxTouchPoints: 5 } },
  { method: 'Emulation.setEmitTouchEventsForMouse', params: { enabled: true, configuration: 'mobile' } },
]

export default {
  order: 310,
  scenarios: [
    { name: 'touch-targets-controls', route: '/settings/preferences', start: '/settings/preferences', setup: 'preferencesLoaded', widths: [375, 390], emulate: TOUCH, rules: ['P36'] },
    { name: 'household-errors', route: '/settings/household', start: '/settings/household', setup: 'householdErrors', widths: [375, 390], rules: ['P1', 'P11', 'P13', 'P40'] },
  ],
  setups: {
    async preferencesLoaded() {
      await until(`!!document.querySelector('main .segmented') && !document.querySelector('[aria-busy="true"], .skeleton')`, 'Your preferences')
    },
    async householdErrors() {
      await until(`!!document.querySelector('main form .ui-field') && !document.querySelector('[aria-busy="true"], .skeleton')`, 'the Household form')
      const input = `(() => { const l = [...document.querySelectorAll('main form label')].find((x) => x.textContent.trim() === 'Currency'); return l && l.htmlFor ? document.getElementById(l.htmlFor) : null })()`
      if (!(await evaluate(`!!${input}`))) throw new Error('setup: no "Currency" field in the Household form')
      await evaluate(`(() => { const e = ${input}; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(e, 'EURO'); e.dispatchEvent(new Event('input', { bubbles: true })) })()`)
      await press(byText('main form button[type=submit]', 'Save'), '"Save" in the Household form')
      await until(`!!document.querySelector('main form .ui-field__error')`, 'the Currency error')
      const bad = await evaluate(`(() => [...document.querySelectorAll('main form .ui-field__error')].map((e) => {
        const r = e.getBoundingClientRect(), lh = parseFloat(getComputedStyle(e).lineHeight) || 18
        return { text: e.textContent.trim().slice(0, 60), w: Math.round(r.width), lines: Math.round(r.height / lh) }
      }).filter((x) => x.w < 120 || x.lines > 2))()`)
      if (bad.length) throw new Error(`setup: a field error is squeezed (under 120 px or over two lines): ${js(bad)}`)
    },
  },
}
