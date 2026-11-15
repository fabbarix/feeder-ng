// B9-37 (RX-02, RX-08, RX-09, RX-10, SHORT-08; plan sections 6 and 9; amendment A1: smallest width 375): the Recipe editor as a faster flow.
// Every setup asserts its own state (a state that does not show, or a measure over budget, throws, so the run fails instead of measuring the
// wrong page); the ordinary page rules then run on the page it leaves.
//   recipe-editor-flow            /recipes/:id/edit at 375, 834, 1440 ("RX height budget"): the five sections in order, Description and source and
//                                 Planning closed, the Ingredients heading within the first screen at 375, a line one row of at most 64 px from 42 rem of
//                                 list width (at most 140 px, 190 with a Note, below it), a Step at most 250 px from 42 rem and 340 px below (400 with
//                                 an open use or a Photo; the main session's call: the approved mock's phone Step is about 318 px), no drop zone in a Step without a Photo, the Kind Segmented with its three options, an Optional
//                                 checkbox on every line, the caption "Ingredient" clear of the drag handle, the Save bar on the form column (to 1 px)
//                                 and 12 px (--bar-gap) above the bottom bar where there is one (SHORT-08), the line's actions and the Tag chip's remove inside
//                                 their containers (R-C+).
//   recipe-new-flow               /recipes/new at 375 and 1440: the Name has the cursor, one empty line and one empty Step, the Yield 4, the
//                                 Ingredients heading within the first screen, Enter in the last field adds a line and puts the cursor in its picker.
//   recipe-editor-ring-room       the editor with both Disclosures open and a Step with a use, every control focused in turn (P39 only; probes/focus-rings.mjs).
//   recipe-editor-restored-focus  the restored-draft screen at 375 and 390 (the known issue: the floating Save bar covered the Name): at rest the Name field is
//                                 whole above the Save bar on the first screen; and each of Name, the first Ingredient, its Quantity and the first Step text,
//                                 focused, scrolls clear of the Save bar and of the top bar.
//   recipe-editor-tag-chooser     Planning open, "Add Tag" pressed, "e" typed: options are listed, not covered by the Save bar (P12 extended; probes/option-cover.mjs);
//                                 "zzweekend" offers the "Add Tag" row.
import { byText, evaluate, press, typeInto, until } from '../helpers.mjs'

const NOT_BUSY = `!document.querySelector('.skeleton, [aria-busy="true"]')`
const NAME_INPUT = `[...document.querySelectorAll('main input')].find((i) => (i.labels?.[0]?.textContent?.trim() ?? i.getAttribute('aria-label')) === 'Name')`
const LOADED = `!!(${NAME_INPUT}) && ${NOT_BUSY}`
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const px = (n) => Math.round(n * 10) / 10

/** The ring box of the focused element: its border box grown by outline width + offset when that is outward (as the P39 probe does). */
const RING = `(e) => { const s = getComputedStyle(e); const w = parseFloat(s.outlineWidth) || 0, o = parseFloat(s.outlineOffset) || 0; const g = s.outlineStyle === 'none' ? 0 : Math.max(0, w + o); const r = e.getBoundingClientRect(); return { x: r.left - g, y: r.top - g, r: r.right + g, b: r.bottom + g, offset: o, drawn: s.outlineStyle !== 'none' && w > 0 } }`

/** Throws with every failed check at once, so one run says everything that is over budget. */
async function check(what, expr) {
  const bad = await evaluate(expr)
  if (bad && bad.length) throw new Error(`setup: ${what}: ${bad.join('; ')}`)
}

export default {
  order: 340,
  scenarios: [
    { name: 'recipe-editor-flow', route: '/recipes/:id/edit', start: '/recipes/:id/edit', setup: 'recipeEditorFlow', widths: [375, 834, 1440] },
    { name: 'recipe-new-flow', route: '/recipes/new', start: '/recipes/new', setup: 'recipeNewFlow', widths: [375, 1440] },
    { name: 'recipe-editor-ring-room', route: '/recipes/:id/edit', start: '/recipes/:id/edit', setup: 'recipeEditorRingRoom', widths: [375, 1440], rules: ['P39'] },
    { name: 'recipe-editor-restored-focus', route: '/recipes/:id/edit', start: '/recipes/:id/edit', setup: 'recipeEditorRestoredFocus', widths: [375, 390], rules: ['P1'] },
    { name: 'recipe-editor-tag-chooser', route: '/recipes/:id/edit', start: '/recipes/:id/edit', setup: 'recipeEditorTagChooser', widths: [375, 1440], rules: ['P12'] },
  ],
  setups: {
    async recipeEditorFlow() {
      await until(LOADED, 'the editor with its Recipe')
      await check('sections', `(() => {
        const bad = []
        const ids = ['recipe-section-recipe', 'recipe-section-ingredients', 'recipe-section-steps', 'recipe-section-about', 'recipe-section-planning']
        const tops = ids.map((id) => document.getElementById(id)?.getBoundingClientRect().top)
        ids.forEach((id, i) => { if (tops[i] === undefined) bad.push('no #' + id) })
        for (let i = 1; i < tops.length; i++) if (tops[i] !== undefined && tops[i - 1] !== undefined && tops[i] <= tops[i - 1]) bad.push('#' + ids[i] + ' is not below #' + ids[i - 1])
        for (const id of ['recipe-section-about', 'recipe-section-planning']) {
          const b = document.querySelector('#' + id + ' button[aria-expanded]')
          if (!b || b.getAttribute('aria-expanded') !== 'false') bad.push('#' + id + ' is not closed')
        }
        const kind = [...document.querySelectorAll('[role="radiogroup"]')].find((g) => document.getElementById(g.getAttribute('aria-labelledby') ?? '')?.textContent?.trim() === 'Kind')
        const labels = kind ? [...kind.querySelectorAll('[role="radio"]')].map((o) => o.textContent.trim()) : []
        if (labels.join('|') !== 'Recipe|Ready Meal|Base recipe') bad.push('Kind options are [' + labels.join(', ') + ']')
        return bad
      })()`)
      await check('first screen', `(() => {
        const bad = []
        const top = document.getElementById('recipe-section-ingredients')?.getBoundingClientRect().top + scrollY
        if (innerWidth <= 390 && top > 560) bad.push('the Ingredients heading starts at y ' + Math.round(top) + ' (budget 560 at a phone: no scrolling past optional fields first)')
        return bad
      })()`)
      await check('lines', `(() => {
        const bad = []
        const box = document.querySelector('.recipe-editor__lines-box')
        if (!box) return ['no .recipe-editor__lines-box']
        const wide = box.clientWidth >= 672
        const lines = [...document.querySelectorAll('.line-row')]
        if (lines.length === 0) return ['the Recipe has no lines']
        for (const [i, l] of lines.entries()) {
          const h = l.getBoundingClientRect().height
          const note = l.getAttribute('data-has-note') === 'true'
          const max = wide ? 66 : note ? 190 : 140
          if (h > max) bad.push('line ' + (i + 1) + ' is ' + Math.round(h) + ' px (max ' + max + (wide ? ', one row from 42 rem' : '') + ')')
          if (!l.querySelector('input[type="checkbox"]')) bad.push('line ' + (i + 1) + ' has no Optional checkbox')
        }
        if (wide) {
          const head = box.querySelector('.recipe-editor__lines-head')
          const cap = head && [...head.children].find((c) => c.textContent.trim() === 'Ingredient')
          const handle = lines[0].querySelector('.sortable-handle')
          if (!cap) bad.push('no "Ingredient" caption above the lines')
          else if (handle && cap.getBoundingClientRect().left < handle.getBoundingClientRect().right - 1) bad.push('the "Ingredient" caption sits over the drag handle')
        }
        return bad
      })()`)
      await check('steps', `(() => {
        const bad = []
        const wide = (document.querySelector('.recipe-editor__lines-box')?.clientWidth ?? 0) >= 672
        for (const [i, c] of [...document.querySelectorAll('.step-card')].entries()) {
          const h = c.getBoundingClientRect().height
          const extras = !!c.querySelector('.use-row, img')
          const max = wide ? 250 : extras ? 400 : 340 // a phone Step: the mock's ~318 px with its labels (main-session call, w4b)
          if (h > max) bad.push('Step ' + (i + 1) + ' is ' + Math.round(h) + ' px (max ' + max + ')')
          if (!c.querySelector('img') && c.querySelector('.file-drop, input[type="file"]')) bad.push('Step ' + (i + 1) + ' draws a drop zone without a Photo')
        }
        return bad
      })()`)
      await check('Save bar', `(() => {
        const bad = []
        const bar = document.querySelector('.sticky-action-bar')
        const col = document.querySelector('.recipe-editor')
        if (!bar || !col) return ['no Save bar or no form column']
        const b = bar.getBoundingClientRect(), c = col.getBoundingClientRect()
        if (innerWidth >= 768 && (Math.abs(b.left - c.left) > 1 || Math.abs(b.right - c.right) > 1)) bad.push('the Save bar (' + Math.round(b.left) + '-' + Math.round(b.right) + ') is not on the form column (' + Math.round(c.left) + '-' + Math.round(c.right) + ')')
        const nav = document.querySelector('nav.bottom-bar')
        if (nav && nav.getBoundingClientRect().width > 0) {
          const gap = nav.getBoundingClientRect().top - b.bottom
          if (Math.abs(gap - 12) > 1.5) bad.push('the strip between the Save bar and the bottom bar is ' + Math.round(gap) + ' px (--bar-gap is 12)')
        }
        return bad
      })()`)
      // R-C+: the line's actions button, focused, has its ring inside its line with 4 px of the line's fill to spare; the Tag chip's remove
      // is one button with an outer ring and does not overhang its chip (the Step handle takes the outer ring too, and stays inside the card).
      await check('nested controls', `(() => {
        const bad = []
        const ring = ${RING}
        const focus = (e) => { try { e.focus({ focusVisible: true }) } catch { e.focus() } }
        const actions = document.querySelector('.line-row button[aria-haspopup="menu"]')
        const line = actions?.closest('.line-row')
        if (actions && line) {
          focus(actions)
          const r = ring(actions), l = line.getBoundingClientRect()
          const room = Math.min(r.x - l.left, l.right - r.r, r.y - l.top, l.bottom - r.b)
          if (!ring(actions).drawn) bad.push('the line actions button draws no focus ring')
          else if (room < 4) bad.push('the line actions ring is ' + Math.round(room * 10) / 10 + ' px from the line edge (needs 4)')
        } else bad.push('no line actions button')
        const handle = document.querySelector('.step-card .sortable-handle')
        const card = handle?.closest('.step-card')
        if (handle && card) {
          focus(handle)
          const r = ring(handle), c = card.getBoundingClientRect()
          const room = Math.min(r.x - c.left, c.right - r.r, r.y - c.top, c.bottom - r.b)
          if (room < 2) bad.push('the Step handle ring is ' + Math.round(room * 10) / 10 + ' px from the card edge (needs 2)')
        }
        for (const chip of document.querySelectorAll('.tag-chooser .chip[data-removable]')) {
          const c = chip.getBoundingClientRect()
          const x = chip.querySelector('.chip__remove')?.getBoundingClientRect()
          if (x && (x.right > c.right + 1 || x.left < c.left - 1 || x.top < c.top - 1 || x.bottom > c.bottom + 1)) bad.push('a Tag chip\\'s remove overhangs its chip')
        }
        return bad
      })()`)
    },

    async recipeNewFlow() {
      await until(LOADED, 'the new Recipe editor')
      await until(`document.activeElement === (${NAME_INPUT})`, 'the cursor in the Name field of a new Recipe')
      await check('a new Recipe', `(() => {
        const bad = []
        const n = (sel) => document.querySelectorAll(sel).length
        if (n('.line-row') !== 1) bad.push(n('.line-row') + ' lines (a new Recipe opens with one empty line)')
        if (n('.step-card') !== 1) bad.push(n('.step-card') + ' Steps (a new Recipe opens with one empty Step)')
        if (document.querySelector('.step-card .file-drop, .step-card input[type="file"]')) bad.push('a Step shows a drop zone without a Photo')
        const top = document.getElementById('recipe-section-ingredients')?.getBoundingClientRect().top + scrollY
        if (innerWidth <= 390 && top > 560) bad.push('the Ingredients heading starts at y ' + Math.round(top) + ' (budget 560)')
        const yieldBox = [...document.querySelectorAll('#recipe-section-ingredients [role="spinbutton"]')].find((e) => /Yield/.test(e.getAttribute('aria-label') ?? ''))
        if (!yieldBox || (yieldBox.getAttribute('aria-valuenow') ?? yieldBox.value) !== '4') bad.push('the Yield is not 4 in the Ingredients head')
        return bad
      })()`)
      // Enter in the last field of the last line adds a line and puts the cursor in its picker. The last field is the Note from 42 rem
      // of list width, the Quantity on a phone (the Note is hidden until the line has one).
      const field = await evaluate(`(() => { const box = document.querySelector('.recipe-editor__lines-box'); return box && box.clientWidth >= 672 ? 'Note' : 'Quantity' })()`)
      await evaluate(`(() => { const l = document.querySelector('.line-row'); const i = [...l.querySelectorAll('input')].find((x) => (x.labels?.[0]?.textContent?.trim() ?? x.getAttribute('aria-label')) === ${JSON.stringify(field)}); i.focus(); return true })()`)
      await evaluate(`(() => { const e = document.activeElement; e.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true })); return true })()`)
      await until(`document.querySelectorAll('.line-row').length === 2`, `a second line after Enter in the ${field} of the last line`)
      await until(`document.activeElement?.closest('.line-row') === document.querySelectorAll('.line-row')[1] && document.activeElement.getAttribute('role') === 'combobox'`, "the cursor in the new line's Ingredient picker")
    },

    async recipeEditorRingRoom() {
      await until(LOADED, 'the editor with its Recipe')
      for (const id of ['recipe-section-about', 'recipe-section-planning']) {
        await press(`document.querySelector('#${id} button[aria-expanded="false"]')`, `the ${id} heading`)
      }
      await until(`document.querySelectorAll('#recipe-section-about button[aria-expanded="true"], #recipe-section-planning button[aria-expanded="true"]').length === 2`, 'both Disclosures open')
      await press(byText('button', 'Add ingredient use'), '"Add ingredient use"')
      await until(`!!document.querySelector('.step-card .use-row, .step-card [data-use]')`, 'a use row in a Step')
    },

    async recipeEditorRestoredFocus() {
      await until(LOADED, 'the editor with its Recipe')
      const original = await evaluate(`(${NAME_INPUT}).value`)
      const changed = `${original} (edited)`
      await evaluate(`(() => { const e = ${NAME_INPUT}; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(e, ${JSON.stringify(changed)}); e.dispatchEvent(new Event('input', { bubbles: true })); return true })()`)
      await sleep(900) // the reload draft is written 500 ms after the last change
      await evaluate('location.reload()')
      await until(`${LOADED} && (${NAME_INPUT}).value === ${JSON.stringify(changed)}`, 'the reloaded editor with the kept Name', 15000)
      await until(`[...document.querySelectorAll('[role="status"]')].some((s) => /Your unsaved changes are back/.test(s.textContent ?? ''))`, 'the "Your unsaved changes are back" notice')
      await evaluate(`document.documentElement.style.scrollBehavior = 'auto'; true`)
      // At rest, before anything is focused: the first screen of the restored editor shows the Name field whole, above the Save bar (the notice
      // must not push the Name under the floating bar: the developer of B9-31 saw it at 375).
      const rest = await evaluate(`(() => {
        scrollTo(0, 0)
        const e = ${NAME_INPUT}
        const bar = document.querySelector('.sticky-action-bar')
        if (!e || !bar) return { missing: true }
        const r = (e.closest('.ui-field') ?? e).getBoundingClientRect()
        return { bottom: r.bottom, barTop: bar.getBoundingClientRect().top }
      })()`)
      if (rest.missing) throw new Error('setup: no Name field or no Save bar on the restored editor')
      if (rest.bottom > rest.barTop - 4) throw new Error(`setup: on the first screen the Name field ends at y ${px(rest.bottom)}, ${px(rest.bottom - rest.barTop)} px under the Save bar's top (${px(rest.barTop)}): the restored-changes notice pushes it under the bar`)
      const targets = [
        ['the Name field', NAME_INPUT],
        ['the first Ingredient picker', `document.querySelector('.line-row [role="combobox"]')`],
        ['the first Quantity', `[...document.querySelectorAll('.line-row input')].find((x) => (x.labels?.[0]?.textContent?.trim() ?? x.getAttribute('aria-label')) === 'Quantity')`],
        ['the first Step text', `document.querySelector('.step-card textarea')`],
      ]
      for (const [what, expr] of targets) {
        await evaluate(`(() => { const e = ${expr}; if (!e) return false; try { e.focus({ focusVisible: true }) } catch { e.focus() } return true })()`)
        await sleep(250)
        const m = await evaluate(`(() => {
          const e = ${expr}
          if (!e || document.activeElement !== e) return { missing: true }
          const ring = ${RING}
          const r = ring(e.closest('.ui-field__control, .select') && getComputedStyle(e).outlineStyle === 'none' ? e.closest('.ui-field__control, .select') : e)
          const bar = document.querySelector('.sticky-action-bar')
          const top = [...document.querySelectorAll('header, .top-bar, .page-header--sticky')].map((h) => h.getBoundingClientRect()).filter((b) => b.bottom > 0 && b.top <= 0).reduce((a, b) => Math.max(a, b.bottom), 0)
          return { ring: r, barTop: bar ? bar.getBoundingClientRect().top : innerHeight, top }
        })()`)
        if (m.missing) throw new Error(`setup: ${what} is not there to be focused`)
        if (m.ring.b > m.barTop + 0.5) throw new Error(`setup: ${what}, focused, is ${px(m.ring.b - m.barTop)} px under the Save bar (it must scroll clear of it)`)
        if (m.ring.y < m.top - 0.5) throw new Error(`setup: ${what}, focused, is ${px(m.top - m.ring.y)} px under the top bar`)
      }
    },

    async recipeEditorTagChooser() {
      await until(LOADED, 'the editor with its Recipe')
      await press(`document.querySelector('#recipe-section-planning button[aria-expanded="false"]')`, 'the Planning heading')
      await until(`!!document.querySelector('.tag-chooser')`, 'the Tag field in Planning')
      await press(byText('.tag-chooser button', 'Add Tag'), '"Add Tag"')
      await until(`!!document.querySelector('[role="listbox"][aria-label="Tags"]')`, 'the Tag chooser')
      if (!(await evaluate(typeInto('[aria-label="Search or add a Tag"]', 'zzweekend')))) throw new Error('setup: no search field in the Tag chooser')
      await until(`!!document.querySelector('[role="listbox"][aria-label="Tags"] .select__option--create')`, 'the "Add Tag" row for a word that is no Tag')
      await evaluate(typeInto('[aria-label="Search or add a Tag"]', 'e'))
      await until(`document.querySelectorAll('[role="listbox"][aria-label="Tags"] [role="option"]').length > 0`, 'Tag options for "e"')
      const fits = await evaluate(`(() => { const r = document.querySelector('[role="listbox"][aria-label="Tags"]').getBoundingClientRect(); return r.bottom <= innerHeight + 1 && r.top >= -1 })()`)
      if (!fits) throw new Error('setup: the Tag list runs off the screen')
    },
  },
}
