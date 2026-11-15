// B9-51 (SET-11, SHORT-06, PC-14 and A2, SAFE-04; plan section 9): the small Settings screens.
//   tags-rows              /settings/tags: every row is swatch, title (at most two lines), value (one line, "12 Recipes", "1 Recipe" or "None"),
//                          chevron; no Chip in the list; no row spills out of its tile. Reports P1, P11, P13, P40 (a title under 120 px:
//                          the old "2 / Recipes" wrap and "Key saved" findings go away).
//   assistant-bar          /settings/recipe-assistant: clean, the "Recipe Assistant actions" bar is not floating and both buttons are
//                          disabled; after the API base URL is changed it floats (position sticky or fixed), is one row of at most 80 px and
//                          the fixed and sticky chrome stay under 35 % of the viewport. Reports P1, P6, P12, P40.
//   planning-cooking-times /settings/planning: the Cooking times tile shows both switches, both TimeFields and the example line; the Latest
//                          start switch turns its field off and on; an Earliest start moved to 23:00 and saved puts "Latest start must be
//                          later than Earliest start." under the Latest start field, inside the viewport and clear of the bottom bar, with
//                          focus in that field. Reports P1, P4, P11, P12, P13, P39, P40.
//   toast-over-preferences-bar  /settings/preferences with Dark chosen (the sticky "Preferences actions" bar is up) and a failed-save error toast shown
//                          through the app's own toast API: the toast must not cover the bar or its Save button (B9-20 follow-up "the failed-save
//                          toast covers Save on Preferences at 375"). The setup measures the overlap itself (P43's probe names only the /scan
//                          scenarios), so a cover throws and the scenario fails; it reports P1 and P12 too.
// Widths 375, 390, 834 and 1440 (the tile and the form are checked at all of them); assistant-bar adds the short landscape 667x375.
import { evaluate, js, press, byText, until } from '../helpers.mjs'

const SHOW_SAVE_FAILED_TOAST = `(() => {
  const region = document.querySelector('.toast-region')
  const key = region && Object.keys(region).find((k) => k.startsWith('__reactFiber$'))
  for (let f = key ? region[key] : null; f; f = f.return) {
    const api = f.memoizedProps && f.memoizedProps.value
    if (!api || typeof api.show !== 'function') continue
    api.show({ status: 'error', title: 'Could not save your preferences', body: 'Check the connection and try again.' })
    return true
  }
  return false
})()`

const BAR = `document.querySelector('[role="group"][aria-label="Recipe Assistant actions"]')`

export default {
  order: 340,
  scenarios: [
    { name: 'tags-rows', route: '/settings/tags', start: '/settings/tags', setup: 'tagsRows', widths: [375, 390, 834, 1440], rules: ['P1', 'P11', 'P13', 'P40'] },
    { name: 'assistant-bar', route: '/settings/recipe-assistant', start: '/settings/recipe-assistant', setup: 'assistantBar', widths: [375, 390, 834, 1440, '667x375'], rules: ['P1', 'P6', 'P12', 'P40'] },
    { name: 'toast-over-preferences-bar', route: '/settings/preferences', start: '/settings/preferences', setup: 'toastOverPreferencesBar', widths: [375, 390, 834], rules: ['P1', 'P12'] },
    { name: 'planning-cooking-times', route: '/settings/planning', start: '/settings/planning', setup: 'cookingTimes', widths: [375, 390, 834, 1440], rules: ['P1', 'P4', 'P11', 'P12', 'P13', 'P39', 'P40'] },
  ],
  setups: {
    async tagsRows() {
      await until(`!!document.querySelector('main ul[aria-label="Tags"] .list-row') && !document.querySelector('[aria-busy="true"], .skeleton')`, 'the Tags list')
      const bad = await evaluate(`(() => [...document.querySelectorAll('main ul[aria-label="Tags"] > .list-row')].flatMap((row) => {
        const out = [], label = row.querySelector('.list-row__title')?.textContent.trim() ?? '?'
        const line = (e) => parseFloat(getComputedStyle(e).lineHeight) || 20
        const title = row.querySelector('.list-row__title'), value = row.querySelector('.list-row__value')
        if (row.querySelector('.chip')) out.push({ label, why: 'a Chip in the row' })
        if (!row.querySelector('.tag-lead')) out.push({ label, why: 'no Tag swatch' })
        if (!title || title.getBoundingClientRect().height > line(title) * 2.2) out.push({ label, why: 'title over two lines' })
        if (!value || !/^(None|\\d+ Recipes?)$/.test(value.textContent.trim())) out.push({ label, why: 'value is not a Recipe count: ' + (value ? value.textContent.trim() : 'missing') })
        else if (value.getBoundingClientRect().height > line(value) * 1.5) out.push({ label, why: 'value wraps' })
        return out
      }))()`)
      if (bad.length) {
        const why = {}
        for (const b of bad) why[b.why] = (why[b.why] ?? 0) + 1
        throw new Error(`setup: ${bad.length} problem(s) in the Tags rows: ${js(why)}; first: ${js(bad[0])}`)
      }
    },

    async assistantBar() {
      await until(`!!${BAR} && !!document.querySelector('main input') && !document.querySelector('[aria-busy="true"], .skeleton')`, 'the Recipe Assistant page and its bar')
      const clean = await evaluate(`(() => {
        const bar = ${BAR}, buttons = [...bar.querySelectorAll('button')]
        return { sticky: bar.dataset.sticky, position: getComputedStyle(bar).position, disabled: buttons.length === 2 && buttons.every((b) => b.disabled) }
      })()`)
      if (clean.sticky !== 'false' || /sticky|fixed/.test(clean.position)) throw new Error(`setup: the clean bar floats (data-sticky ${clean.sticky}, position ${clean.position})`)
      if (!clean.disabled) throw new Error('setup: Cancel and Save are not both disabled while the page is clean')
      // Change the API base URL as typing does.
      const typed = await evaluate(`(() => {
        const label = [...document.querySelectorAll('main label')].find((l) => l.textContent.trim() === 'API base URL')
        const input = label && label.htmlFor ? document.getElementById(label.htmlFor) : null
        if (!input || input.disabled) return false
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, input.value + '/gw')
        input.dispatchEvent(new Event('input', { bubbles: true }))
        return true
      })()`)
      if (!typed) throw new Error('setup: no editable "API base URL" field')
      await until(`${BAR}.dataset.sticky === 'true'`, 'the bar floating once the page is dirty')
      const dirty = await evaluate(`(() => {
        const bar = ${BAR}, r = bar.getBoundingClientRect(), buttons = [...bar.querySelectorAll('button')]
        const tops = new Set(buttons.map((b) => Math.round(b.getBoundingClientRect().top)))
        return { position: getComputedStyle(bar).position, height: r.height, share: r.height / window.innerHeight, rows: tops.size, enabled: buttons.every((b) => !b.disabled) }
      })()`)
      if (!/sticky|fixed/.test(dirty.position)) throw new Error(`setup: the dirty bar does not float (position ${dirty.position})`)
      if (dirty.rows !== 1) throw new Error('setup: Cancel and Save are not on one row')
      if (dirty.height > 80) throw new Error(`setup: the dirty bar is ${Math.round(dirty.height)} px tall (budget 80)`)
      if (dirty.share > 0.35) throw new Error(`setup: the dirty bar takes ${Math.round(dirty.share * 100)} % of the viewport height (budget 35 %, P32)`)
      if (!dirty.enabled) throw new Error('setup: the buttons are still disabled while the page is dirty')
    },

    async toastOverPreferencesBar() {
      await until(`!!document.querySelector('main .segmented') && !document.querySelector('[aria-busy="true"], .skeleton')`, 'Your preferences')
      await press(byText('[role="radio"]', 'Dark'), 'the Dark option of Colour mode')
      await until(`!!document.querySelector('.sticky-action-bar[aria-label="Preferences actions"], [role="group"][aria-label="Preferences actions"].sticky-action-bar')`, 'the sticky Preferences actions bar')
      if (!(await evaluate(SHOW_SAVE_FAILED_TOAST))) throw new Error("setup: not inspected: the app's toast API (the ToastProvider above .toast-region) was not found")
      await until(`[...document.querySelectorAll('.toast')].some((e) => e.getBoundingClientRect().height > 0)`, 'the error toast on screen')
      const covered = await evaluate(`(() => {
        const t = [...document.querySelectorAll('.toast')].find((e) => e.getBoundingClientRect().height > 0).getBoundingClientRect()
        const targets = [...document.querySelectorAll('.sticky-action-bar, .sticky-action-bar button, nav.bottom-bar')]
        return targets.map((e) => { const r = e.getBoundingClientRect(); return { sel: e.tagName.toLowerCase() + '.' + (e.className || '').toString().split(' ')[0], w: Math.min(t.right, r.right) - Math.max(t.left, r.left), h: Math.min(t.bottom, r.bottom) - Math.max(t.top, r.top) } }).filter((x) => x.w > 1 && x.h > 1)
      })()`)
      if (covered.length) throw new Error(`setup: the failed-save toast covers ${js(covered)}`)
    },

    async cookingTimes() {
      await until(`[...document.querySelectorAll('main h2')].some((h) => h.textContent.trim() === 'Cooking times') && !document.querySelector('[aria-busy="true"], .skeleton')`, 'the Cooking times tile')
      const tile = `(() => [...document.querySelectorAll('main h2')].find((h) => h.textContent.trim() === 'Cooking times').closest('section'))()`
      await until(`!!${tile}.querySelector('[role="group"][aria-label="Earliest start time"]') && !!${tile}.querySelector('[role="group"][aria-label="Latest start time"]')`, 'both time fields')
      const seen = await evaluate(`(() => {
        const t = ${tile}
        return { switches: [...t.querySelectorAll('[role="switch"]')].map((s) => s.getAttribute('aria-label') || s.getAttribute('aria-labelledby') && document.getElementById(s.getAttribute('aria-labelledby'))?.textContent.trim()), example: /can be planned for|can't be planned/.test(t.textContent), native: !!t.querySelector('input[type="time"], select') }
      })()`)
      if (seen.switches.join('|') !== 'Earliest start|Latest start') throw new Error(`setup: the switches read ${js(seen.switches)}`)
      if (seen.native) throw new Error('setup: the tile uses a native time input or select')
      // Latest start Off hides its field, On brings it back.
      await press(byText('[role="switch"]', 'Latest start'), 'the Latest start switch')
      await until(`!${tile}.querySelector('[role="group"][aria-label="Latest start time"]')`, 'the Latest start field going away')
      await press(byText('[role="switch"]', 'Latest start'), 'the Latest start switch again')
      await until(`!!${tile}.querySelector('[role="group"][aria-label="Latest start time"]')`, 'the Latest start field coming back')
      // Move the Earliest start to 23:00 with the arrow keys and Save: the Latest start (22:00) is now not later.
      await evaluate(`(() => {
        const hour = ${tile}.querySelector('[role="group"][aria-label="Earliest start time"] [aria-label="Hour"]')
        hour.focus()
        for (let i = 0; i < 17; i++) hour.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
      })()`)
      await press(byText('button', 'Save Cooking times'), 'Save Cooking times')
      await until(`${tile}.querySelector('[role="group"][aria-label="Latest start time"]')?.getAttribute('aria-invalid') === 'true'`, 'the Latest start error')
      const err = await evaluate(`(() => {
        const g = ${tile}.querySelector('[role="group"][aria-label="Latest start time"]')
        const msg = g.closest('.ui-field')?.querySelector('.ui-field__error')
        const r = msg && msg.getBoundingClientRect(), bar = document.querySelector('nav.bottom-bar, nav[aria-label="Bottom bar"]')
        const barTop = bar && getComputedStyle(bar).display !== 'none' ? bar.getBoundingClientRect().top : window.innerHeight
        return { text: msg && msg.textContent.trim(), top: r && r.top, bottom: r && r.bottom, barTop, innerHeight: window.innerHeight, focus: document.activeElement === g.querySelector('[aria-label="Hour"]'), alerts: [...document.querySelectorAll('[role="alert"]:not(.toast-live)')].length }
      })()`)
      if (!err.text || !/later than Earliest start/.test(err.text)) throw new Error(`setup: the Latest start error reads ${js(err.text)}`)
      if (err.top < 0 || err.bottom > err.barTop) throw new Error(`setup: the error is not clear of the viewport and the bottom bar (${Math.round(err.top)}..${Math.round(err.bottom)}, bar top ${Math.round(err.barTop)})`)
      if (!err.focus) throw new Error('setup: focus is not in the Latest start field after the failed save')
      if (err.alerts !== 0) throw new Error(`setup: a field error is announced as an alert (${err.alerts} page alert(s))`)
    },
  },
}
