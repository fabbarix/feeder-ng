// B9-14 (plan section 9; DS-01, SHORT-02, SHORT-07, A11Y-02): the sheet scenarios of P25, P33 and the sheet half of P39.
//   leftover-menu-sheet       Today's Leftover ⋮ opens the Menu sheet (DS-01), at 375 and 390; P25 and P33. Its setup makes the Leftover
//                             and the next b9-14 setup undoes it: Today's default state (the seed) is unchanged for other scenarios.
//   sheet-planned-meal        /plan: a Planned Meal sheet, portrait and phone landscape (844x390); P25 and P33.
//   sheet-add-member          /settings/members: the Add Member form sheet, portrait, with the keyboard up (390x400) and at 1440; P25 and P33.
//   sheet-short-landscape     the same Add Member sheet at 667x375 and 844x390 with the safe-area insets; P33.
//   sheet-zoom-400            the same at 375x256 (400 % zoom); P33: the flow fallback keeps the question reachable.
//   focus-ring-room-sheet     the Add Member sheet at 390 and 1440: its first field shows its WHOLE ring (P39; probes/focus-rings.mjs lists it).
// SHORT-02's sizes: 844x390 (phone landscape) and 390x400 (a 390 px phone with the keyboard up) are SCENARIO_VIEWPORTS keys (B9-14).
import { byText, evaluate, press, until } from '../helpers.mjs'

// P25 judges tap targets: the scenarios that run it emulate touch, so `(pointer: coarse)` holds and the controls' coarse ::after hit
// areas (A11Y-09, B9-16) apply, as B9-16's touch-targets scenario does for P36.
const TOUCH = [
  { method: 'Emulation.setTouchEmulationEnabled', params: { enabled: true, maxTouchPoints: 5 } },
  { method: 'Emulation.setEmitTouchEventsForMouse', params: { enabled: true, configuration: 'mobile' } },
]
const dialogOpen = `!!document.querySelector('dialog.sheet[open]')`
/** The Course leftoverMenuSheet marked Cooked for its Leftover ({ date, mealSlotId, courseId }), until restoreToday undoes it. */
let cookedForLeftover = null
/** Undoes leftoverMenuSheet's Cooked (Undo of Cooked, POST .../reopen: the Leftover goes and the Course is to confirm again). */
async function restoreToday() {
  if (!cookedForLeftover) return
  const c = cookedForLeftover
  cookedForLeftover = null
  const ok = await evaluate(`fetch('/api/plan/${c.date}/${c.mealSlotId}/${c.courseId}/reopen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then((r) => r.ok)`)
  if (!ok) throw new Error(`setup: the Leftover of leftover-menu-sheet (${c.date}/${c.mealSlotId}/${c.courseId}) could not be undone; Today is left changed`)
}
async function openAddMember() {
  await until(`!!document.querySelector('main') && !document.querySelector('[aria-busy="true"], .skeleton')`, 'the Members page')
  await press(byText('main button', 'Add Member'), '"Add Member"')
  await until(dialogOpen, 'the Add Member sheet')
  // w4c: P33 measured the sheet while it was still rising in (the first field cut off, the footer already in view): an intermittent
  // finding under load at 375x256 and 390. Wait until the sheet's animations are done and its box holds still for two frames.
  await until(`(() => { const d = document.querySelector('dialog.sheet[open]'); return !!d && d.getAnimations({ subtree: true }).every((a) => a.playState !== 'running') })()`, 'the Add Member sheet to finish opening')
  await until(`new Promise((ok) => { const d = document.querySelector('dialog.sheet[open]'); const a = JSON.stringify(d.getBoundingClientRect()); requestAnimationFrame(() => requestAnimationFrame(() => ok(JSON.stringify(d.getBoundingClientRect()) === a))) })`, 'the Add Member sheet to hold still')
}

export default {
  order: 310,
  scenarios: [
    { name: 'leftover-menu-sheet', route: '/', start: '/', setup: 'leftoverMenuSheet', widths: [375, 390], emulate: TOUCH, rules: ['P25', 'P33'] },
    { name: 'sheet-planned-meal', route: '/plan', start: '/plan', setup: 'plannedMealSheet', widths: [390, '844x390'], emulate: TOUCH, rules: ['P25', 'P33'] },
    { name: 'sheet-add-member', route: '/settings/members', start: '/settings/members', setup: 'addMemberSheet', widths: [390, '390x400', 1440], emulate: TOUCH, rules: ['P25', 'P33'] },
    { name: 'sheet-short-landscape', route: '/settings/members', start: '/settings/members', setup: 'addMemberSheet', widths: ['667x375', '844x390-inset'], rules: ['P33'] },
    { name: 'sheet-zoom-400', route: '/settings/members', start: '/settings/members', setup: 'addMemberSheet', widths: ['375x256'], rules: ['P33'] },
    { name: 'focus-ring-room-sheet', route: '/settings/members', start: '/settings/members', setup: 'addMemberSheet', widths: [390, 1440], rules: ['P39'] },
  ],
  setups: {
    // The Leftovers to use tile needs a Leftover. The setup makes its own and the next b9-14 setup undoes it (restoreToday), so the
    // seed and Today's default state stay as the other packages' scenarios see them (review ruling 4): the first Course the plan lists
    // as to confirm is marked Cooked with 2 Leftover portions, through the page's own session, unless a Leftover is already there (the
    // second width and the dark pass replay this setup). Without a Leftover the setup throws: "not inspected", never a pass on an
    // empty page.
    async leftoverMenuSheet() {
      await until(`!!document.querySelector('main .bento-grid') && !document.querySelector('[aria-busy="true"], .skeleton')`, 'the Today grid')
      const made = await evaluate(`(async () => {
        const json = async (r) => (r.ok ? r.json() : null)
        const have = await json(await fetch('/api/plan/leftovers'))
        if ((have?.leftovers ?? []).length > 0) return null
        const first = ((await json(await fetch('/api/plan/to-confirm')))?.slots ?? []).find((x) => x.courseId != null)
        if (!first) return null
        const r = await fetch('/api/plan/' + first.date + '/' + first.mealSlotId + '/' + first.courseId + '/cooked', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ leftoverPortions: 2 }) })
        return r.ok ? { date: first.date, mealSlotId: first.mealSlotId, courseId: first.courseId } : null
      })()`)
      if (made) {
        cookedForLeftover = made
        await evaluate('location.reload()')
      }
      await until(`!!document.querySelector('main button[aria-label^="Actions for"]')`, 'a Leftover row with its ⋮ ("Actions for <Recipe>") on Today')
      await press(`document.querySelector('main button[aria-label^="Actions for"]')`, 'the Leftover ⋮')
      await until(dialogOpen, 'the Leftover Menu sheet')
    },
    // A Planned Meal sheet: the first Course row of /plan whose press opens a sheet.
    async plannedMealSheet() {
      await restoreToday()
      await until(`document.querySelectorAll('main .list-row__target').length > 0 && !document.querySelector('[aria-busy="true"], .skeleton')`, 'the Plan rows')
      const n = await evaluate(`Math.min(12, document.querySelectorAll('main .list-row__target').length)`)
      for (let i = 0; i < n; i++) {
        await evaluate(`document.querySelectorAll('main .list-row__target')[${i}]?.click()`)
        if (await until(dialogOpen, 'a sheet', 1500).then(() => true, () => false)) return
      }
      throw new Error('setup: no Plan row opened a Planned Meal sheet')
    },
    async addMemberSheet() {
      await restoreToday()
      await openAddMember()
    },
  },
}
