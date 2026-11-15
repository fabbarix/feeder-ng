// B9-42 (plan section 9; SAFE-02, SET-08, SET-09, SET-10, SET-15, SHORT-02, A11Y-07): the Meal Slots scenarios. Each setup measures what a
// rule cannot say and throws a line that names it, so a regression is reported, not passed on an empty page.
//   meal-slots-cards       /settings/meal-slots at 375, 390, 834 and 1440: a day's time fits its pill, the "differs" dot is clear of the
//                          weekday and the time, the Avatar stack overlaps by less than a third, cards are one column below 1024 and two from 1024 (834 has one, 1440 two).
//   meal-slot-editor       Edit Dinner at 390, 834 and 1440 (P13): every Course row has its up, down and remove buttons at the same x, 8 px apart or
//                          more; the footer is Cancel and Save with no Close; Save is in the viewport.
//   meal-slot-editor-narrow  the same sheet at 375 and 390 with P31 (the bottom bar under the sheet) and P13: one Attendance row anatomy, and the
//                          Portion Factor stepper never alone on a line (all rows stack under 20 rem of list, none above).
//   meal-slot-editor-short the same sheet at 667x375: the body keeps its floor (P33) and Save is reachable.
//   meal-slot-remove-confirm  the ⋮ menu -> Remove Meal Slot -> the danger confirm opens: rows, Cancel focused, no Close. Nothing is removed.
//   removed-meal-slots     the tile of the removed Snack (seed meal-slots.mjs): rows, "Put back" on its own line below 35 rem of list width.
//   change-date            Change a date: the title is "<Slot> on Sat 14 Nov" (not ISO), focus is on the Date field, one Close, Reset is outlined.
import { evaluate, js, press, until } from '../helpers.mjs'

const ready = `!!document.querySelector('main') && !document.querySelector('[aria-busy="true"], .skeleton') && !!document.querySelector('main .ms-card')`
const dialogOpen = `!!document.querySelector('dialog[open]')`
// A sheet rises and a dialog fades in: measure only once nothing animates any more (the guard does not ask for reduced motion).
const settled = `document.getAnimations().every((a) => a.playState !== 'running')`
const fail = (what, bad) => {
  throw new Error(`setup: ${what}: ${js(bad)}`)
}

async function openCards() {
  await until(ready, 'the Meal Slot cards')
}
async function openEditDinner() {
  await openCards()
  await press(`[...document.querySelectorAll('main .ms-card')].find((c) => c.getAttribute('aria-label') === 'Dinner')?.querySelector('.ms-card__foot button')`, '"Edit Dinner"')
  await until(`!!document.querySelector('dialog.sheet[open] .course-picker__row')`, 'the Edit Meal Slot sheet with its Course rows')
  await until(settled, 'the sheet to finish rising')
}

export default {
  order: 320,
  scenarios: [
    { name: 'meal-slots-cards', route: '/settings/meal-slots', start: '/settings/meal-slots', setup: 'cardsMeasured', widths: [375, 390, 834, 1440], rules: ['P1', 'P11', 'P13', 'P26'] },
    { name: 'meal-slot-editor', route: '/settings/meal-slots', start: '/settings/meal-slots', setup: 'editorMeasured', widths: [390, 834, 1440], rules: ['P13', 'P18', 'P39'] },
    { name: 'meal-slot-editor-narrow', route: '/settings/meal-slots', start: '/settings/meal-slots', setup: 'editorNarrow', widths: [375, 390], rules: ['P13', 'P31', 'P40'] },
    { name: 'meal-slot-editor-short', route: '/settings/meal-slots', start: '/settings/meal-slots', setup: 'editorShort', widths: ['667x375'], rules: ['P33'] },
    { name: 'meal-slot-remove-confirm', route: '/settings/meal-slots', start: '/settings/meal-slots', setup: 'removeConfirm', widths: [375, 390, 1440], rules: ['P8', 'P13'] },
    { name: 'removed-meal-slots', route: '/settings/meal-slots', start: '/settings/meal-slots', setup: 'removedTile', widths: [375, 390, 1440], rules: ['P1', 'P11', 'P13', 'P40'] },
    { name: 'change-date', route: '/settings/meal-slots', start: '/settings/meal-slots', setup: 'changeDate', widths: [375, 390, 1440], rules: ['P13', 'P25', 'P33'] },
  ],
  setups: {
    async cardsMeasured() {
      await openCards()
      const bad = await evaluate(`(() => {
        const out = []
        const box = (e) => e.getBoundingClientRect()
        for (const day of document.querySelectorAll('.ms-day')) {
          const d = box(day)
          const time = day.querySelector('.ms-day__time')
          if (time && getComputedStyle(time).display !== 'none') {
            const t = box(time)
            if (t.left < d.left - 0.5 || t.right > d.right + 0.5) out.push('time overflows its pill: ' + time.textContent + ' (' + Math.round(t.width) + ' in ' + Math.round(d.width) + ')')
          }
          if (day.hasAttribute('data-differs')) {
            const cs = getComputedStyle(day, '::after')
            const size = parseFloat(cs.width) || 0
            const right = d.right - (parseFloat(cs.insetInlineEnd) || parseFloat(cs.right) || 0)
            const top = d.top + (parseFloat(cs.insetBlockStart) || parseFloat(cs.top) || 0)
            const dot = { l: right - size, r: right, t: top, b: top + size }
            for (const part of day.querySelectorAll('.ms-day__name, .ms-day__time')) {
              if (getComputedStyle(part).display === 'none') continue
              const p = box(part)
              const w = Math.min(p.right, dot.r) - Math.max(p.left, dot.l), h = Math.min(p.bottom, dot.b) - Math.max(p.top, dot.t)
              if (w > 0.5 && h > 0.5) out.push('the differs dot covers ' + part.className + ' of ' + day.querySelector('.ms-day__name')?.textContent)
            }
          }
        }
        for (const stack of document.querySelectorAll('.ms-stack')) {
          const items = [...stack.children].map(box)
          for (let i = 1; i < items.length; i++) {
            const overlap = items[i - 1].right - items[i].left
            if (overlap > items[i].width / 3 + 0.5) out.push('Avatar stack overlaps by ' + Math.round(overlap) + ' px of ' + Math.round(items[i].width))
          }
        }
        const cards = [...document.querySelectorAll('main .ms-card')].map(box)
        if (cards.length >= 2) {
          const sameRow = cards.filter((c) => Math.abs(c.top - cards[0].top) < 2).length
          const want = innerWidth >= 1024 ? 2 : 1
          if (sameRow !== want) out.push('cards in the first row: ' + sameRow + ', expected ' + want + ' at ' + innerWidth)
        }
        return out
      })()`)
      if (bad.length) fail('the Meal Slot cards are off', bad)
    },
    async editorMeasured() {
      await openEditDinner()
      const bad = await evaluate(`(() => {
        const out = []
        const sheet = document.querySelector('dialog.sheet[open]')
        const box = (e) => e.getBoundingClientRect()
        const rows = [...sheet.querySelectorAll('.course-picker__row')]
        if (rows.length < 2) out.push('fewer than two Course rows (the Dinner of the seed has Main and Side)')
        const xs = rows.map((r) => Math.round(box(r.querySelector('.icon-set') ?? r.querySelector('.course-picker__actions')).left))
        if (new Set(xs).size > 1) out.push('the up, down and remove buttons start at different x in the rows: ' + xs)
        for (const r of rows) {
          const btns = [...r.querySelectorAll('.course-picker__actions button')].map(box)
          for (let i = 1; i < btns.length; i++) if (btns[i].left - btns[i - 1].right < 7.5) out.push('Course buttons ' + Math.round(btns[i].left - btns[i - 1].right) + ' px apart (8 px at least, so rings never touch)')
          const text = r.querySelector('.course-picker__text'), actions = r.querySelector('.course-picker__actions')
          if (text && actions && box(text).right > box(actions).left + 0.5) out.push('the name overlaps the buttons')
        }
        if (sheet.querySelector('.sheet__header button[aria-label="Close"], .sheet__close') && sheet.querySelector('.sheet__cancel')) out.push('a Close and a Cancel together (R-B)')
        const save = [...sheet.querySelectorAll('.sheet__footer button')].find((b) => b.textContent.trim() === 'Save Meal Slot')
        if (!save) out.push('no "Save Meal Slot" in the footer')
        else if (box(save).bottom > innerHeight + 0.5) out.push('Save is below the viewport')
        return out
      })()`)
      if (bad.length) fail('the Meal Slot sheet is off', bad)
    },
    async editorNarrow() {
      await openEditDinner()
      const bad = await evaluate(`(() => {
        const out = []
        const sheet = document.querySelector('dialog.sheet[open]')
        const box = (e) => e.getBoundingClientRect()
        const list = sheet.querySelector('ul.attendance')
        if (!list) return ['no ul.attendance (one row per Member)']
        const stacked = list.clientWidth < 320
        for (const row of list.querySelectorAll('li')) {
          const name = row.querySelector('.attendance__name'), step = row.querySelector('.attendance__step')
          if (!name || !step) continue
          const under = box(step).top >= box(name).bottom - 1
          if (under !== stacked) out.push((row.textContent.slice(0, 20)) + ': the stepper is ' + (under ? 'under' : 'beside') + ' the name at a list width of ' + list.clientWidth + ' (rows switch together, under 320 px)')
          if (box(name).height > 2 * (parseFloat(getComputedStyle(name).lineHeight) || 20) + 1) out.push('a name takes more than two lines')
          const cb = row.querySelector('input[type=checkbox], [role=checkbox]'), av = row.querySelector('.avatar, [data-avatar]')
          if (cb && av && box(cb).left > box(av).left) out.push('the checkbox is after the Avatar')
        }
        return out
      })()`)
      if (bad.length) fail('the Attendance rows are off', bad)
    },
    async editorShort() {
      await openEditDinner()
      const bad = await evaluate(`(() => {
        const sheet = document.querySelector('dialog.sheet[open]')
        const save = [...sheet.querySelectorAll('.sheet__footer button')].find((b) => b.textContent.trim() === 'Save Meal Slot')
        if (!save) return ['no "Save Meal Slot" in the footer']
        const r = save.getBoundingClientRect()
        return r.bottom > innerHeight + 0.5 || r.top < 0 ? ['Save is outside the 375 px high viewport'] : []
      })()`)
      if (bad.length) fail('the short Meal Slot sheet is off', bad)
    },
    async removeConfirm() {
      await openEditDinner()
      await press(`document.querySelector('dialog.sheet[open] button[aria-label="More for Dinner"]')`, 'the sheet\'s ⋮ "More for Dinner"')
      // The ⋮ is a popover of menuitems from 768 px and a sheet of rows (each a stretched button) below it.
      const item = `[...document.querySelectorAll('[role=menuitem], dialog[open] .list-row__target')].find((i) => (i.getAttribute('aria-label') || i.textContent).trim() === 'Remove Meal Slot')`
      await until(`!!(${item})`, 'the ⋮ menu')
      await press(item, '"Remove Meal Slot" in the menu')
      await until(`[...document.querySelectorAll('dialog[open] h2')].some((h) => /^Remove .+ on \\w+\\?$/.test(h.textContent.trim()))`, 'the Remove confirm')
      await until(settled, 'the confirm to finish opening')
      const bad = await evaluate(`(() => {
        const out = []
        const d = [...document.querySelectorAll('dialog[open]')].find((x) => /^Remove /.test(x.querySelector('h2')?.textContent ?? ''))
        if (!d) return ['no confirm dialog']
        if (d.querySelector('[aria-label="Close"]')) out.push('the confirm has a Close')
        if (document.activeElement?.textContent.trim() !== 'Cancel') out.push('focus is on ' + document.activeElement?.textContent.trim() + ', not Cancel')
        if (d.querySelectorAll('li').length < 1) out.push('no rows')
        if (d.querySelectorAll('.confirm-dialog__body').length) out.push('a paragraph wall instead of rows')
        return out
      })()`)
      if (bad.length) fail('the Remove Meal Slot confirm is off', bad)
    },
    async removedTile() {
      await openCards()
      await until(`!!document.querySelector('section[aria-labelledby], [role=region]') && [...document.querySelectorAll('main h2')].some((h) => /^Removed Meal Slots/.test(h.textContent.trim()))`, 'the "Removed Meal Slots" tile (the b9-42 seed removes a Snack that has Cooked history)')
      const bad = await evaluate(`(() => {
        const out = []
        const h = [...document.querySelectorAll('main h2')].find((x) => /^Removed Meal Slots/.test(x.textContent.trim()))
        const tile = h.closest('section') ?? h.parentElement
        const rows = [...tile.querySelectorAll('li')]
        if (!rows.length) return ['no rows']
        for (const r of rows) {
          const btn = [...r.querySelectorAll('button')].find((b) => /^Put back/.test(b.getAttribute('aria-label') ?? b.textContent))
          if (!btn) { out.push('a row without Put back'); continue }
          if (btn.getBoundingClientRect().height < 40) out.push('Put back is under 40 px high')
          const title = r.querySelector('.list-row__title')
          if (title && r.clientWidth < 35 * 16 && btn.getBoundingClientRect().top < title.getBoundingClientRect().bottom - 1) out.push('Put back shares the title line in a row of ' + r.clientWidth + ' px (own line below 35 rem)')
        }
        return out
      })()`)
      if (bad.length) fail('the Removed Meal Slots tile is off', bad)
    },
    async changeDate() {
      await openCards()
      await press(`document.querySelector('main .ms-card .ms-card__foot button:last-of-type')`, '"Change a date"')
      await until(dialogOpen, 'the Change a date sheet')
      await until(settled, 'the sheet to finish rising')
      const bad = await evaluate(`(() => new Promise((res) => setTimeout(() => {
        const out = []
        const d = document.querySelector('dialog[open]')
        const title = d.querySelector('h2')?.textContent.trim() ?? ''
        if (!/ on (Mon|Tue|Wed|Thu|Fri|Sat|Sun) \\d{1,2} [A-Z][a-z]{2}$/.test(title)) out.push('the title is "' + title + '", not "<Slot> on Sat 14 Nov"')
        const a = document.activeElement
        if (!a || a === document.body || !d.contains(a)) out.push('focus is not inside the sheet')
        else {
          // The Date trigger is named by its field label (aria-labelledby), its text is the date itself.
          const by = (a.getAttribute('aria-labelledby') ?? '').split(/\\s+/).map((id) => document.getElementById(id)?.textContent.trim() ?? '').join(' ').trim()
          const name = a.getAttribute('aria-label') || by || a.textContent.trim()
          if (!/^Date/.test(name)) out.push('focus is on ' + name + ', not the Date field')
        }
        if (d.querySelectorAll('[aria-label="Close"]').length !== 1) out.push('not exactly one Close')
        const reset = [...d.querySelectorAll('button')].find((b) => /Reset to usual/.test(b.textContent))
        if (reset && reset.getAttribute('data-variant') !== 'secondary') out.push('Reset is not an outlined secondary button')
        res(out)
      }, 600)))()`)
      if (bad.length) fail('Change a date is off', bad)
    },
  },
}
