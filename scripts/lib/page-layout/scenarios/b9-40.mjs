// B9-40 (PC-03, SHORT-01; plan section 9): the Cook Mode scenarios.
//   cook-step-landscape  a Recipe's Cook Mode in a phone held sideways, 667x375 (the smallest landscape, amendment A1) and 844x390: P34, the Step
//                        text is visible outside the Back and Next side columns at load.
//   cook-step-portrait   the same Cook Mode at 375, 390 and 1440 (a phone and the rail layout): P34.
//   cook-step-photo      the Step with a photo, with a timer running, at 390, 834 and 1440 (PC-03's guard; no rule number, the setup measures and throws on a
//                        finding, as B9-25's timer-pill scenarios do): the photo is at most 40 % of the viewport height; the timer and the held line, when
//                        there are any, intersect the viewport; with Pause focused its outline box lies inside the button's box and the pill's boundary is
//                        not the accent. A Step with no photo in the seed is "not inspected" for the photo part only (the other parts run).
// Cook Mode is /cook/recipe/<id>; the route table has no "recipe" key, so the scenarios start on /recipes/:id and the setup goes to Cook Mode.
import { byText, evaluate, until } from '../helpers.mjs'
import * as helpers from '../helpers.mjs'

const noSkeleton = `!document.querySelector('[aria-busy="true"], .skeleton')`
// The seed's rich Cook Mode Recipe (page-layout-seed/cook.mjs: two Advance Steps, a Passive pre-heat that holds Next, a 50-word Step with a
// photo) when it exists, else the first seed Recipe.
async function openCook() {
  const id = helpers.ids.cookRecipeId ?? helpers.ids.recipeId ?? 1
  // B9-45 (PC-05): Cook Mode opens on Get ready unless the cook is under way; a stored first Step skips it, so the Step is measured.
  // That first Step is the Recipe's first CookStep index (the rich Recipe's Advance Steps come first, so it is not 0); a resume Step
  // an earlier scenario left (the photo one) is replaced by it.
  await evaluate(`(async () => {
    const view = await (await fetch('/api/cook/recipes/${id}?batches=1', { credentials: 'same-origin' })).json()
    const first = (view.steps || [])[0]
    localStorage.setItem('feeder.cook.resume.recipe:${id}', String(first ? first.index : 0))
    return true
  })()`)
  await evaluate(`location.assign('/cook/recipe/${id}')`)
  await until(`!!document.querySelector('.cook-step__text') && ${noSkeleton}`, 'the Cook Mode Step text', 15000)
  return id
}

// The seed's Recipes open on an Active Step: the timer is the first Passive Step's (the server refuses a Step timer on an Active one).
const START_TIMER = (id) => `(async () => {
  const view = await (await fetch('/api/cook/recipes/${id}?batches=1', { credentials: 'same-origin' })).json()
  const step = (view.steps || []).find((s) => s.kind === 'passive')
  const body = step ? { scope: 'recipe:${id}', step: step.index } : { label: 'Pre-heat the oven', durationSeconds: 900 }
  const r = await fetch('/api/cook/timers', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  return r.ok
})()`
// Reopen Cook Mode on the first Step with a photo (lib/resume: feeder.cook.resume.<scope> = the CookStep index); a Step held by the
// running pre-heat cannot be reached with Next. Nothing when no Step has a photo.
const RESUME_AT_PHOTO = (id) => `(async () => {
  const view = await (await fetch('/api/cook/recipes/${id}?batches=1', { credentials: 'same-origin' })).json()
  const step = (view.steps || []).find((s) => s.imageUrl)
  if (step) localStorage.setItem('feeder.cook.resume.recipe:${id}', String(step.index))
  return !!step
})()`
const CANCEL_TIMERS = `(async () => {
  const list = await (await fetch('/api/cook/timers', { credentials: 'same-origin' })).json()
  await Promise.all((list.timers || []).map((t) => fetch('/api/cook/timers/' + t.id, { method: 'DELETE', credentials: 'same-origin' })))
  return true
})()`

const MEASURE_PHOTO = `(() => {
  const out = []
  const box = (e) => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, r: r.right, b: r.bottom, h: r.height } }
  const inView = (b) => b.r > 0 && b.b > 0 && b.x < innerWidth && b.y < innerHeight
  const px = (n) => String(Math.round(n * 10) / 10)
  const img = document.querySelector('.cook-step__image')
  if (img && img.getBoundingClientRect().height > 0 && box(img).h > innerHeight * 0.4 + 0.5) out.push('the Step photo is ' + px(box(img).h) + ' px high, over 40 % of the ' + innerHeight + ' px viewport')
  const pills = [...document.querySelectorAll('.cook-strip .timer-pill, .cook-rail .timer-tile')]
  if (!pills.length) out.push('no timer is showing in the strip or the rail')
  for (const p of pills) if (!inView(box(p))) out.push('a timer is outside the viewport at load: ' + (p.getAttribute('aria-label') || ''))
  const held = document.querySelector('.cook-nav__held')
  if (held && held.textContent.trim() && !inView(box(held))) out.push('the held line is outside the viewport at load')
  const pill = document.querySelector('.cook-strip .timer-pill')
  const pause = pill && pill.querySelector('.timer-pill__toggle')
  if (pause) {
    pause.focus({ focusVisible: true })
    const s = getComputedStyle(pause)
    const w = parseFloat(s.outlineWidth) || 0
    const off = parseFloat(s.outlineOffset) || 0
    if (s.outlineStyle !== 'none' && off > -w) out.push('the focused Pause ring is not inside its own box (outline-offset ' + off + ' px, width ' + w + ' px)')
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--color-accent').trim()
    const shadow = getComputedStyle(pill).boxShadow
    const probe = document.createElement('span')
    probe.style.color = accent
    document.body.append(probe)
    const accentRgb = getComputedStyle(probe).color
    probe.remove()
    if (accentRgb && shadow.includes(accentRgb)) out.push('the pill keeps its accent boundary while Pause has focus (one accent ring at a time)')
    pause.blur()
  }
  return out
})()`

async function photoSetup() {
  const id = await openCook()
  if (!(await evaluate(START_TIMER(id)))) throw new Error('setup: not inspected: the timer could not be started through the API')
  try {
    await evaluate(RESUME_AT_PHOTO(id))
    await evaluate('location.reload()')
    await until(`!!document.querySelector('.cook-step__text') && !!document.querySelector('.timer-pill, .timer-tile') && ${noSkeleton}`, 'Cook Mode with a timer', 15000)
    // Walk to the first Step with a photo; stay on the first Step when there is none.
    for (let n = 0; n < 12; n++) {
      if (await evaluate(`!!document.querySelector('.cook-step__image')`)) break
      const more = await evaluate(`(() => { const b = ${byText('.cook-nav__tile', 'Next')}; if (!b || b.disabled) return false; b.click(); return true })()`)
      if (!more) break
      await new Promise((r) => setTimeout(r, 250))
    }
    const findings = await evaluate(MEASURE_PHOTO)
    if (findings.length > 0) throw new Error(`Cook Mode Step: ${findings.join('; ')}`)
  } finally {
    await evaluate(CANCEL_TIMERS).catch(() => {})
  }
}

export default {
  order: 350,
  scenarios: [
    { name: 'cook-step-landscape', route: '/recipes/:id', start: '/recipes/:id', setup: 'cookStepOpen', widths: ['667x375', '844x390'], rules: ['P34'] },
    { name: 'cook-step-portrait', route: '/recipes/:id', start: '/recipes/:id', setup: 'cookStepOpen', widths: [375, 390, 1440], rules: ['P34'] },
    { name: 'cook-step-photo', route: '/recipes/:id', start: '/recipes/:id', setup: 'cookStepPhoto', widths: [390, 834, 1440], rules: ['P1'] },
  ],
  setups: {
    async cookStepOpen() {
      await openCook()
    },
    async cookStepPhoto() {
      await photoSetup()
    },
  },
}
