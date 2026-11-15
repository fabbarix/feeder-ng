// B9-44 (plan sections 6 and 9; TB-02, TB-03, TB-09, TB-11, TB-12, RES-05, RES-09): Today's grid and tiles on a real screen. TEST-AUTHOR scenarios: the
// setups ASSERT what the chapters' guards name and throw when it does not hold, so a scenario is "not inspected" (a failure) until it is built.
// P42 (a subtitle other than the Household date) runs on every Today scenario; the rule numbers named below are the existing rules.
//   today-advance   / at 375, 390, 1440: the Advance Steps tile of the seeded 24 h Step (page-layout-seed/today-advance.mjs): an info status tile with one
//                   header; Done is at least 44 x 44; a focused Done shows ONE inner ring (the tile has its own boundary); at 1440 the tile is in the aside, beside
//                   the hero; Done toasts "Advance Step done" with Undo and no icon, and the setup presses Undo so the next run starts clean.
//   today-grid      / at 375, 390, 667x375, 834, 1024, 1440: every tile but the hero has exactly one .tile-header and none has a tertiary button; no <li> outside
//                   a ul/ol; at 1280+ no ListRow meta of 20 characters or fewer is truncated; at 1440 the hero, To confirm and the aside make three tracks; and one
//                   resize walk, 600 to 1480 px every 40 px in a same-origin iframe, checks (TB-03): the Cook button keeps its side from 600 on, from 1280 no tile
//                   but the hero (and To confirm) is wider than two thirds of the page, and a metric value never meets its icon.
//   today-shopping  / at 375, 1440: after one typed Scan on /scan, Today (opened in the app) leads with "Shopping at <Shop>" with Back to Scan (primary) and
//                   Done shopping (secondary); Done shopping removes the tile.
//   today-cls       / at 390 and 1280, plan-cls /plan at 390 and 1280: the layout shift of the load is 0.1 or less (RES-05).
import { byText, evaluate, ids, press, scanSession, until } from '../helpers.mjs'

const READY = `!!document.querySelector('main .bento-grid') && !document.querySelector('[aria-busy="true"], .skeleton')`

async function withSnapshot(run) {
  try {
    await run()
  } catch (e) {
    const seen = await evaluate(`JSON.stringify({ tiles: [...document.querySelectorAll('.today [data-tile]')].map((t) => t.dataset.tile), main: (document.querySelector('main')?.innerText || '').replace(/\\s+/g, ' ').slice(0, 240) })`).catch(() => '?')
    throw new Error(`${e.message} [${seen}]`)
  }
}

async function todayAdvance() {
  await until(READY, 'Today')
  await withSnapshot(async () => {
    const finding = await evaluate(`(() => {
      const tile = [...document.querySelectorAll('main section.tile')].find((s) => s.querySelector('h2')?.textContent.trim() === 'Advance Steps')
      if (!tile) return 'Today has no "Advance Steps" tile (the seeded Step is due in the next 24 hours, TB-02)'
      if (tile.dataset.status !== 'info' || tile.dataset.variant !== 'status') return 'the Advance Steps tile is not an info status tile (' + tile.dataset.variant + '/' + tile.dataset.status + ')'
      if (tile.querySelectorAll('.tile-header').length !== 1) return 'the tile has ' + tile.querySelectorAll('.tile-header').length + ' headers, not one (TB-09)'
      const done = [...tile.querySelectorAll('button')].find((b) => /^Done: /.test(b.getAttribute('aria-label') ?? ''))
      if (!done) return 'the tile has no Done button named "Done: <Step text>"'
      const r = done.getBoundingClientRect()
      if (r.width < 43.5 || r.height < 43.5) return 'Done is ' + Math.round(r.width) + ' x ' + Math.round(r.height) + ', under 44 x 44'
      const badge = tile.querySelector('.advance-step__when')
      if (!badge) return 'the row has no When badge (.advance-step__when)'
      if (!/^(Today|Overdue|Mon|Tue|Wed|Thu|Fri|Sat|Sun)\\s*\\d{2}:\\d{2}$/.test(badge.textContent.trim())) return 'the When badge reads "' + badge.textContent.trim() + '"'
      if (tile.querySelector('.today__tile-title')) return 'the old bare title is still there'
      // the aside, beside the hero, from 60 rem of page
      const grid = document.querySelector('.today__grid')
      if (!grid) return 'Today has no .today__grid'
      if (innerWidth >= 1280) {
        const aside = tile.closest('.today__aside')
        const hero = document.querySelector('.plan-hero')
        if (!aside) return 'at ' + innerWidth + ' px the Advance Steps tile is not in the aside'
        if (hero && aside.getBoundingClientRect().left < hero.getBoundingClientRect().right - 1) return 'the aside starts at ' + Math.round(aside.getBoundingClientRect().left) + ', inside the hero (right ' + Math.round(hero.getBoundingClientRect().right) + ')'
      }
      return ''
    })()`)
    if (finding) throw new Error(`setup: not inspected: ${finding}`)
    // a focused Done shows one inner ring: the focus ring is drawn inside the button, not outside the tile (R-C+)
    await evaluate(`[...document.querySelectorAll('main section.tile button')].find((b) => /^Done: /.test(b.getAttribute('aria-label') ?? '')).focus()`)
    const ring = await evaluate(`(() => {
      const b = document.activeElement
      const cs = getComputedStyle(b)
      const outline = parseFloat(cs.outlineWidth) > 0 && cs.outlineStyle !== 'none'
      return outline && parseFloat(cs.outlineOffset) > 0 ? 'the focus ring of Done is drawn outside the button (outline-offset ' + cs.outlineOffset + ')' : ''
    })()`)
    if (ring) throw new Error(`setup: not inspected: ${ring}`)
    // Done, then Undo
    await press(`[...document.querySelectorAll('main section.tile button')].find((b) => /^Done: /.test(b.getAttribute('aria-label') ?? ''))`, 'Done')
    await until(`!!document.querySelector('.toast')`, 'the Advance Step done toast', 5000)
    const toast = await evaluate(`(() => {
      const t = document.querySelector('.toast')
      if (!/Advance Step done/.test(t.querySelector('.toast__title')?.textContent ?? '')) return 'the toast does not start "Advance Step done": ' + t.innerText.replace(/\\s+/g, ' ').slice(0, 80)
      if (t.querySelector('.toast__title svg')) return 'an icon precedes the message'
      if (![...t.querySelectorAll('button')].some((b) => /^Undo/.test(b.getAttribute('aria-label') ?? b.textContent.trim()))) return 'the toast has no Undo'
      return ''
    })()`)
    if (toast) throw new Error(`setup: not inspected: ${toast}`)
    await press(`[...document.querySelectorAll('.toast button')].find((b) => /^Undo/.test(b.getAttribute('aria-label') ?? b.textContent.trim()))`, 'Undo')
    await until(`[...document.querySelectorAll('main section.tile button')].some((b) => /^Done: /.test(b.getAttribute('aria-label') ?? ''))`, 'the Step back after Undo', 5000)
  })
}

/** The resize walk, run inside the page in a same-origin iframe (the viewport of the iframe is its width, so the rail and the container answer for it). */
const WALK = `(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.tabIndex = -1
  frame.style.cssText = 'position:absolute;left:-20000px;top:0;border:0;height:900px;width:600px'
  const loaded = new Promise((r) => frame.addEventListener('load', r, { once: true }))
  frame.src = location.href
  document.body.appendChild(frame)
  const out = { cook: [], wide: [], metric: [] }
  try {
    await loaded
    const doc = () => frame.contentDocument
    const ready = () => { const d = doc(); return !!d && d.readyState === 'complete' && d.querySelector('main .today__grid') && !d.querySelector('[aria-busy="true"], .skeleton') }
    for (let t = 0; t < 100 && !ready(); t++) await sleep(100)
    if (!ready()) throw new Error('the page in the walk frame did not show .today__grid')
    for (let w = 600; w <= 1480; w += 40) {
      frame.style.width = w + 'px'
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      await sleep(120)
      const d = doc()
      const page = d.querySelector('.today__grid').getBoundingClientRect()
      const hero = d.querySelector('.plan-hero')
      const cook = hero && [...hero.querySelectorAll('.plan-hero__actions button')][0]
      if (hero && cook) {
        const h = hero.getBoundingClientRect(), c = cook.getBoundingClientRect()
        out.cook.push({ w, side: (c.left + c.right) / 2 < (h.left + h.right) / 2 ? 'left' : 'right', full: Math.round(c.width) >= Math.round(h.width) - 80 })
      }
      if (w >= 1280) {
        for (const t of d.querySelectorAll('.today__grid [data-tile] > .tile-boundary > .tile, .today__grid [data-tile] > .tile')) {
          const slot = t.closest('[data-tile]')?.dataset.tile
          if (slot === 'nextMeal' || slot === 'toConfirm' || slot === 'shopping' || slot === 'setup') continue
          const r = t.getBoundingClientRect()
          if (r.width > page.width * 2 / 3 + 2) out.wide.push({ w, tile: slot, width: Math.round(r.width), page: Math.round(page.width) })
        }
      }
      for (const m of d.querySelectorAll('.today-metric__head')) {
        const v = m.querySelector('.today-metric__value, .tile-metric__value'), i = m.querySelector('.today-metric__icon')
        if (!v || !i) continue
        const range = d.createRange(); range.selectNodeContents(v)
        const tr = range.getBoundingClientRect(), ir = i.getBoundingClientRect()
        const hit = !(tr.right <= ir.left + 0.5 || tr.left >= ir.right - 0.5 || tr.bottom <= ir.top || tr.top >= ir.bottom)
        if (hit) out.metric.push({ w, value: v.textContent.trim() })
      }
    }
    return out
  } finally {
    frame.remove()
  }
})()`

async function todayGrid() {
  await until(READY, 'Today')
  await withSnapshot(async () => {
    const finding = await evaluate(`(() => {
      const grid = document.querySelector('.today__grid')
      if (!grid) return 'Today has no .today__grid (TB-03)'
      if (grid.dataset.min || grid.dataset.columns) return 'the grid still has data-min or data-columns'
      // TB-09: one tile header per tile but the hero; no tertiary button
      for (const slot of grid.querySelectorAll('[data-tile]')) {
        const id = slot.dataset.tile
        if (id === 'nextMeal' || id === 'metrics' || id === 'setup') continue
        const tile = slot.querySelector('section.tile, article.tile')
        if (!tile) continue
        const n = tile.querySelectorAll('.tile-header').length
        if (n !== 1) return 'the ' + id + ' tile has ' + n + ' .tile-header, not one (TB-09)'
      }
      if (document.querySelector('.today [data-variant="tertiary"]')) return 'a tile contains a tertiary button (TB-09)'
      // TB-11: no li outside a list
      for (const li of document.querySelectorAll('main li')) if (!li.parentElement || !/^(UL|OL|MENU)$/.test(li.parentElement.tagName)) return 'a <li> ("' + li.textContent.trim().slice(0, 30) + '") is outside a ul or ol (TB-11)'
      // TB-11: a one-line meta of 20 characters or fewer is never truncated, at 1280 and wider
      if (innerWidth >= 1280) {
        for (const m of document.querySelectorAll('.today .list-row__meta')) {
          const t = m.textContent.trim()
          if (t.length <= 20 && m.scrollWidth > m.clientWidth + 1) return 'the meta "' + t + '" is truncated (scrollWidth ' + m.scrollWidth + ' > ' + m.clientWidth + ', TB-11)'
        }
      }
      // TB-03: three tracks from 60 rem of page
      const page = grid.getBoundingClientRect().width
      const hero = document.querySelector('.plan-hero'), confirm = document.querySelector('[data-tile="toConfirm"] .tile')
      if (page >= 60 * 16 && hero) {
        const h = hero.getBoundingClientRect(), a = document.querySelector('.today__aside')
        if (h.width > page * 2 / 3 + 2) return 'the hero is ' + Math.round(h.width) + ' px of a ' + Math.round(page) + ' px page: wider than two thirds'
        if (a && Math.abs(a.getBoundingClientRect().top - h.top) > 2) return 'the aside does not start at the hero\\'s top'
        if (confirm && confirm.getBoundingClientRect().width > page * 2 / 3 + 2) return 'To confirm is wider than two thirds of the page'
      }
      if (page < 40 * 16) {
        const tiles = [...grid.querySelectorAll('[data-tile] .tile')].map((t) => Math.round(t.getBoundingClientRect().left))
        if (new Set(tiles).size > 1) return 'under 40 rem of page Today is one column, but its tiles start at ' + [...new Set(tiles)].join(' and ') + ' px'
      }
      return ''
    })()`)
    if (finding) throw new Error(`setup: not inspected: ${finding}`)
    // the walk runs once, at the widest profile (it makes its own iframes)
    if ((await evaluate('innerWidth')) >= 1440) {
      const walk = await evaluate(WALK)
      const sides = new Set(walk.cook.map((s) => s.side))
      if (walk.cook.length === 0) throw new Error('setup: not inspected: the walk found no Cook button in the hero (the seed has a hero with Cook)')
      if (sides.size > 1) throw new Error(`setup: not inspected: the Cook button changes sides between 600 and 1480 px (${walk.cook.map((s) => `${s.w}:${s.side}`).join(' ')})`)
      if (walk.wide.length) throw new Error(`setup: not inspected: a tile is wider than two thirds of the page from 1280 px: ${JSON.stringify(walk.wide[0])}`)
      if (walk.metric.length) throw new Error(`setup: not inspected: a metric value meets its icon: ${JSON.stringify(walk.metric[0])}`)
    }
  })
}

async function todayShopping() {
  await scanSession([ids.scanBarcodes?.[0] ?? ids.unknownBarcode])
  await evaluate(`(() => { const a = [...document.querySelectorAll('a[href="/"]')][0]; if (a) a.click(); else { history.pushState({}, '', '/'); window.dispatchEvent(new PopStateEvent('popstate')) } })()`)
  await until(`location.pathname === '/' && !!document.querySelector('.today__grid')`, 'Today after the Scan session')
  await withSnapshot(async () => {
    await until(`!!document.querySelector('section[aria-label^="Shopping at"], section[aria-labelledby]')`, 'a section')
    const finding = await evaluate(`(() => {
      const first = document.querySelector('.today__grid [data-tile]')
      if (first?.dataset.tile !== 'shopping') return 'the first tile is "' + first?.dataset.tile + '", not the Shopping tile (TB-12)'
      const tile = first.querySelector('section')
      const name = tile.querySelector('h2')?.textContent.trim() ?? ''
      if (!/^Shopping at /.test(name)) return 'the tile is "' + name + '", not "Shopping at <Shop>"'
      const back = [...tile.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Back to Scan')
      const done = [...tile.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Done shopping')
      if (!back || back.dataset.variant !== 'primary') return 'no primary "Back to Scan"'
      if (!done || done.dataset.variant !== 'secondary') return 'no secondary "Done shopping"'
      if (!/^\\d+ scanned/.test(tile.textContent.replace(/\\s+/g, ' ').replace(name, '').trim())) return 'the meta does not start with the number scanned: ' + tile.textContent.replace(/\\s+/g, ' ').slice(0, 100)
      return ''
    })()`)
    if (finding) throw new Error(`setup: not inspected: ${finding}`)
    await press(byText('button', 'Done shopping'), 'Done shopping')
    await until(`document.querySelector('.today__grid [data-tile]')?.dataset.tile !== 'shopping'`, 'the Shopping tile to go')
  })
}

const CLS = `new Promise((resolve) => {
  let value = 0
  const po = new PerformanceObserver((list) => { for (const e of list.getEntries()) if (!e.hadRecentInput) value += e.value })
  po.observe({ type: 'layout-shift', buffered: true })
  setTimeout(() => { po.disconnect(); resolve(value) }, 300)
})`
const cls = (route) => async () => {
  await until(`!!document.querySelector('main') && !document.querySelector('[aria-busy="true"], .skeleton')`, route === '/' ? 'Today' : 'the Plan')
  await evaluate(`new Promise((r) => setTimeout(r, 1500))`)
  const value = await evaluate(CLS)
  if (!(value <= 0.1)) throw new Error(`setup: not inspected: the layout shift of ${route} is ${Number(value).toFixed(4)}, over 0.1 (RES-05)`)
}

export default {
  order: 344,
  scenarios: [
    { name: 'today-advance', route: '/', start: '/', widths: [375, 390, 1440], setup: 'todayAdvance', rules: ['P1', 'P11', 'P13', 'P14', 'P17', 'P18', 'P29', 'P36', 'P38', 'P39', 'P42'] },
    { name: 'today-grid', route: '/', start: '/', widths: [375, 390, '667x375', 834, '1024x768', 1440], setup: 'todayGrid', rules: ['P1', 'P3', 'P11', 'P13', 'P14', 'P17', 'P18', 'P23', 'P26', 'P38', 'P39', 'P42'] },
    { name: 'today-shopping', route: '/', start: '/scan', widths: [375, 1440], setup: 'todayShopping', rules: ['P1', 'P11', 'P13', 'P14', 'P29', 'P38', 'P39', 'P42'] },
    { name: 'today-cls', route: '/', start: '/', widths: [390, '1280x800'], setup: 'todayCls', rules: ['P1', 'P42'] },
    { name: 'plan-cls', route: '/plan', start: '/plan', widths: [390, '1280x800'], setup: 'planCls', rules: ['P1'] },
  ],
  setups: {
    todayAdvance: () => todayAdvance(),
    todayGrid: () => todayGrid(),
    todayShopping: () => todayShopping(),
    todayCls: cls('/'),
    planCls: cls('/plan'),
  },
}
