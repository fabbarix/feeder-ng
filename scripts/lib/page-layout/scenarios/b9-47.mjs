// B9-47 (plan sections 6 and 9; TB-04, TB-07, TB-08, TB-15c, TB-15d, SHORT-03, A11Y-12, RES-09): the Kitchen board on real screens.
// TEST-AUTHOR scenarios: the setups ASSERT what the chapters' guards name and throw when it does not hold, so a scenario is "not inspected" (a
// failure) until the board is built. Scenario findings are never bridged by modes.d/10-width-375-warn: board-phone at 375 is the board's share
// of the 375 bridge (P13 on /board: a list item spilled 8 px out of its tile) and must be clean.
//   board-wall      / 1024x768, 1280x800, 1180x820, 1920x1080, 2560x1440: the 4 x 3 wall grid fills the screen with no scroll, the 8 tiles do not
//                     overlap, the type is the board unit's (hero name 3.25 u, Done 3.5 u high), every control is at least 56 px, the Close
//                     control is the first focusable element and is a circle, no ring crosses its tile's clip, the eyebrow is Today's with the
//                     day word, in parts that never break inside, and P13 (nothing runs past its tile: Tomorrow's long lines end in an ellipsis).
//   board-portrait  / 820x1180: 2 columns, 5 rows, all 8 tiles on one screen, no scroll.
//   board-short     / 844x390 and 667x375 (a phone held sideways): the board scrolls, nothing clips, Cook is at first view (SHORT-03).
//   board-phone     / 375 and 390: 2 columns, no horizontal scroll, controls at least 56 px, P13 clean.
//   board-close     / 1280x800: Close dims to 45 % after 10 s and returns on input; Esc leaves the board for Today.
//   board-error     / 375 and 1280x800 with /api/board failing: an ErrorState (role alert, Try again), the hidden h1 and Close still there.
import { evaluate, until } from '../helpers.mjs'

const READY = `!!document.querySelector('.board-grid .board-cell') && !document.querySelector('[aria-busy="true"]')`

/** Page code that returns '' when the board holds, else the first thing that does not. */
const CHECK = `(() => {
  const px = (e) => e.getBoundingClientRect()
  const vw = innerWidth, vh = innerHeight
  const kind = vw < 600 ? 'phone' : vh >= vw ? 'portrait' : vh < 560 ? 'scroll' : 'wall'
  const screen = document.querySelector('.board-screen')
  if (!screen) return 'there is no .board-screen'
  const grid = screen.querySelector('.board-grid')
  if (grid?.dataset.layout !== kind) return 'at ' + vw + 'x' + vh + ' the layout is "' + grid?.dataset.layout + '", expected "' + kind + '"'
  // TB-15d, A11Y-12: one hidden h1, "Kitchen board"
  const h1s = [...document.querySelectorAll('h1')]
  if (h1s.length !== 1 || h1s[0].textContent.trim() !== 'Kitchen board') return 'the board has ' + h1s.length + ' h1 (want one, "Kitchen board")'
  const hr = px(h1s[0])
  if (hr.width > 2 || hr.height > 2) return 'the h1 is not visually hidden (' + Math.round(hr.width) + 'x' + Math.round(hr.height) + ')'
  // TB-04: the first focusable element is the round Close, then at least one more control besides Cook
  const focusable = [...screen.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')]
  const close = focusable[0]
  if (!close || close.getAttribute('aria-label') !== 'Close kitchen board') return 'the first focusable element is not "Close kitchen board" (' + (close?.getAttribute('aria-label') ?? close?.textContent?.trim() ?? 'none') + ')'
  if (!focusable.some((e) => e !== close && !/^Cook/.test(e.textContent.trim()))) return 'no focusable control besides Cook (and Close)'
  const cr = px(close)
  if (Math.abs(cr.width - cr.height) > 1 || parseFloat(getComputedStyle(close).borderTopLeftRadius) < cr.width / 2 - 1) return 'Close is not a circle (' + Math.round(cr.width) + 'x' + Math.round(cr.height) + ')'
  // every board control is at least 56 px, and its ring (5 px) stays inside the tile that clips it
  for (const e of focusable) {
    const r = px(e)
    const name = e.getAttribute('aria-label') || e.textContent.trim().slice(0, 24)
    if (r.width < 55.5 || r.height < 55.5) return '"' + name + '" is ' + Math.round(r.width) + 'x' + Math.round(r.height) + ' (the board\\'s targets are at least 56 px)'
    const tile = e.closest('.tile')
    if (tile && getComputedStyle(tile).overflow !== 'visible') {
      const t = px(tile)
      if (r.left - 5 < t.left - 0.5 || r.right + 5 > t.right + 0.5 || r.top - 5 < t.top - 0.5 || r.bottom + 5 > t.bottom + 0.5) return 'the 5 px ring of "' + name + '" crosses the clip edge of its tile'
    }
  }
  // TB-08, TB 7: Today's eyebrow with its day word, in parts that never break inside, never "Tonight"
  const eyebrow = screen.querySelector('.board-eyebrow')
  if (!eyebrow) return 'the hero has no .board-eyebrow'
  const parts = [...eyebrow.querySelectorAll('.board-eyebrow__part')]
  if (parts.length < 2) return 'the eyebrow has ' + parts.length + ' parts'
  if (/tonight/i.test(screen.innerText)) return 'the board still says "Tonight"'
  if (!/^(today|tomorrow|mon|tue|wed|thu|fri|sat|sun)$/i.test(parts[0].textContent.trim())) return 'the eyebrow starts "' + parts[0].textContent.trim() + '", not with the day word'
  for (const p of parts) {
    const line = parseFloat(getComputedStyle(p).lineHeight) || parseFloat(getComputedStyle(p).fontSize) * 1.3
    if (px(p).height > line * 1.5) return 'the eyebrow part "' + p.textContent.trim() + '" breaks inside (' + Math.round(px(p).height) + ' px high)'
    if (getComputedStyle(p).whiteSpace !== 'nowrap') return 'the eyebrow part "' + p.textContent.trim() + '" can wrap'
  }
  // TB-08: Leftover meta and Tomorrow lines in the board's words
  if (/use by/.test(screen.querySelector('.board-leftovers')?.innerText ?? '')) return 'Leftovers says lowercase "use by"'
  for (const li of screen.querySelectorAll('.board-tomorrow li')) {
    if (li.scrollWidth > li.clientWidth + 1 && !li.title) return 'a Tomorrow line is cut with no title (' + li.textContent.trim().slice(0, 40) + ')'
  }
  // no horizontal scroll, ever
  if (document.documentElement.scrollWidth > vw + 1) return 'the page scrolls sideways (' + document.documentElement.scrollWidth + ' of ' + vw + ')'
  // the layouts
  const cells = [...screen.querySelectorAll('.board-cell')]
  if (cells.length !== 8) return 'the board has ' + cells.length + ' cells (want 8)'
  const rects = cells.map(px)
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
    const a = rects[i], b = rects[j]
    if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) return 'tiles overlap: ' + cells[i].dataset.cell + ' and ' + cells[j].dataset.cell
  }
  if (kind === 'wall' || kind === 'portrait') {
    if (document.documentElement.scrollHeight > vh + 1) return 'the ' + kind + ' board scrolls (' + document.documentElement.scrollHeight + ' of ' + vh + ')'
    for (const [i, r] of rects.entries()) if (r.left < -1 || r.top < -1 || r.right > vw + 1 || r.bottom > vh + 1) return 'the ' + cells[i].dataset.cell + ' tile is outside the screen'
  }
  if (kind === 'scroll') {
    const cook = [...screen.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Cook')
    if (cook && px(cook).bottom > vh) return 'Cook is below the first screen (bottom ' + Math.round(px(cook).bottom) + ' of ' + vh + '): SHORT-03'
    if (document.documentElement.scrollHeight <= vh) return 'the short board does not scroll but has 8 tiles in ' + Math.round(document.documentElement.scrollHeight) + ' px'
  }
  // TB-07: the type grows with the board unit (the hero name 3.25 u; Done is at least 3.5 u and 56 px high; chips at least 2.5 u and 40 px)
  const probe = document.createElement('div')
  probe.style.cssText = 'position:absolute;visibility:hidden;width:var(--board-unit)'
  screen.appendChild(probe)
  const unit = probe.getBoundingClientRect().width
  probe.remove()
  const name = screen.querySelector('.board-tonight__recipe, .board-tonight__course[data-main="true"]')
  if (name && Math.abs(parseFloat(getComputedStyle(name).fontSize) - 3.25 * unit) > 0.04 * 3.25 * unit) return 'the hero name is ' + getComputedStyle(name).fontSize + ', want 3.25 board units (' + (3.25 * unit).toFixed(1) + 'px)'
  const done = screen.querySelector('.board-next__done')
  if (done && px(done).height < Math.max(56, 3.5 * unit) - 1) return 'Done is ' + Math.round(px(done).height) + ' px high, want ' + Math.round(Math.max(56, 3.5 * unit))
  for (const chip of screen.querySelectorAll('.board-use-soon .chip, .board-next .chip')) if (px(chip).height < Math.max(40, 2.5 * unit) - 1) return 'a chip is ' + Math.round(px(chip).height) + ' px high, want ' + Math.round(Math.max(40, 2.5 * unit))
  return ''
})()`

async function check(setupName) {
  await until(READY, 'the Kitchen board')
  const finding = await evaluate(CHECK)
  if (finding) throw new Error(`setup: not inspected: ${setupName}: ${finding}`)
}

// A short wait for a page-code condition that needs the clock (the 10 s idle dim).
const settle = (ms) => new Promise((r) => setTimeout(r, ms))

const FAIL_BOARD = `(() => {
  const real = window.fetch
  window.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input.url
    if (/\\/api\\/board(\\?|$)/.test(url)) return Promise.resolve(new Response('{"error":"boom"}', { status: 500, headers: { 'content-type': 'application/json' } }))
    return real(input, init)
  }
})()`

const RULES = ['P1', 'P11', 'P13', 'P14', 'P17', 'P18']

export default {
  order: 350,
  scenarios: [
    { name: 'board-wall', route: '/board', start: '/board', setup: 'boardWall', widths: ['1024x768', '1280x800', '1180x820', '1920x1080', '2560x1440'], rules: RULES },
    { name: 'board-portrait', route: '/board', start: '/board', setup: 'boardPortrait', widths: ['820x1180'], rules: RULES },
    { name: 'board-short', route: '/board', start: '/board', setup: 'boardShort', widths: ['844x390', '667x375'], rules: RULES },
    { name: 'board-phone', route: '/board', start: '/board', setup: 'boardPhone', widths: [375, 390], rules: RULES },
    { name: 'board-close', route: '/board', start: '/board', setup: 'boardClose', widths: ['1280x800'], rules: ['P1', 'P13'] },
    { name: 'board-error', route: '/board', start: '/board', setup: 'boardError', widths: [375, '1280x800'], emulate: [{ method: 'Page.addScriptToEvaluateOnNewDocument', params: { source: FAIL_BOARD } }], rules: ['P1', 'P13'] },
  ],
  setups: {
    boardWall: () => check('wall'),
    boardPortrait: () => check('portrait'),
    boardShort: () => check('scroll'),
    boardPhone: () => check('phone'),
    async boardClose() {
      await check('close')
      const opacity = () => evaluate(`parseFloat(getComputedStyle(document.querySelector('.board-close')).opacity)`)
      if ((await opacity()) < 0.99) throw new Error('setup: not inspected: Close is already dimmed at first view')
      await settle(10_800)
      await until(`document.querySelector('.board-close')?.dataset.idle === 'true'`, 'Close to dim after 10 s', 2000)
      await settle(600) // the 0.4 s fade
      const dim = await opacity()
      if (Math.abs(dim - 0.45) > 0.03) throw new Error(`setup: not inspected: Close is at opacity ${dim} after 10 s idle (want 0.45)`)
      await evaluate(`window.dispatchEvent(new Event('pointermove', { bubbles: true }))`)
      await settle(700)
      if ((await opacity()) < 0.99) throw new Error('setup: not inspected: Close did not return to full strength on input')
      // Esc leaves: the board was opened directly, so it goes to Today
      await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
      await until(`location.pathname === '/'`, 'Esc to leave the board for Today', 4000)
      await evaluate(`history.back()`) // put /board back so the page-layout rules measure the board, not Today
      await until(`location.pathname === '/board' && !!document.querySelector('.board-grid')`, 'the board again', 6000)
    },
    async boardError() {
      await until(`!!document.querySelector('.error-state')`, 'the board\'s ErrorState', 20000)
      const finding = await evaluate(`(() => {
        const alert = document.querySelector('.error-state[role="alert"]')
        if (!alert) return 'the load error is not an ErrorState with role=alert'
        if (document.querySelector('.empty-state')) return 'the load error is still an accent EmptyState'
        if (![...alert.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Try again')) return 'the error has no Try again'
        if (document.querySelectorAll('h1').length !== 1) return 'the error state has no h1 "Kitchen board"'
        if (!document.querySelector('[aria-label="Close kitchen board"]')) return 'the error state has no way out (Close kitchen board)'
        return ''
      })()`)
      if (finding) throw new Error(`setup: not inspected: ${finding}`)
    },
  },
}
