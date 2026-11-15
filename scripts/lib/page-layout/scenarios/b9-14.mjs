// B9-14 (plan section 9; DS-01, SHORT-02, SHORT-07, A11Y-02): the sheet scenarios of P25, P33 and the sheet half of P39.
//   leftover-menu-sheet       Today's Leftover ⋮ opens the Menu sheet (DS-01), at 375 and 390; P25 and P33.
//   sheet-planned-meal        /plan: a Planned Meal sheet, portrait and phone landscape; P25 and P33.
//   sheet-add-member          /settings/members: the Add Member form sheet, portrait and landscape; P25 and P33.
//   sheet-short-landscape     the same Add Member sheet at 667x375 and 844x390 with the safe-area insets; P33.
//   sheet-zoom-400            the same at 375x256 (400 % zoom); P33: the flow fallback keeps the question reachable.
//   focus-ring-room-sheet     the Add Member sheet at 390 and 1440: its first field shows its WHOLE ring (P39; probes/focus-rings.mjs lists it).
// 390x400 (the keyboard height of the chapter) is not in SCENARIO_VIEWPORTS (a shared file): 667x375 and 375x256 stand in for it.
import { byText, evaluate, press, until } from '../helpers.mjs'

const dialogOpen = `!!document.querySelector('dialog.sheet[open]')`
async function openAddMember() {
  await until(`!!document.querySelector('main') && !document.querySelector('[aria-busy="true"], .skeleton')`, 'the Members page')
  await press(byText('main button', 'Add Member'), '"Add Member"')
  await until(dialogOpen, 'the Add Member sheet')
}

export default {
  order: 310,
  scenarios: [
    { name: 'leftover-menu-sheet', route: '/', start: '/', setup: 'leftoverMenuSheet', widths: [375, 390], rules: ['P25', 'P33'] },
    { name: 'sheet-planned-meal', route: '/plan', start: '/plan', setup: 'plannedMealSheet', widths: [390, '844x390-inset'], rules: ['P25', 'P33'] },
    { name: 'sheet-add-member', route: '/settings/members', start: '/settings/members', setup: 'addMemberSheet', widths: [390, 1440], rules: ['P25', 'P33'] },
    { name: 'sheet-short-landscape', route: '/settings/members', start: '/settings/members', setup: 'addMemberSheet', widths: ['667x375', '844x390-inset'], rules: ['P33'] },
    { name: 'sheet-zoom-400', route: '/settings/members', start: '/settings/members', setup: 'addMemberSheet', widths: ['375x256'], rules: ['P33'] },
    { name: 'focus-ring-room-sheet', route: '/settings/members', start: '/settings/members', setup: 'addMemberSheet', widths: [390, 1440], rules: ['P39'] },
  ],
  setups: {
    // The Leftovers to use tile needs a Leftover: the seed (scripts/test/fixtures/page-layout-seed/b9-14.mjs) cooks one. Without it the
    // setup throws and the scenario reports "not inspected" instead of passing on an empty page.
    async leftoverMenuSheet() {
      await until(`!!document.querySelector('main button[aria-label^="Actions for"]')`, 'a Leftover row with its ⋮ ("Actions for <Recipe>") on Today; the b9-14 seed cooks one')
      await press(`document.querySelector('main button[aria-label^="Actions for"]')`, 'the Leftover ⋮')
      await until(dialogOpen, 'the Leftover Menu sheet')
    },
    // A Planned Meal sheet: the first Course row of /plan whose press opens a sheet.
    async plannedMealSheet() {
      await until(`document.querySelectorAll('main .list-row__target').length > 0 && !document.querySelector('[aria-busy="true"], .skeleton')`, 'the Plan rows')
      const n = await evaluate(`Math.min(12, document.querySelectorAll('main .list-row__target').length)`)
      for (let i = 0; i < n; i++) {
        await evaluate(`document.querySelectorAll('main .list-row__target')[${i}]?.click()`)
        if (await until(dialogOpen, 'a sheet', 1500).then(() => true, () => false)) return
      }
      throw new Error('setup: no Plan row opened a Planned Meal sheet')
    },
    async addMemberSheet() {
      await openAddMember()
    },
  },
}
