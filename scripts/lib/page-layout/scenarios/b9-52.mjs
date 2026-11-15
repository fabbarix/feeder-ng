// B9-52 (SET-03, SET-12, TB-15e; plan section 9): the scenarios of the Allowlist and the Sign-in requests page. Each setup measures the
// page itself and throws when the screen is wrong, so the check holds whatever the shared rules (P40 and the others) are doing.
//   allowlist-actions     /settings/allowlist, no share sheet (a desktop-like browser): each row's email is whole (it wraps only before "@" or
//                         after ".", never mid-word, or ends in an ellipsis), at least 120 px wide; below 35 rem the controls take their own
//                         line under it; every control has a target of at least 44 x 44 px (its hit area: an IconButton's ::after, a
//                         Switch's row) and the switch and the buttons keep 8 px between them.
//   allowlist-share       the same page on a device with a share sheet (navigator.share is defined before the app starts): the row shows
//                         "Share sign-in message for <email>" and "More for <email>", both 44 x 44 px; More opens a menu with Copy and Remove.
//   access-requests-rows  /settings/access-requests with the seeded requests (page-layout-seed/access.mjs): every row's name is whole and at
//                         least 120 px wide, a monogram sits at its start, Deny and Approve are 44 px tall and keep 8 px between them, and
//                         neither leaves the row. With no seeded request the setup throws (the seed step failed): not inspected.
import { evaluate, js, press, until } from '../helpers.mjs'

const MIN_TITLE = 120
const MIN_TARGET = 44
const MIN_GAP = 8

/** Page code: the rows (li.list-row) of the list under `sel`. */
const ROWS = (sel) => `[...document.querySelectorAll(${js(sel)} + ' li.list-row')]`

/** Page code: where the text of `el` wraps, as the characters that start a new line (an empty list when it is on one line). */
const LINE_STARTS = `(el) => {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  const starts = []
  let prev = null, text = ''
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    for (let i = 0; i < n.data.length; i++) {
      const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + 1)
      const box = r.getClientRects()[0]
      if (!box) { text += n.data[i]; continue }
      if (prev && box.top > prev.top + prev.height / 2) starts.push({ at: text.length, before: text.slice(-1), char: n.data[i] })
      prev = box; text += n.data[i]
    }
  }
  return { text, starts }
}`

/** Page code: problems with the emails of the Allowlist rows (mid-word breaks, narrow titles). */
const CHECK_TITLES = `(() => {
  const lineStarts = ${LINE_STARTS}
  const bad = []
  for (const li of ${ROWS('.allowlist__list')}) {
    const title = li.querySelector('.list-row__title')
    const w = title.getBoundingClientRect().width
    if (w < ${MIN_TITLE}) bad.push(title.textContent.trim() + ' is ' + Math.round(w) + ' px wide')
    const { text, starts } = lineStarts(title)
    for (const s of starts) if (!(s.char === '@' || s.before === '.')) bad.push(text + ' breaks mid-word before "' + s.char + '"')
  }
  return bad
})()`

/** Page code: problems with the controls of each Allowlist row (own line below 35 rem, 44 px targets, 8 px apart). The target is
 *  the hit area, not the visual box (main-session ruling): an IconButton is 40 px visual with a 44 px ::after (its inset widens
 *  the box), and a Switch is hit through its 44 px .switch-row. The 8 px gap is measured between the visual boxes. */
const CHECK_ACTIONS = `(() => {
  const hitArea = (e) => {
    const r = e.getBoundingClientRect()
    if (e.matches('[role=switch]')) {
      const row = e.closest('.switch-row')
      return row ? row.getBoundingClientRect() : r
    }
    const after = getComputedStyle(e, '::after')
    if (after.content === 'none' || after.position !== 'absolute') return r
    const grow = (v) => Math.max(0, -(parseFloat(v) || 0))
    return { width: r.width + grow(after.left) + grow(after.right), height: r.height + grow(after.top) + grow(after.bottom) }
  }
  const bad = []
  for (const li of ${ROWS('.allowlist__list')}) {
    const name = li.querySelector('.list-row__title').textContent.trim()
    const actions = li.querySelector('.list-row__actions')
    if (!actions) { bad.push(name + ' has no actions slot'); continue }
    const title = li.querySelector('.list-row__title').getBoundingClientRect()
    const box = actions.getBoundingClientRect()
    if (li.getBoundingClientRect().width < 560 && box.top < title.bottom - 1) bad.push(name + ': the controls share the email line below 35 rem')
    const controls = [...actions.querySelectorAll('button, [role=switch]')].map((e) => ({ e, r: e.getBoundingClientRect() })).sort((a, b) => a.r.left - b.r.left)
    for (const { e, r } of controls) {
      const t = hitArea(e)
      if (t.width < ${MIN_TARGET} - 0.5 || t.height < ${MIN_TARGET} - 0.5) bad.push(name + ': ' + (e.getAttribute('aria-label') || e.textContent) + ' has a ' + Math.round(t.width) + 'x' + Math.round(t.height) + ' px target')
      if (r.right > li.getBoundingClientRect().right + 0.5) bad.push(name + ': a control leaves the row')
    }
    for (let i = 1; i < controls.length; i++) {
      const a = controls[i - 1].r, b = controls[i].r
      if (Math.abs(a.top - b.top) < a.height && b.left - a.right < ${MIN_GAP} - 0.5) bad.push(name + ': only ' + Math.round(b.left - a.right) + ' px between controls')
    }
  }
  return bad
})()`

const fail = (what, list) => {
  if (list.length) throw new Error(`setup: ${what}: ${js(list)}`)
}

const LOADED = `!!document.querySelector('main .allowlist__list li.list-row') && !document.querySelector('[aria-busy="true"], .skeleton')`

/** A share sheet that exists, from the first line of the page (the app decides once per page load). */
const SHARE_SHEET = { method: 'Page.addScriptToEvaluateOnNewDocument', params: { source: `Object.defineProperty(navigator, 'share', { configurable: true, value: () => Promise.resolve() })` } }

export default {
  order: 330,
  scenarios: [
    { name: 'allowlist-actions', route: '/settings/allowlist', start: '/settings/allowlist', setup: 'allowlistActions', widths: [375, 390, 834], rules: ['P1', 'P11', 'P13', 'P40'] },
    { name: 'allowlist-share', route: '/settings/allowlist', start: '/settings/allowlist', setup: 'allowlistShare', widths: [375, 834], emulate: [SHARE_SHEET], rules: ['P1', 'P11', 'P13', 'P40'] },
    { name: 'access-requests-rows', route: '/settings/access-requests', start: '/settings/access-requests', setup: 'accessRequestsRows', widths: [375, 390, 834], rules: ['P1', 'P11', 'P13', 'P40'] },
  ],
  setups: {
    async allowlistActions() {
      await until(LOADED, 'the Allowlist rows')
      fail('an Allowlist email', await evaluate(CHECK_TITLES))
      fail('the Allowlist controls', await evaluate(CHECK_ACTIONS))
      if (await evaluate(`!!document.querySelector('.allowlist__list [aria-label^="Share sign-in message"]')`)) throw new Error('setup: Share shown on a device with no share sheet')
      if (!(await evaluate(`!!document.querySelector('.allowlist__list [aria-label^="Copy sign-in message for"]')`))) throw new Error('setup: no "Copy sign-in message for <email>" button')
    },
    async allowlistShare() {
      await until(LOADED, 'the Allowlist rows')
      fail('an Allowlist email', await evaluate(CHECK_TITLES))
      fail('the Allowlist controls', await evaluate(CHECK_ACTIONS))
      if (!(await evaluate(`!!document.querySelector('.allowlist__list [aria-label^="Share sign-in message for"]') && !!document.querySelector('.allowlist__list [aria-label^="More for"][aria-haspopup="menu"]')`))) {
        throw new Error('setup: not inspected: no Share and More buttons (the share sheet stub did not reach the app)')
      }
      await press(`document.querySelector('.allowlist__list [aria-label^="More for"]')`, 'the More button')
      await until(`!!document.querySelector('[role=menu], [role=dialog]') && [...document.querySelectorAll('[role=menuitem], [role=dialog] button')].some((e) => e.textContent.trim() === 'Copy sign-in message')`, 'the More menu with "Copy sign-in message"')
      await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
    },
    async accessRequestsRows() {
      await until(`!!document.querySelector('main .access__list li.list-row, main .empty-state, main .muted') && !document.querySelector('[aria-busy="true"], .skeleton')`, 'the sign-in requests')
      const bad = await evaluate(`(() => {
        const lineStarts = ${LINE_STARTS}
        const rows = [...document.querySelectorAll('main .access__list li.list-row')].filter((li) => li.querySelector('button[aria-label^="Approve "]'))
        if (rows.length === 0) return ['no seeded sign-in requests']
        const out = []
        for (const li of rows) {
          const title = li.querySelector('.list-row__title')
          const name = title.textContent.trim()
          const w = title.getBoundingClientRect().width
          if (w < ${MIN_TITLE}) out.push(name + ' is ' + Math.round(w) + ' px wide')
          for (const s of lineStarts(title).starts) if (!(s.char === '@' || s.before === '.' || s.before === ' ')) out.push(name + ' breaks mid-word before "' + s.char + '"')
          if (!li.querySelector('.avatar')) out.push(name + ' has no monogram')
          const row = li.getBoundingClientRect()
          if (!li.querySelector('.list-row__actions')) out.push(name + ' has no actions slot')
          const buttons = [...li.querySelectorAll('button[aria-label^="Approve "], button[aria-label^="Deny "]')].map((b) => ({ b, r: b.getBoundingClientRect() })).sort((a, b) => a.r.left - b.r.left)
          if (buttons.length !== 2) out.push(name + ' has ' + buttons.length + ' action buttons')
          for (const { b, r } of buttons) {
            if (r.height < ${MIN_TARGET} - 0.5) out.push(name + ': ' + b.textContent.trim() + ' is ' + Math.round(r.height) + ' px tall')
            if (r.right > row.right + 0.5 || r.left < row.left - 0.5) out.push(name + ': ' + b.textContent.trim() + ' leaves the row')
          }
          if (buttons.length === 2 && Math.abs(buttons[0].r.top - buttons[1].r.top) < buttons[0].r.height && buttons[1].r.left - buttons[0].r.right < ${MIN_GAP} - 0.5) out.push(name + ': Deny and Approve touch')
        }
        return out
      })()`)
      fail('a sign-in request row', bad)
    },
  },
}
