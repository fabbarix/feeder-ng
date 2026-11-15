// B9-25 (PC-04; plan section 9, no rule number of its own): the shell timer pill, measured on a real page. Two timers run, so the pill
// shows "+1". The setup starts them through the API, reloads, measures, cancels them again (later scenarios must not see a pill),
// and THROWS on a finding: a setup that throws fails the scenario as "not inspected" and names the finding, which is how this
// package guards without a rule number (P1..P43 are all assigned). The checks are the chapter's guard:
//   1. the pill does not cover the bottom bar, or a sticky action bar (boxes overlapping by more than 1 px both ways);
//   2. the "+N" badge's box is at least 6 px inside the pill's box on every side;
//   3. the pill's focus ring box (the open button focused with focus-visible) is inside the viewport and inside the padding box of every
//      ancestor that clips (overflow other than visible), so no ancestor cuts it.
//   timer-pill         /plan at 375, 390 and 1440 (the pill above the bottom bar on phones, in the top bar from 1024)
//   timer-pill-editor  /recipes/:id/edit at 375, 390 and 834 (a sticky Save bar: the pill sits above it)
// The rule list is P1 only so the page is also checked for sideways scroll with the pill showing.
import { evaluate, until } from '../helpers.mjs'

const START_TIMERS = `(async () => {
  const post = (body) => fetch('/api/cook/timers', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const a = await post({ label: 'Roast the chicken', durationSeconds: 1500 })
  const b = await post({ label: 'Rest the chicken', durationSeconds: 1800 })
  return a.ok && b.ok
})()`

const CANCEL_TIMERS = `(async () => {
  const list = await (await fetch('/api/cook/timers', { credentials: 'same-origin' })).json()
  await Promise.all((list.timers || []).map((t) => fetch('/api/cook/timers/' + t.id, { method: 'DELETE', credentials: 'same-origin' })))
  return true
})()`

const MEASURE = `(() => {
  const box = (e) => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, r: r.right, b: r.bottom } }
  const visible = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' }
  const overlap = (a, b) => ({ w: Math.min(a.r, b.r) - Math.max(a.x, b.x), h: Math.min(a.b, b.b) - Math.max(a.y, b.y) })
  const px = (n) => String(Math.round(n * 10) / 10)
  const pill = document.querySelector('.shell-timer .timer-pill')
  if (!pill || !visible(pill)) return ['no timer pill is showing (.shell-timer .timer-pill)']
  const out = []
  const p = box(pill)
  for (const [kind, sel] of [['bottom bar', 'nav.bottom-bar'], ['sticky action bar', '.sticky-action-bar']]) {
    for (const e of document.querySelectorAll(sel)) {
      if (!visible(e)) continue
      const o = overlap(p, box(e))
      if (o.w > 1 && o.h > 1) out.push('the pill covers the ' + kind + ' by ' + px(o.h) + ' px (height) x ' + px(o.w) + ' px')
    }
  }
  const badge = pill.querySelector('.timer-pill__more')
  if (!badge) out.push('the pill shows no "+N" badge although two timers run')
  else {
    const b = box(badge)
    for (const [side, d] of [['start', b.x - p.x], ['end', p.r - b.r], ['top', b.y - p.y], ['bottom', p.b - b.b]]) {
      if (d < 6) out.push('the "+N" badge is ' + px(d) + ' px from the pill\\'s ' + side + ' edge (at least 6 px)')
    }
  }
  const open = pill.querySelector('.timer-pill__open')
  if (open) {
    open.focus({ focusVisible: true })
    const s = getComputedStyle(open)
    const w = parseFloat(s.outlineWidth) || 0
    const off = parseFloat(s.outlineOffset) || 0
    const grow = s.outlineStyle === 'none' ? 0 : Math.max(0, w + off)
    const r = box(open)
    const ring = { x: r.x - grow, y: r.y - grow, r: r.r + grow, b: r.b + grow }
    if (ring.x < 0 || ring.y < 0 || ring.r > innerWidth || ring.b > innerHeight) out.push('the focus ring leaves the viewport')
    for (let a = open.parentElement; a && a !== document.documentElement; a = a.parentElement) {
      const cs = getComputedStyle(a)
      if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue
      const ar = a.getBoundingClientRect()
      const pad = { x: ar.left + (parseFloat(cs.borderLeftWidth) || 0), y: ar.top + (parseFloat(cs.borderTopWidth) || 0), r: ar.right - (parseFloat(cs.borderRightWidth) || 0), b: ar.bottom - (parseFloat(cs.borderBottomWidth) || 0) }
      if (ring.x < pad.x - 0.5 || ring.y < pad.y - 0.5 || ring.r > pad.r + 0.5 || ring.b > pad.b + 0.5) out.push('the focus ring is clipped by ' + a.tagName.toLowerCase() + '.' + [...a.classList].slice(0, 2).join('.'))
    }
    open.blur()
  }
  return out
})()`

async function pillSetup(what) {
  if (!(await evaluate(START_TIMERS))) throw new Error('setup: not inspected: the timers could not be started through the API')
  try {
    await evaluate('location.reload()')
    await until(`!!document.querySelector('.shell-timer .timer-pill') && !document.querySelector('[aria-busy="true"], .skeleton')`, `the timer pill on ${what}`, 15000)
    const findings = await evaluate(MEASURE)
    if (findings.length > 0) throw new Error(`timer pill on ${what}: ${findings.join('; ')}`)
  } finally {
    await evaluate(CANCEL_TIMERS).catch(() => {})
  }
}

export default {
  order: 340,
  scenarios: [
    { name: 'timer-pill', route: '/plan', start: '/plan', setup: 'timerPillPlan', widths: [375, 390, 1440], rules: ['P1'] },
    { name: 'timer-pill-editor', route: '/recipes/:id/edit', start: '/recipes/:id/edit', setup: 'timerPillEditor', widths: [375, 390, 834], rules: ['P1'] },
  ],
  setups: {
    async timerPillPlan() {
      await pillSetup('/plan')
    },
    async timerPillEditor() {
      await pillSetup('the Recipe editor')
    },
  },
}
