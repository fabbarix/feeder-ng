// B9-46 (plan section 9; PC-08, SET-16): the Away on the Plan, in its sheet, in Who's eating and on the Members page.
// TEST-AUTHOR scenarios: each setup ASSERTS what the chapters' guards name and throws when it does not hold, so the scenario is "not
// inspected" (a failure) until the Away UI is built; the rules then measure what is open. The setups make their own data through the
// API (an Away of the first Member, tomorrow and the day after, whole days; a 422 `overlap` on a re-run is fine).
//   plan-away             /plan, 375, 390 and 1440: a whole-day Away is ONE line under the day's name (`.plan-day__away`, never cut, at most two text lines (ruling 7), a 44 px
//                         button named with the day); a part-day label is in the Meal Slot's header. P13, P38 (unique button names).
//   away-sheet            /plan, 375, 390, 667x375 and 1440: the Away sheet from a Meal Slot ⋮ ("Someone is away…") with a Member chosen. Context
//                         line "Ben · from …", no Close and a Cancel, the footer one row, the From and Through values on one line (no wrap),
//                         First day and Last day side by side from 600 px and stacked below. P25, P29, P30, P33.
//   away-sheet-open       /plan, 390 and 1440: the same with "What changes" open: its list has only R-E rows (no free-text li) and no
//                         row wraps its state. P25, P33.
//   whos-eating-away      /plan, 390 and 667x375: Who's eating on a day the Away covers: the away row, a switch named "<Name> eats here
//                         anyway", the "Add an Away" button, the footer one row. P25, P29, P33.
//   member-away           /settings/members, 375, 390 and 1440: the info line "Away …" on the Member's row, and the Member sheet's Away
//                         section: rows (R-E) that open the sheet, "Add an Away"; one Cancel and no Close. P31, P23.
import { byText, evaluate, js, press, until } from '../helpers.mjs'

const TOUCH = [
  { method: 'Emulation.setTouchEmulationEnabled', params: { enabled: true, maxTouchPoints: 5 } },
  { method: 'Emulation.setEmitTouchEventsForMouse', params: { enabled: true, configuration: 'mobile' } },
]
const DIALOG = `document.querySelector('dialog.sheet[open]:modal')`
const PLAN_READY = `document.querySelectorAll('main .list-row__target').length > 0 && !document.querySelector('[aria-busy="true"], .skeleton')`
const named = (root, text) => `[...${root}.querySelectorAll('button, [role="menuitem"], [role="radio"], [role="switch"]')].find((e) => (e.getAttribute('aria-label') || e.textContent).trim() === ${js(text)})`

const SNAPSHOT = `JSON.stringify({
  dialogs: [...document.querySelectorAll('dialog[open]')].map((d) => d.innerText.replace(/\\s+/g, ' ').slice(0, 240)),
  footer: [...document.querySelectorAll('dialog[open] .sheet__footer button')].map((b) => b.getAttribute('aria-label') || b.textContent.trim()),
  menu: [...document.querySelectorAll('[role="menuitem"]')].map((e) => e.textContent.trim()),
  away: [...document.querySelectorAll('.plan-day__away')].map((e) => e.textContent.trim()),
})`
async function withSnapshot(run) {
  try {
    await run()
  } catch (e) {
    throw new Error(`${e.message} [${await evaluate(SNAPSHOT).catch(() => '?')}]`)
  }
}
const closeSheets = async () => {
  for (let i = 0; i < 3 && (await evaluate(`!!${DIALOG}`)); i++) {
    await evaluate(`(() => { const d = ${DIALOG}; const b = d && [...d.querySelectorAll('button')].find((x) => /^(Cancel|Keep it)$/.test(x.textContent.trim()) || x.getAttribute('aria-label') === 'Close'); b?.click() })()`)
    await new Promise((r) => setTimeout(r, 250))
  }
}

/** Makes (once) an Away of the first Member for tomorrow and the day after, whole days; returns the Member's name. A repeat run gets a 422 and keeps the first. */
async function seedAway() {
  return evaluate(`(async () => {
    const members = await (await fetch('/api/members')).json()
    const view = await (await fetch('/api/plan')).json()
    const add = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
    const m = members[0]
    if (!m) return ''
    await fetch('/api/members/' + m.id + '/away', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ from: add(view.today, 1), through: add(view.today, 2) }) })
    return m.name
  })()`)
}

/** Waits for the Plan to show the Away line, and returns the Member's name. */
async function planWithAway() {
  const name = await seedAway()
  if (!name) throw new Error('setup: the seed has no Member')
  await evaluate(`location.reload()`)
  await until(PLAN_READY, 'the Plan rows', 20000)
  await until(`!!document.querySelector('.plan-day__away')`, 'a day tile with an Away line (.plan-day__away)', 12000)
  return name
}

/** Opens the Away sheet from the first Plan slot ⋮ that offers "Someone is away…" and chooses the first Who pill. */
async function openAwaySheet() {
  await until(PLAN_READY, 'the Plan rows', 20000)
  const menus = await evaluate(`document.querySelectorAll('main button[aria-label^="More for "][aria-haspopup="menu"]').length`)
  for (let i = 0; i < menus; i++) {
    await evaluate(`document.querySelectorAll('main button[aria-label^="More for "][aria-haspopup="menu"]')[${i}]?.click()`)
    const has = await until(`!!(${named('document', 'Someone is away…')})`, 'the "Someone is away…" item', 1200).then(() => true, () => false)
    if (has) {
      await press(named('document', 'Someone is away…'), 'Someone is away… in the slot ⋮')
      await until(`!!${DIALOG}?.querySelector('[role="radiogroup"]')`, 'the Away sheet with its Who pills', 8000)
      await evaluate(`${DIALOG}.querySelector('[role="radiogroup"] [role="radio"]').click()`)
      await until(`!!(${named(DIALOG, 'Save Away')}) && !${named(DIALOG, 'Save Away')}.disabled`, 'Save Away enabled once a Member is chosen', 4000)
      return
    }
    await evaluate(`document.querySelectorAll('main button[aria-label^="More for "][aria-haspopup="menu"]')[${i}]?.click()`)
  }
  throw new Error('setup: no slot ⋮ offered "Someone is away…"')
}

/** The guards of the sheet's chrome, as the chapter words them. Returns '' or what is wrong. */
const assertSheetJs = `(() => {
  const d = ${DIALOG}
  if (!d) return 'no open sheet'
  const title = d.querySelector('.sheet__title')?.textContent.trim()
  if (title !== 'Someone is away') return 'the title is "' + title + '", not "Someone is away"'
  const ctx = d.querySelector('.sheet__context')?.textContent.trim() ?? ''
  if (!/ · from [A-Z][a-z]{2} \\d{1,2} /.test(ctx)) return 'the context line is "' + ctx + '", not "<Member> · from Tue 17 Dinner"'
  if (/\\d{4}-\\d{2}-\\d{2}/.test(d.innerText)) return 'an ISO date shows in the sheet'
  if (d.querySelector('input[type="date"]')) return 'a native date input'
  if ([...d.querySelectorAll('button')].some((b) => b.getAttribute('aria-label') === 'Close')) return 'a Close next to the footer\\'s Cancel'
  const foot = [...d.querySelectorAll('.sheet__footer button')].filter((b) => b.getClientRects().length > 0)
  if (!foot.some((b) => b.textContent.trim() === 'Cancel')) return 'no Cancel in the footer'
  const tops = foot.map((b) => Math.round(b.getBoundingClientRect().top))
  if (Math.max(...tops) - Math.min(...tops) > 4) return 'the footer is not one row: tops ' + tops.join(',')
  for (const label of ['From', 'Through']) {
    const c = [...d.querySelectorAll('[role="combobox"]')].find((e) => (e.getAttribute('aria-label') || '').startsWith(label) || [...(e.labels ?? [])].some((l) => l.textContent.trim().startsWith(label)) || e.closest('.ui-field, .field')?.textContent.trim().startsWith(label) || (e.getAttribute('aria-labelledby') || '').split(' ').some((id) => document.getElementById(id)?.textContent.trim().startsWith(label)))
    if (!c) return 'no ' + label + ' select'
    const line = parseFloat(getComputedStyle(c).lineHeight) || 20
    if (c.getBoundingClientRect().height > line * 2.6) return label + ' wraps: ' + c.getBoundingClientRect().height + ' px tall'
  }
  // A field's button is named by its label (aria-labelledby: the shared DateField), by aria-label, or by its text.
  const nameOf = (b) => b.getAttribute('aria-label') || (b.getAttribute('aria-labelledby') || '').split(' ').map((id) => document.getElementById(id)?.textContent ?? '').join(' ').trim() || b.textContent
  const first = [...d.querySelectorAll('button')].find((b) => nameOf(b).includes('First day'))
  const last = [...d.querySelectorAll('button')].find((b) => nameOf(b).includes('Last day'))
  if (!first || !last) return 'First day or Last day is missing'
  const sideBySide = Math.abs(first.getBoundingClientRect().top - last.getBoundingClientRect().top) < 6
  if (window.innerWidth >= 600 && !sideBySide) return 'First day and Last day are not side by side at ' + window.innerWidth + ' px'
  if (window.innerWidth < 600 && sideBySide) return 'First day and Last day are side by side below 600 px'
  return ''
})()`
async function assertSheet() {
  const why = await evaluate(assertSheetJs)
  if (why) throw new Error(`setup: ${why}`)
}

export default {
  order: 346,
  scenarios: [
    { name: 'plan-away', route: '/plan', start: '/plan', setup: 'planAway', widths: [375, 390, 1440], rules: ['P13', 'P38'] },
    { name: 'away-sheet', route: '/plan', start: '/plan', setup: 'awaySheet', widths: [375, 390, '667x375', 1440], emulate: TOUCH, rules: ['P25', 'P29', 'P30', 'P33'] },
    { name: 'away-sheet-open', route: '/plan', start: '/plan', setup: 'awaySheetOpen', widths: [390, 1440], emulate: TOUCH, rules: ['P25', 'P33'] },
    { name: 'whos-eating-away', route: '/plan', start: '/plan', setup: 'whosEatingAway', widths: [390, '667x375'], emulate: TOUCH, rules: ['P25', 'P29', 'P33'] },
    { name: 'member-away', route: '/settings/members', start: '/settings/members', setup: 'memberAway', widths: [375, 390, 1440], rules: ['P31', 'P23'] },
  ],
  setups: {
    async planAway() {
      await withSnapshot(async () => {
        const name = await planWithAway()
        const why = await evaluate(`(() => {
          const lines = [...document.querySelectorAll('.plan-day__away')]
          for (const l of lines) {
            if (l.tagName !== 'BUTTON') return 'an Away line is a ' + l.tagName + ', not a button'
            const r = l.getBoundingClientRect()
            if (r.height < 43.5) return 'an Away line is ' + r.height + ' px tall (a 44 px target)'
            const line = parseFloat(getComputedStyle(l).lineHeight) || 20
            // Main-session ruling 7: the line never cuts; at 375 it may wrap to a second line, never a third.
            const text = l.querySelector('.plan-day__away-text') ?? l
            if (text.getBoundingClientRect().height > line * 2.6) return 'the Away line "' + l.textContent.trim() + '" takes more than two lines'
            if (text.scrollWidth > text.clientWidth + 1 || l.scrollWidth > l.clientWidth + 1) return 'the Away line "' + l.textContent.trim() + '" is cut'
            if (!/ away all day/.test(l.textContent)) return 'the line says "' + l.textContent.trim() + '"'
            const tile = l.closest('article')
            const title = tile?.querySelector('.plan-day__title')
            if (!title || title.getBoundingClientRect().bottom > r.top + 1) return 'the Away line is not under the day name'
            const name = l.getAttribute('aria-label') || ''
            if (!name.startsWith(l.textContent.trim())) return 'the line is named "' + name + '", which does not start with its text'
          }
          const names = lines.map((l) => l.getAttribute('aria-label'))
          if (new Set(names).size !== names.length) return 'two Away lines share the name ' + names[0]
          return ''
        })()`)
        if (why) throw new Error(`setup: ${why} (Member ${name})`)
      })
    },
    async awaySheet() {
      await withSnapshot(async () => {
        await planWithAway()
        await openAwaySheet()
        await assertSheet()
      })
    },
    async awaySheetOpen() {
      await withSnapshot(async () => {
        await planWithAway()
        await openAwaySheet()
        // Ruling 1 (main session): What changes is the shared ui Disclosure (its toggle is a button with aria-expanded), not a <details>.
        const TOGGLE = `${DIALOG}.querySelector('[data-disclosure] .disclosure__button')`
        await until(`!!${TOGGLE} && !${DIALOG}.querySelector('[data-disclosure]').closest('[aria-busy="true"]')`, 'the What changes disclosure', 8000)
        await evaluate(`${TOGGLE}.click()`)
        await until(`${TOGGLE}?.getAttribute('aria-expanded') === 'true'`, 'the disclosure open', 2000)
        const why = await evaluate(`(() => {
          const d = ${DIALOG}.querySelector('[data-disclosure]')
          if (!d.querySelector('.detail-row')) return 'no R-E rows in the opened disclosure'
          if ([...d.querySelectorAll('li')].some((li) => !li.classList.contains('detail-row'))) return 'a free-text li in the disclosure (R-E rows only)'
          for (const s of d.querySelectorAll('.detail-row__state')) { const r = s.getBoundingClientRect(); const line = parseFloat(getComputedStyle(s).lineHeight) || 20; if (r.height > line * 1.6) return 'a row state wraps: ' + s.textContent.trim() }
          return ''
        })()`)
        if (why) throw new Error(`setup: ${why}`)
      })
    },
    async whosEatingAway() {
      await withSnapshot(async () => {
        await planWithAway()
        // A slot on a day the Away covers is in a tile with an Away line; its ⋮ has Who's eating.
        const opened = await evaluate(`(() => {
          const tile = document.querySelector('.plan-day__away')?.closest('article')
          const menu = tile?.querySelector('button[aria-label^="More for "][aria-haspopup="menu"]')
          menu?.click()
          return !!menu
        })()`)
        if (!opened) throw new Error('setup: no ⋮ in the tile of the day with an Away')
        await until(`!!(${named('document', "Who's eating")})`, "the Who's eating item", 4000)
        await press(named('document', "Who's eating"), "Who's eating in the slot ⋮")
        await until(`(${DIALOG}?.querySelector('.sheet__title')?.textContent.trim() === "Who's eating") && !!${DIALOG}.querySelector('[role="switch"]')`, "Who's eating with an away row", 8000)
        const why = await evaluate(`(() => {
          const d = ${DIALOG}
          const sw = [...d.querySelectorAll('[role="switch"]')].find((s) => /eats here anyway$/.test(s.getAttribute('aria-label') || s.closest('label')?.textContent.trim() || ''))
          if (!sw) return 'no switch named "<Name> eats here anyway"'
          if (!/Away /.test(sw.closest('li')?.textContent ?? '')) return 'the away row does not say "Away …"'
          if (![...d.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Add an Away')) return 'no "Add an Away" button'
          const foot = [...d.querySelectorAll('.sheet__footer button')].filter((b) => b.getClientRects().length > 0)
          const tops = foot.map((b) => Math.round(b.getBoundingClientRect().top))
          if (Math.max(...tops) - Math.min(...tops) > 4) return 'the footer is not one row'
          return ''
        })()`)
        if (why) throw new Error(`setup: ${why}`)
      })
    },
    async memberAway() {
      await withSnapshot(async () => {
        const name = await seedAway()
        if (!name) throw new Error('setup: the seed has no Member')
        await evaluate(`location.reload()`)
        await until(`document.querySelectorAll('main .list-row').length > 0 && !document.querySelector('[aria-busy="true"], .skeleton')`, 'the Members list', 20000)
        await until(`[...document.querySelectorAll('main .list-row__meta[data-status="info"]')].some((m) => /^Away /.test(m.textContent.trim()))`, 'a Member row with the info line "Away …"', 12000)
        // The Member's row is named "<Name>, Away …"; opening it shows the Away section.
        const row = await evaluate(`(() => { const t = [...document.querySelectorAll('main .list-row__target')].find((b) => /, Away /.test(b.getAttribute('aria-label') || '')); if (!t) return ''; t.click(); return t.getAttribute('aria-label') })()`)
        if (!row) throw new Error('setup: no Member row named "<Name>, Away …"')
        await until(`!!${DIALOG}?.querySelector('[aria-label$="Aways"]')`, "the Member sheet's Away list", 8000)
        const why = await evaluate(`(() => {
          const d = ${DIALOG}
          const list = d.querySelector('[aria-label$="Aways"]')
          const rows = [...list.querySelectorAll('li')]
          if (rows.length === 0) return 'the Away list has no rows'
          if (rows.some((r) => !r.classList.contains('list-row'))) return 'an Away row is not a ListRow'
          if (!rows.every((r) => r.querySelector('[aria-haspopup="dialog"]'))) return 'an Away row does not open a dialog'
          if (![...d.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Add an Away')) return 'no "Add an Away" button'
          const closes = [...d.querySelectorAll('button')].filter((b) => b.getAttribute('aria-label') === 'Close')
          if (closes.length) return 'a Close beside Cancel in the Member sheet'
          return ''
        })()`)
        if (why) throw new Error(`setup: ${why} (${row})`)
        await closeSheets()
      })
    },
  },
}
