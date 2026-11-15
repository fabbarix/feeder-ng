// B9-16 (A11Y-09, SET-07; plan section 9): the scenarios of P36 and the household-errors check.
//   touch-targets-controls  Your preferences (the ruled Segmented, the colour swatches, the Switches) on a touch emulation, at 375 and 390;
//                           P36 only. A package that adopts IconSet or the coarse blocks adds its own scenario with `touch-targets-` and
//                           names it in probes/targets.mjs.
//   household-errors        Household settings with equal Quiet hours, saved: the error lands under the field, as wide as the field's
//                           track (at least 120 px) and on at most two lines at 375 and 390 (SET-07: it was 112 x 54 px on three lines).
//                           The setup measures the errors itself, so the check holds before P40 (B9-13: a field error under 120 px) lands.
import { evaluate, js, press, until } from '../helpers.mjs'

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
      // Currency is a Select since SET-07 and the Planning Horizon NumberField clamps, so the error comes from equal Quiet hours: the
      // start (the narrow sm TimeField, the field SET-07 measured) is set to the end's time, and the error lands under the start.
      const segs = (name) => `(() => { const l = [...document.querySelectorAll('main form label, main form .ui-field__label')].find((x) => x.textContent.trim() === ${js(name)}); const g = l && document.querySelector('main form [role=group][aria-labelledby="' + l.id + '"]'); return g ? [...g.querySelectorAll('input.time-field__segment')] : [] })()`
      if ((await evaluate(`${segs('Quiet hours start')}.length`)) !== 2 || (await evaluate(`${segs('Quiet hours end')}.length`)) !== 2) throw new Error('setup: no "Quiet hours start" and "Quiet hours end" time fields in the Household form')
      const end = await evaluate(`${segs('Quiet hours end')}.map((e) => e.value)`)
      for (const i of [0, 1]) {
        await evaluate(`(() => { const e = ${segs('Quiet hours start')}[${i}]; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(e, ${js(end[i])}); e.dispatchEvent(new Event('input', { bubbles: true })) })()`)
      }
      await until(`${segs('Quiet hours start')}.map((e) => e.value).join(':') === ${js(end.join(':'))}`, 'Quiet hours start set to the end time')
      // The submit button reads "Save Household settings": find it by its first word, so a wording change does not break the setup.
      await press(`[...document.querySelectorAll('main form button[type=submit]')].find((e) => /^Save\\b/.test(e.textContent.trim()))`, 'Save button in the Household form')
      await until(`!!document.querySelector('main form .ui-field__error')`, 'the Quiet hours error')
      const bad = await evaluate(`(() => [...document.querySelectorAll('main form .ui-field__error')].map((e) => {
        const r = e.getBoundingClientRect(), lh = parseFloat(getComputedStyle(e).lineHeight) || 18
        return { text: e.textContent.trim().slice(0, 60), w: Math.round(r.width), lines: Math.round(r.height / lh) }
      }).filter((x) => x.w < 120 || x.lines > 2))()`)
      if (bad.length) throw new Error(`setup: a field error is squeezed (under 120 px or over two lines): ${js(bad)}`)
    },
  },
}
