// B9-31 (SAFE-01, SAFE-04, SAFE-06; plan section 6): the Recipe editor keeps work. Both scenarios assert in their setup (a step whose
// state does not show throws, so the run fails instead of measuring the wrong page), and then the ordinary page rules run on the
// state they leave: the leave dialog's page, and the editor after a failed Save.
//   recipe-editor-guard    /recipes/:id/edit: the Name is changed, an in-app link to the Plan is followed, and "Leave without saving?" opens
//                          with "Keep editing" focused (the dialog has no Close); Keep editing stays on the editor and keeps the Name; after
//                          the 500 ms write the page is reloaded and the editor shows the kept Name with the "Your unsaved changes are
//                          back" notice, which does not take focus. The last state is the restored editor.
//   recipe-new-empty-save  /recipes/new: Save Recipe pressed with nothing filled: focus is on the Name field (aria-invalid, described by its
//                          message), the field is inside the viewport and clear of the sticky action bar and the top bar, there is no
//                          role="alert" and no "Check the fields marked above.".
import { byText, evaluate, press, until } from '../helpers.mjs'

const NAME = `input[aria-label="Name"], .ui-field input[name="name"], [data-field="name"] input`
const NAME_INPUT = `(document.querySelector(${JSON.stringify(NAME)}) || [...document.querySelectorAll('input')].find((i) => /^Name$/.test(i.labels?.[0]?.textContent?.trim() ?? i.getAttribute('aria-label') ?? '')))`
/** Sets the Name as typing does (the React-controlled input). */
const SET_NAME = (value) => `(() => { const e = ${NAME_INPUT}; if (!e) return false; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(e, ${JSON.stringify(value)}); e.dispatchEvent(new Event('input', { bubbles: true })); return true })()`
const EDITOR_LOADED = `!!${NAME_INPUT} && !document.querySelector('.skeleton, [aria-busy="true"]')`
const DIALOG = `[...document.querySelectorAll('dialog[open], [role="dialog"]')].find((d) => /Leave without saving\\?/.test(d.textContent ?? ''))`

/** A link into the app the leave guard must catch: the Plan link of the rail or the bottom bar (the first one drawn). */
const PLAN_LINK = `[...document.querySelectorAll('a[href="/plan"]')].find((a) => a.getBoundingClientRect().width > 0) || document.querySelector('a[href="/plan"]')`

export default {
  order: 330,
  scenarios: [
    { name: 'recipe-editor-guard', route: '/recipes/:id/edit', start: '/recipes/:id/edit', setup: 'recipeEditorGuard', widths: [390, 1440] },
    { name: 'recipe-new-empty-save', route: '/recipes/new', start: '/recipes/new', setup: 'recipeNewEmptySave', widths: [375, 390, 1440] },
  ],
  setups: {
    async recipeEditorGuard() {
      await until(EDITOR_LOADED, 'the editor with its Recipe')
      const original = await evaluate(`${NAME_INPUT}.value`)
      const changed = `${original} (edited)`
      if (!(await evaluate(SET_NAME(changed)))) throw new Error('setup: the Name field went away')
      await press(PLAN_LINK, 'the Plan link')
      await until(`!!(${DIALOG})`, 'the "Leave without saving?" dialog')
      const focused = await evaluate(`(document.activeElement?.textContent ?? '').trim()`)
      if (focused !== 'Keep editing') throw new Error(`setup: the dialog opened with focus on "${focused}", not "Keep editing"`)
      if (await evaluate(`!!(${DIALOG})?.querySelector('[aria-label="Close"], .icon-button--close')`)) throw new Error('setup: the leave dialog has a Close button (it has Cancel and Discard)')
      await press(byText('button', 'Keep editing'), 'Keep editing')
      await until(`!(${DIALOG}) && location.pathname.endsWith('/edit')`, 'the editor again, with no dialog')
      if ((await evaluate(`${NAME_INPUT}.value`)) !== changed) throw new Error('setup: Keep editing lost the typed Name')
      await new Promise((r) => setTimeout(r, 900)) // the reload draft is written 500 ms after the last change
      await evaluate('location.reload()')
      await until(`${EDITOR_LOADED} && ${NAME_INPUT}.value === ${JSON.stringify(changed)}`, 'the reloaded editor with the kept Name', 15000)
      await until(`[...document.querySelectorAll('[role="status"]')].some((s) => /Your unsaved changes are back/.test(s.textContent ?? ''))`, 'the "Your unsaved changes are back" notice')
      if (await evaluate(`document.activeElement?.closest('[role="status"]') !== null`)) throw new Error('setup: the draft notice took focus')
    },
    async recipeNewEmptySave() {
      await until(EDITOR_LOADED, 'the new Recipe editor')
      await press(byText('button', 'Save Recipe'), 'Save Recipe')
      await until(`document.activeElement === ${NAME_INPUT}`, 'focus on the Name field after a failed Save')
      const probe = await evaluate(`(() => {
        const e = document.activeElement
        const r = e.getBoundingClientRect()
        const bar = document.querySelector('.sticky-action-bar, [data-sticky-bar]')
        const barTop = bar ? bar.getBoundingClientRect().top : innerHeight
        const top = document.querySelector('header, .app-bar')?.getBoundingClientRect().bottom ?? 0
        return {
          invalid: e.getAttribute('aria-invalid') === 'true',
          described: !!e.getAttribute('aria-describedby') && !!document.getElementById(e.getAttribute('aria-describedby').split(' ')[0]),
          clear: r.top >= Math.min(top, 0) && r.bottom <= barTop + 1 && r.top >= 0,
          alerts: document.querySelectorAll('[role="alert"]').length,
          summary: /Check the fields marked above/.test(document.body.textContent ?? ''),
        }
      })()`)
      if (!probe.invalid) throw new Error('setup: the focused Name is not aria-invalid')
      if (!probe.described) throw new Error('setup: the focused Name is not described by its message')
      if (!probe.clear) throw new Error('setup: the focused Name is not inside the viewport clear of the bars')
      if (probe.alerts > 0) throw new Error(`setup: ${probe.alerts} role="alert" after a failed Save (field errors are not alerts)`)
      if (probe.summary) throw new Error('setup: "Check the fields marked above." is still shown')
    },
  },
}
