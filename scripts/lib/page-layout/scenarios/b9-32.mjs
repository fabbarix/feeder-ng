// B9-32 (plan section 9; PC-06, PC-07, PC-11 option B, PC-16 (9), A11Y-08, A11Y-09): the Plan's week grid, its chips and its Couldn't plan tile.
// TEST-AUTHOR scenarios: the setups ASSERT what the chapters' guards name and throw when it does not hold, so a scenario is "not inspected"
// (a failure) until the screens are built. They also bring the page to the state the probes measure. P38 (rules/P38-unique-names.mjs) is
// reported with the layout rules listed in each scenario's `rules`.
//   plan-grid      /plan at 375, 390, 834 and 1440 (PC-11; 820 and 1920 are not in SCENARIO_VIEWPORTS yet, see the hand-back) (PC-11, PC-06, PC-16 9, A11Y-08, A11Y-09):
//                  - the container (.plan-grid) has min(4, floor((width + 12) / (21 rem + 12))) columns and every row of day tiles sums to 12 tracks
//                    (their grid-column spans), with no hole: the last tile of a row ends at the container's end (PC 2: no lone day beside an empty track);
//                  - no .plan-day is wider than 3 x the narrowest unless it has the whole row (data-row) and then its Meal Slots lie side by side;
//                  - no chip of a row is cut unless it is the only chip of its line (PC-06), and a row with no chips has no chip line (PC-16 9);
//                  - the icons of a row are an IconSet with at least 8 px between them (A11Y-09) and Pin is a toggle (aria-pressed, A11Y-08);
//                  - Today's tile is the first day tile.
//   plan-couldnt   /plan at 375, 390 and 1440 with Dessert unplannable (the Dessert Recipe is archived and the plan regenerated; undone at the end):
//                  the Couldn't plan tile is ONE region, the first .plan-day starts inside the first viewport (PC-07), the unfilled Dessert rows are
//                  titled "Not planned" and no more than 3 other rows share a title, "Mark Recipes as Dessert" opens the sheet ON the Plan.
import { evaluate, js, press, until } from '../helpers.mjs'

const PLAN_READY = `!!document.querySelector('main .plan article') && !document.querySelector('[aria-busy="true"], .skeleton')`
const GAP = 12
const REM = 16

/** What the page shows, appended to a failed setup's message so a "did not show" says what did show instead. */
const SNAPSHOT = `JSON.stringify({
  path: location.pathname,
  grid: (() => { const g = document.querySelector('.plan-grid'); return g ? { columns: g.getAttribute('data-columns'), w: Math.round(g.getBoundingClientRect().width) } : null })(),
  days: [...document.querySelectorAll('.plan-day')].slice(0, 8).map((d) => ({ title: d.querySelector('h2')?.textContent, col: d.style.gridColumn, row: d.getAttribute('data-row') })),
  regions: [...document.querySelectorAll('main [role="region"], main section[aria-label]')].map((e) => e.getAttribute('aria-label')),
})`
async function withSnapshot(run) {
  try {
    await run()
  } catch (e) {
    const seen = await evaluate(SNAPSHOT).catch(() => '?')
    throw new Error(`${e.message} [${seen}]`)
  }
}

async function planGrid() {
  await until(PLAN_READY, 'the Plan')
  await withSnapshot(async () => {
    const finding = await evaluate(`(() => {
      const grid = document.querySelector('.plan-grid')
      if (!grid) return 'there is no .plan-grid container around the week (PC-11)'
      const width = grid.getBoundingClientRect().width
      const want = Math.max(1, Math.min(4, Math.floor((width + ${GAP}) / (21 * ${REM} + ${GAP}))))
      if (Number(grid.getAttribute('data-columns')) !== want) return 'a container of ' + Math.round(width) + ' px should have ' + want + ' column(s); data-columns is ' + grid.getAttribute('data-columns')
      const days = [...grid.querySelectorAll('.plan-day')]
      if (days.length === 0) return 'no .plan-day in the grid'
      // The first tile is today's (the week starts today).
      if (!days[0].hasAttribute('data-today')) return 'the first day tile is not today'
      const box = grid.getBoundingClientRect()
      // Rows: tiles that share a top. Their spans sum to 12, and the last of the row ends where the container ends.
      const rows = []
      for (const d of days) {
        const r = d.getBoundingClientRect()
        const row = rows.find((x) => Math.abs(x.top - r.top) < 4)
        if (row) row.tiles.push({ d, r }); else rows.push({ top: r.top, tiles: [{ d, r }] })
      }
      for (const row of rows) {
        const sum = row.tiles.reduce((n, t) => n + (Number(/span (\\d+)/.exec(t.d.style.gridColumn)?.[1]) || 0), 0)
        if (sum !== 12) return 'a row of ' + row.tiles.length + ' day(s) at y ' + Math.round(row.top) + ' spans ' + sum + ' tracks, not 12 (' + row.tiles.map((t) => t.d.style.gridColumn).join(', ') + ')'
        const end = Math.max(...row.tiles.map((t) => t.r.right))
        if (box.right - end > 2) return 'a row at y ' + Math.round(row.top) + ' ends ' + Math.round(box.right - end) + ' px short of the grid: a day sits beside an empty track'
      }
      // No tile is wider than 3 x the narrowest, unless it has the whole row and lays its Meal Slots side by side.
      const widths = days.map((d) => d.getBoundingClientRect().width)
      const narrowest = Math.min(...widths)
      for (const d of days) {
        const w = d.getBoundingClientRect().width
        if (w <= 3 * narrowest + 1) continue
        if (d.getAttribute('data-row') !== 'true') return d.querySelector('h2')?.textContent + ' is ' + Math.round(w) + ' px wide (more than 3 x ' + Math.round(narrowest) + ') and does not have data-row'
      }
      // A day with the whole row: its Meal Slots lie side by side (equal tops).
      for (const d of days.filter((x) => x.getAttribute('data-row') === 'true')) {
        const meals = [...d.querySelectorAll('.plan-meal')]
        if (meals.length < 2) continue
        const tops = meals.map((m) => Math.round(m.getBoundingClientRect().top))
        if (new Set(tops).size !== 1) return d.querySelector('h2')?.textContent + ' has the whole row but its Meal Slots are stacked (tops ' + tops.join(', ') + ')'
      }
      return ''
    })()`)
    if (finding) throw new Error(`setup: not inspected: ${finding}`)
  })
  await withSnapshot(async () => {
    const finding = await evaluate(`(() => {
      // PC-06: a chip is whole, or the only chip of its line.
      for (const line of document.querySelectorAll('.plan-row__chips')) {
        const chips = [...line.querySelectorAll('.chip:not([data-kind="count"])')]
        for (const label of line.querySelectorAll('.chip__label')) {
          if (label.scrollWidth > label.clientWidth + 1 && chips.length > 1) return 'a chip is cut ("' + label.textContent.trim().slice(0, 30) + '") beside another chip (PC-06)'
        }
        if (line.children.length === 0) return 'an empty chip line (PC-16 item 9)'
      }
      // A Leftover chip is never cut.
      for (const c of document.querySelectorAll('.plan-row__chips .chip[data-status="leftover"] .chip__label')) {
        if (c.scrollWidth > c.clientWidth + 1 && c.closest('.plan-row__chips').querySelectorAll('.chip').length > 1) return 'a Leftover chip is cut'
      }
      // A11Y-09: Swap and Pin are an IconSet; at least 8 px between the two (a fine pointer) so their rings never touch.
      const coarse = matchMedia('(pointer: coarse)').matches
      for (const set of document.querySelectorAll('.plan-meal__courses .icon-set')) {
        const bs = [...set.querySelectorAll('button')]
        for (let i = 1; i < bs.length; i++) {
          const gap = bs[i].getBoundingClientRect().left - bs[i - 1].getBoundingClientRect().right
          if (gap < (coarse ? 11.5 : 7.5)) return 'two icons of a row are ' + Math.round(gap) + ' px apart (A11Y-09: 8 px on a fine pointer, 12 on a coarse one)'
        }
      }
      if (document.querySelectorAll('.plan-meal__courses .icon-set').length === 0) return 'no .icon-set in the Course rows (A11Y-09)'
      if (document.querySelector('.plan-meal__courses button[aria-label^="Unpin"]')) return 'a row still has a separate Unpin button (A11Y-08: Pin is one toggle)'
      for (const b of document.querySelectorAll('.plan-meal__courses button[aria-label^="Pin "]')) {
        if (!b.hasAttribute('aria-pressed')) return 'a Pin button has no aria-pressed (A11Y-08)'
      }
      // A11Y-08: Swap and Pin name their Recipe, day and Meal Slot.
      const swap = document.querySelector('.plan-meal__courses button[aria-label^="Swap"]')
      if (swap && !/^Swap .+, [A-Z][a-z]{2} \\d+ .+/.test(swap.getAttribute('aria-label'))) return 'Swap is named "' + swap.getAttribute('aria-label') + '", not "Swap <Recipe>, <Day> <Meal Slot>" (A11Y-08)'
      if (document.querySelector('.plan-meal__courses button[aria-label="Swap"], .plan-meal__courses button[aria-label="Pin"]')) return 'a bare "Swap" or "Pin" button is left (A11Y-08)'
      return ''
    })()`)
    if (finding) throw new Error(`setup: not inspected: ${finding}`)
  })
}

/** The Dessert Recipes (course filter), archived for the scenario and un-archived at the end. */
let archived = []
async function dessertRecipes() {
  return evaluate(`(async () => {
    const courses = await (await fetch('/api/courses')).json()
    const list = Array.isArray(courses) ? courses : (courses.courses ?? [])
    const dessert = list.find((c) => c.name === 'Dessert')
    if (!dessert) return { dessert: null, ids: [] }
    const recipes = await (await fetch('/api/recipes?course=' + dessert.id)).json()
    return { dessert: dessert.id, ids: recipes.map((r) => r.id) }
  })()`)
}
const post = (path) => evaluate(`fetch(${js(path)}, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then((r) => r.ok)`)

async function restoreDessert() {
  const todo = archived
  archived = []
  for (const id of todo) await post(`/api/recipes/${id}/unarchive`)
  if (todo.length) await post('/api/plan/regenerate')
}

async function planCouldnt() {
  await restoreDessert()
  await until(PLAN_READY, 'the Plan')
  const { dessert, ids } = await dessertRecipes()
  if (!dessert) throw new Error('setup: the seed has no Dessert Course (seed/plan-undo.mjs adds it)')
  for (const id of ids) if (await post(`/api/recipes/${id}/archive`)) archived.push(id)
  await post('/api/plan/regenerate')
  await evaluate('location.reload()')
  await until(PLAN_READY, 'the Plan after regenerating without Dessert Recipes')
  try {
    await withSnapshot(async () => {
      const finding = await evaluate(`(() => {
        const regions = [...document.querySelectorAll('main [role="region"], main section[aria-label]')].filter((e) => e.getAttribute('aria-label') === "Couldn't plan")
        if (regions.length !== 1) return 'Couldn\\'t plan is ' + regions.length + ' regions, not one compact tile (PC-07)'
        const first = document.querySelector('.plan-day')
        if (!first) return 'no day tile'
        if (first.getBoundingClientRect().top >= innerHeight) return 'the first day tile starts at y ' + Math.round(first.getBoundingClientRect().top) + ', below the first viewport (' + innerHeight + ') (PC-07)'
        const unfilled = [...document.querySelectorAll('.plan-day .list-row[data-unfilled]')]
        if (unfilled.length === 0) return 'no unfilled Dessert row'
        const bad = unfilled.find((r) => r.querySelector('.list-row__title')?.textContent.trim() !== 'Not planned')
        if (bad) return 'an unfilled row is titled "' + bad.querySelector('.list-row__title')?.textContent.trim() + '", not "Not planned"'
        // The same sentence is never the title of many rows (unfilled rows say "Not planned" and name the cause in a chip).
        const titles = new Map()
        for (const r of document.querySelectorAll('.plan-day .list-row:not([data-unfilled]) .list-row__title')) titles.set(r.textContent.trim(), (titles.get(r.textContent.trim()) ?? 0) + 1)
        const repeated = [...titles].find(([, n]) => n > 3)
        if (repeated) return 'more than 3 rows share the title "' + repeated[0] + '" (' + repeated[1] + ')'
        const chips = unfilled.map((r) => r.querySelector('.plan-row__chips .chip')?.textContent.trim())
        if (chips.some((c) => !c)) return 'an unfilled row has no cause chip'
        return ''
      })()`)
      if (finding) throw new Error(`setup: not inspected: ${finding}`)
      // The fix stays on the Plan: the sheet opens, the route does not change.
      await press(`[...document.querySelectorAll('main button')].find((b) => b.getAttribute('aria-label') === 'Mark Recipes as Dessert' || b.textContent.trim() === 'Mark Recipes as Dessert')`, '"Mark Recipes as Dessert"')
      await until(`!!document.querySelector('dialog[open]') && /Mark Recipes as Dessert/.test(document.querySelector('dialog[open]').textContent) && location.pathname === '/plan'`, 'the Mark Recipes sheet on the Plan')
      await press(`[...document.querySelectorAll('dialog[open] button')].find((b) => b.textContent.trim() === 'Cancel')`, 'Cancel')
      await until(`!document.querySelector('dialog[open]')`, 'the sheet to close')
    })
  } finally {
    await restoreDessert()
  }
}

export default {
  order: 332,
  scenarios: [
    { name: 'plan-grid', route: '/plan', start: '/plan', setup: 'planGrid', widths: [375, 390, 834, 1440], rules: ['P1', 'P3', 'P13', 'P14', 'P16', 'P17', 'P18', 'P38'] },
    { name: 'plan-couldnt', route: '/plan', start: '/plan', setup: 'planCouldnt', widths: [375, 390, 1440], rules: ['P1', 'P13', 'P14', 'P38'] },
  ],
  setups: { planGrid, planCouldnt },
}
