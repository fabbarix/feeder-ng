// B9-55 (a11y-finish; plan section 9, no rule number of its own): the three screen findings the beta.9 build handed to the finishing package, and the
// order-independence of the receipt scenarios. TEST-AUTHOR scenarios: each setup measures and THROWS on a finding (as B9-25's, B9-40's and B9-45's
// do), so the scenario is "not inspected", a failure, until the screen is fixed.
//   cook-three-timers     Cook Mode with three timers running, 375 and 390 (int2, finding 1): below the rail layout the timer strip is a row of
//                         TimerPills. When it scrolls sideways (scrollWidth over clientWidth) a pill must never be cut at its end with nothing
//                         to say there is more: the strip shows an edge fade (a mask-image on .cook-strip), OR it shows whole pills only (no pill
//                         crosses the strip's end edge, the rest behind "+N"). A strip that fits is clean either way.
//   recipe-timer-pill     /recipes/:id with two timers running, 375 and 390 (int2, finding 2): the floating pill (.shell-timer) covers no chip
//                         of the hero chip line (.recipe-detail__hero .recipe-tags) and no link or button of the page header, at load.
//   receipt-add-sheet-again  the Add... sheet of the receipt review, run AGAIN after every other receipt scenario (int2, finding 3: receipt-add-sheet
//                         and receipt-review-add depended on the order the seed state was left in; a capture against a used server showed no
//                         "Use Kitchen roll 4 pack" offer). The setup is receipt-add-sheet's own; it must hold on a server the receipt scenarios
//                         have already used (scan session, read, Add...).
// The rule lists are P1 only, so the page is also checked for sideways scroll; receipt-add-sheet-again keeps receipt-add-sheet's sheet rules.
import { evaluate, until } from '../helpers.mjs'
import * as helpers from '../helpers.mjs'
import b950 from './b9-50.mjs'

const noSkeleton = `!document.querySelector('[aria-busy="true"], .skeleton')`

const CANCEL_TIMERS = `(async () => {
  const list = await (await fetch('/api/cook/timers', { credentials: 'same-origin' })).json()
  await Promise.all((list.timers || []).map((t) => fetch('/api/cook/timers/' + t.id, { method: 'DELETE', credentials: 'same-origin' })))
  return true
})()`

const START = (labels) => `(async () => {
  const post = (body) => fetch('/api/cook/timers', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const rs = await Promise.all(${JSON.stringify(labels)}.map((label, i) => post({ label, durationSeconds: 1200 + i * 600 })))
  return rs.every((r) => r.ok)
})()`

const MEASURE_STRIP = `(() => {
  const strip = document.querySelector('.cook-strip')
  if (!strip) return ['no timer strip (.cook-strip): Cook Mode shows the rail layout at this width']
  const out = []
  const s = strip.getBoundingClientRect()
  const pills = [...strip.querySelectorAll('.timer-pill')]
  if (pills.length < 3) out.push('the strip shows ' + pills.length + ' pills; the setup started three timers')
  const scrolls = strip.scrollWidth > strip.clientWidth + 1
  const cut = pills.filter((p) => { const r = p.getBoundingClientRect(); return r.right > s.right + 0.5 && r.left < s.right - 0.5 })
  if (scrolls && cut.length) {
    const cs = getComputedStyle(strip)
    const mask = cs.maskImage && cs.maskImage !== 'none' ? cs.maskImage : (cs.webkitMaskImage && cs.webkitMaskImage !== 'none' ? cs.webkitMaskImage : '')
    if (!mask) out.push('the timer strip scrolls sideways and its last pill is cut at the edge (' + (cut[0].getAttribute('aria-label') || cut[0].textContent.trim().slice(0, 30)) + ') with no edge fade (a mask-image on .cook-strip) and no whole-pills-and-"+N" layout')
  }
  return out
})()`

async function cookThreeTimers() {
  const id = helpers.ids.cookRecipeId ?? helpers.ids.recipeId ?? 1
  await evaluate(CANCEL_TIMERS).catch(() => {})
  if (!(await evaluate(START(['Pre-heat the oven', 'Rest the chicken', 'Simmer the stock'])))) throw new Error('setup: not inspected: the three timers could not be started through the API')
  try {
    // open on the first Step so Get ready is not in the way
    await evaluate(`(async () => {
      const view = await (await fetch('/api/cook/recipes/${id}?batches=1', { credentials: 'same-origin' })).json()
      const first = (view.steps || [])[0]
      localStorage.setItem('feeder.cook.resume.recipe:${id}', String(first ? first.index : 0))
      return true
    })()`)
    await evaluate(`location.assign('/cook/recipe/${id}')`)
    await until(`!!document.querySelector('.cook-step__text') && !!document.querySelector('.cook-strip .timer-pill') && ${noSkeleton}`, 'Cook Mode with its timer strip', 15000)
    const findings = await evaluate(MEASURE_STRIP)
    if (findings.length > 0) throw new Error(`Cook Mode timer strip: ${findings.join('; ')}`)
  } finally {
    await evaluate(CANCEL_TIMERS).catch(() => {})
  }
}

const MEASURE_HERO = `(() => {
  const pill = document.querySelector('.shell-timer .timer-pill')
  if (!pill) return ['no timer pill is showing (.shell-timer .timer-pill)']
  const p = pill.getBoundingClientRect()
  const out = []
  const over = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && Math.min(p.right, r.right) - Math.max(p.left, r.left) > 1 && Math.min(p.bottom, r.bottom) - Math.max(p.top, r.top) > 1 }
  const chips = [...document.querySelectorAll('.recipe-detail__hero .recipe-tags > li, .recipe-detail__hero .chip')].filter((e) => getComputedStyle(e).visibility !== 'hidden')
  const covered = chips.filter(over)
  if (covered.length) out.push('the floating timer pill covers ' + covered.length + ' chip(s) of the hero chip line (' + covered.map((c) => c.textContent.trim().slice(0, 18)).slice(0, 3).join(', ') + ')')
  const header = [...document.querySelectorAll('main .page-header a, main .page-header button')].filter(over)
  if (header.length) out.push('the floating timer pill covers a link or button of the page header: ' + (header[0].getAttribute('aria-label') || header[0].textContent.trim().slice(0, 20)))
  return out
})()`

async function recipeTimerPill() {
  await evaluate(CANCEL_TIMERS).catch(() => {})
  if (!(await evaluate(START(['Roast the chicken', 'Rest the chicken'])))) throw new Error('setup: not inspected: the timers could not be started through the API')
  try {
    await evaluate('window.scrollTo(0, 0); location.reload()')
    await until(`!!document.querySelector('.shell-timer .timer-pill') && !!document.querySelector('main .recipe-detail__hero') && ${noSkeleton}`, 'the Recipe page with the timer pill', 15000)
    // fast-checks: the pill can be re-rendered (the timers list refetched after the reload) between the wait above and the
    // measurement; a pill that is missing then is waited for again (up to 3 s), so only a pill that stays away is reported.
    let findings = await evaluate(MEASURE_HERO)
    for (let i = 0; i < 6 && findings.some((f) => f.startsWith('no timer pill')); i++) {
      await helpers.h.sleep(500)
      findings = await evaluate(MEASURE_HERO)
    }
    if (findings.length > 0) throw new Error(`Recipe page with a running timer: ${findings.join('; ')}`)
  } finally {
    await evaluate(CANCEL_TIMERS).catch(() => {})
  }
}

const again = b950.scenarios.find((s) => s.name === 'receipt-add-sheet')

export default {
  order: 550,
  scenarios: [
    { name: 'cook-three-timers', route: '/recipes/:id', start: '/recipes/:id', setup: 'cookThreeTimers', widths: [375, 390], rules: ['P1'] },
    { name: 'recipe-timer-pill', route: '/recipes/:id', start: '/recipes/:id', setup: 'recipeTimerPill', widths: [375, 390], rules: ['P1'] },
    { name: 'receipt-add-sheet-again', route: again.route, start: again.start, setup: 'receiptAddSheetAgain', widths: again.widths, emulate: again.emulate, rules: again.rules },
  ],
  setups: {
    cookThreeTimers,
    recipeTimerPill,
    receiptAddSheetAgain: b950.setups.receiptAddSheet,
  },
}
