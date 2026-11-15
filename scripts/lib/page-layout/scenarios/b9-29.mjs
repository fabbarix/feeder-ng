// B9-29 (SSP-10, DS-03, DS-10; plan section 9): the Pantry scenarios.
//   pantry-put-away       /pantry: the Put away sheet open over the Not sorted Stock Lots with two of them ticked, at 375, 390 and 1440: the
//                         sheet's footer ("Move 2 to ...") is reachable and clear of the bottom bar (P12), its targets are 44 px (P25),
//                         its body keeps its minimum height (P33) and nothing scrolls sideways (P1). It only ticks: nothing is moved, so the
//                         seed's Not sorted Lots stay for every other scenario.
//   text-spacing-pantry   /pantry at 390 px with the WCAG 1.4.12 text spacing injected (line height 1.5, paragraph spacing 2 em, letter
//                         spacing 0.12 em, word spacing 0.16 em): no sideways scroll (P1) and no Select cuts its value (P22: the Sort turns
//                         icon-only, named "Sort: Good until", which P22 allows). DS-10 names the scenario `text-spacing`; B9-51 adds its
//                         Settings twin as `text-spacing-settings`.
//   meta-fit-pantry      /pantry and /supplies at 375, 390 and 1120 px (A1: 375 replaces the chapter's 320; 360 is a profile width): P23 reads every
//   meta-fit-supplies    visible `.list-row__meta-text` (the probe cut-meta no longer looks only at the Shop's info hints), so a status or a Restock
//                        reason cut by its ellipsis, in a row that is narrow on a wide screen (1120), is a finding (SSP-05). /shop is B9-34's.
// The first two need Not sorted Stock Lots in the seed (scripts/test/fixtures/page-layout-seed/stock.mjs leaves the lots past its last place unsorted).
import { byText, evaluate, press, until } from '../helpers.mjs'

// P25 judges tap targets, so its scenarios emulate touch (as b9-14's do; web/src/app/pageLayoutRules.b9-14.test.ts requires it).
const TOUCH = [
  { method: 'Emulation.setTouchEmulationEnabled', params: { enabled: true, maxTouchPoints: 5 } },
  { method: 'Emulation.setEmitTouchEventsForMouse', params: { enabled: true, configuration: 'mobile' } },
]
const dialogOpen = `!!document.querySelector('dialog.sheet[open]')`
const loaded = `!!document.querySelector('main h2.list-group__title') && !document.querySelector('[aria-busy="true"], .skeleton')`

/** The 1.4.12 spacing a person may set: the guard injects it as a user style sheet would, with !important. */
export const TEXT_SPACING_CSS = `* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }`

export default {
  order: 330,
  scenarios: [
    { name: 'pantry-put-away', route: '/pantry', start: '/pantry', setup: 'pantryPutAway', widths: [375, 390, 1440], emulate: TOUCH, rules: ['P1', 'P12', 'P25', 'P33'] },
    { name: 'meta-fit-pantry', route: '/pantry', start: '/pantry', widths: [375, 390, 1120], rules: ['P23'] },
    { name: 'meta-fit-supplies', route: '/supplies', start: '/supplies', widths: [375, 390, 1120], rules: ['P23'] },
    { name: 'text-spacing-pantry', route: '/pantry', start: '/pantry', setup: 'textSpacing', widths: [390], rules: ['P1', 'P22'] },
  ],
  setups: {
    async pantryPutAway() {
      await until(loaded, 'the Pantry with its Storage Place headings')
      await press(byText('main button', 'Put away'), '"Put away" on the Not sorted heading')
      await until(dialogOpen, 'the Put away sheet')
      await until(`document.querySelectorAll('dialog.sheet[open] input[type="checkbox"], dialog.sheet[open] [role="checkbox"]').length >= 2`, 'two Not sorted Stock Lots to tick')
      for (let i = 0; i < 2; i++) await evaluate(`(() => { const b = document.querySelectorAll('dialog.sheet[open] input[type="checkbox"], dialog.sheet[open] [role="checkbox"]')[${i}]; b.click(); return true })()`)
      await until(`[...document.querySelectorAll('dialog.sheet[open] button')].some((b) => /^Move 2 to /.test(b.textContent.trim()))`, 'the primary "Move 2 to ..."')
    },
    async textSpacing() {
      await until(loaded, 'the Pantry with its Storage Place headings')
      await evaluate(`(() => { const s = document.createElement('style'); s.setAttribute('data-text-spacing', ''); s.textContent = ${JSON.stringify(TEXT_SPACING_CSS)}; document.head.append(s); return true })()`)
    },
  },
}
