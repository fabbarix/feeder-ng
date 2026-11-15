// B9-36 (SAFE-08; plan section 9): the scenario of "Your preferences" with a live preview.
//   preferences-preview  /settings/preferences: the Preferences actions bar is NOT sticky while the form is clean (it sits in the flow with both
//                        buttons disabled), and once Dark is chosen it is the sticky bar with Revert and Save preferences, the whole app is
//                        dark at once (html[data-scheme="dark"]), "Not saved yet" is announced, and the bar stays within the P32 budget (fixed
//                        and sticky chrome under 35 % of the viewport height; P32 itself is B9-19's, so the setup measures the bar's share
//                        and fails above 35 % with the bottom bar not counted twice). Revert then takes the bar away again.
//                        Widths 375, 390, 834, 1440 and the short landscape 667x375. Reports P1, P6 (the bar has a background and lines up with
//                        the page) and P12 (the bar clears the bottom bar).
import { byText, evaluate, js, press, until } from '../helpers.mjs'

const BAR = `document.querySelector('main .sticky-action-bar, .sticky-action-bar[aria-label="Preferences actions"]')`
const GROUP = `document.querySelector('[role="group"][aria-label="Preferences actions"]')`

export default {
  order: 330,
  scenarios: [
    { name: 'preferences-preview', route: '/settings/preferences', start: '/settings/preferences', setup: 'preferencesPreview', widths: [375, 390, 834, 1440, '667x375'], rules: ['P1', 'P6', 'P12'] },
  ],
  setups: {
    async preferencesPreview() {
      await until(`!!document.querySelector('main .segmented') && !document.querySelector('[aria-busy="true"], .skeleton')`, 'Your preferences')
      // Clean: the group exists, both buttons are disabled, and it is not the sticky bar.
      const clean = await evaluate(`(() => {
        const g = ${GROUP}
        if (!g) return { error: 'no group named "Preferences actions"' }
        const buttons = [...g.querySelectorAll('button')]
        return { sticky: g.classList.contains('sticky-action-bar') || !!g.closest('.sticky-action-bar'), allDisabled: buttons.length === 2 && buttons.every((b) => b.disabled) }
      })()`)
      if (clean.error) throw new Error(`setup: ${clean.error}`)
      if (clean.sticky) throw new Error('setup: the Preferences actions bar is sticky while the form is clean (it must exist only while dirty)')
      if (!clean.allDisabled) throw new Error('setup: Revert and Save preferences are not both disabled while the form is clean')

      // The saved look (System: light in the light pass, dark in the dark pass); Revert must bring exactly it back.
      const savedScheme = await evaluate(`document.documentElement.dataset.scheme`)
      // From System, Dark is a change in both passes (the radio, not the resolved scheme, is what the preview changes).
      await press(byText('[role="radio"]', 'Dark'), 'the Dark option of Colour mode')
      await until(`!!${BAR} && document.documentElement.dataset.scheme === 'dark'`, 'the sticky bar and a dark app after choosing Dark')
      const dirty = await evaluate(`(() => {
        const bar = ${BAR}, r = bar.getBoundingClientRect(), vh = window.innerHeight
        const labels = [...bar.querySelectorAll('button')].map((b) => b.textContent.trim())
        const status = document.querySelector('main [role="status"]')
        return { labels, share: r.height / vh, status: status ? status.textContent.trim() : '' }
      })()`)
      if (dirty.labels.join('|') !== 'Revert|Save preferences') throw new Error(`setup: the bar's buttons read ${js(dirty.labels)}, expected Revert then Save preferences`)
      if (!/^Not saved yet/.test(dirty.status)) throw new Error(`setup: no "Not saved yet" status line while dirty (found ${js(dirty.status)})`)
      if (dirty.share > 0.35) throw new Error(`setup: the sticky bar takes ${Math.round(dirty.share * 100)} % of the viewport height (budget 35 %, P32)`)

      // The rules read the page in this dirty state; Revert is checked last by a second probe of the DOM.
      const reverted = await evaluate(`(async () => {
        const b = [...${BAR}.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Revert')
        b.click()
        await new Promise((r) => setTimeout(r, 300))
        return { bar: !!${BAR}, scheme: document.documentElement.dataset.scheme }
      })()`)
      if (reverted.bar) throw new Error('setup: Revert left the sticky bar in place')
      if (reverted.scheme !== savedScheme) throw new Error(`setup: Revert left the app ${reverted.scheme}, not the saved ${savedScheme}`)
      // Dirty again for the rules.
      await press(byText('[role="radio"]', 'Dark'), 'the Dark option again')
      await until(`!!${BAR}`, 'the sticky bar again')
    },
  },
}
