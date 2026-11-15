// B9-50 (SSP-08, SSP-19, A11Y-09 receipt row; plan section 9): the receipt screens. The fake Anthropic API answers the read (it always adds a Not
// scanned "KITCHEN ROLL 4 PACK" line named "Kitchen roll" and one with a very long name); the seed (page-layout-seed/b9-50.mjs) has a Product
// "Kitchen roll 4 pack" to match it. The setups measure these themselves and throw, with the reason, so the
// checks hold whatever the rules say; the rules run on the end state at each width as well.
//   receipt-review-add   /scan/receipt/review at 375, 390, 834 and 667x375: "Accept all N" shows; the Not scanned rows have no checkbox and an
//                        "Add <printed line>" control of at least 40 px; the Kitchen roll row says "Kitchen roll 4 pack is a Product"; no title is
//                        cut (the long name wraps whole); the Apply bar is one row, and a focused Add… scrolls clear of it (never under it).
//   receipt-add-sheet    the Add… sheet of that row at 375, 834 and 667x375: "On the receipt" shows the printed line and its price, "Is it one of
//                        these?" lists the Product first and is a radiogroup, the primary is "Use Kitchen roll 4 pack" and is on screen and not
//                        covered, the sheet has the one circular Close. Sheet rules only (P1, P8, P18, P25, P33).
//   receipt-photos-bar   /scan/receipt at 375, 390, 834 and 667x375: with no photo the sticky primary is Take a photo (or Choose a photo) with an icon
//                        and no Read the receipt; after one photo it is Read the receipt, "Add another photo" is in the list, focus is on "Edit photo 1",
//                        Edit and Remove are one IconSet at least 8 px apart, the thumbnail has a frame, and the bar covers no content at the end.
import { ADD_PHOTO, evaluate, ids, press, receiptPhotos, until } from '../helpers.mjs'

// P25 judges tap targets on a touch emulation (the coarse ::after hit areas apply), as b9-14's and b9-48's sheets do.
const TOUCH = [
  { method: 'Emulation.setTouchEmulationEnabled', params: { enabled: true, maxTouchPoints: 5 } },
  { method: 'Emulation.setEmitTouchEventsForMouse', params: { enabled: true, configuration: 'mobile' } },
]
const settled = `!document.querySelector('[aria-busy="true"], .skeleton')`
const BAR = `document.querySelector('.sticky-action-bar')`
const NOT_SCANNED = `document.querySelector('ul[aria-label="Not scanned"]')`
const KITCHEN_ROW = `[...${NOT_SCANNED}.querySelectorAll(':scope > li')].find((li) => /KITCHEN ROLL 4 PACK/.test(li.textContent))`
const SHEET = `document.querySelector('dialog.sheet[open]')`

async function openReview() {
  await receiptPhotos(1)
  await press(`[...document.querySelectorAll('.sticky-action-bar button')].find((b) => b.textContent.trim() === 'Read the receipt')`, '"Read the receipt" in the action bar')
  await until(`location.pathname === '/scan/receipt/review'`, 'the review (a done read)', 30000)
  await until(`!!document.querySelector('main h1') && !!${NOT_SCANNED} && ${settled}`, 'the review content with its Not scanned rows')
}

export default {
  order: 500,
  scenarios: [
    { name: 'receipt-review-add', route: '/scan/receipt/review', start: '/scan', setup: 'receiptReviewAdd', widths: [375, 390, 834, '667x375'] },
    { name: 'receipt-add-sheet', route: '/scan/receipt/review', start: '/scan', setup: 'receiptAddSheet', widths: [375, 834, '667x375'], emulate: TOUCH, rules: ['P1', 'P8', 'P18', 'P25', 'P33'] },
    { name: 'receipt-photos-bar', route: '/scan/receipt', start: '/scan', setup: 'receiptPhotosBar', widths: [375, 390, 834, '667x375'] },
  ],
  setups: {
    async receiptReviewAdd() {
      if (!ids.kitchenRollProductId) throw new Error('setup: not inspected: the seed has no "Kitchen roll 4 pack" Product (page-layout-seed/b9-50.mjs)')
      await openReview()
      const state = await evaluate(`(() => {
        const out = { problems: [] }
        const all = [...document.querySelectorAll('main button')].find((b) => /^Accept all \\d+$/.test(b.textContent.trim()))
        if (!all) out.problems.push('SSP-08: no "Accept all N" button (the read has Price rows, so some rows need no choice)')
        const rows = [...${NOT_SCANNED}.querySelectorAll(':scope > li')]
        if (rows.length < 2) out.problems.push('SSP-08: the Not scanned list has ' + rows.length + ' rows, not the 2 of the fake read')
        for (const li of rows) {
          const name = li.textContent.replace(/\\s+/g, ' ').trim().slice(0, 40)
          if (li.querySelector('input[type=checkbox]')) out.problems.push('SSP-08: a Not scanned row has a checkbox before it is set up: ' + name)
          const add = [...li.querySelectorAll('button')].find((b) => /^Add /.test(b.getAttribute('aria-label') || ''))
          if (!add) { out.problems.push('SSP-08: a Not scanned row has no "Add <printed line>" control: ' + name); continue }
          if (add.textContent.trim() !== 'Add…') out.problems.push('SSP-08: the Add control reads "' + add.textContent.trim() + '", not "Add…"')
          const r = add.getBoundingClientRect()
          if (r.height < 40) out.problems.push('SSP-08/A11Y-09: the Add… control is ' + Math.round(r.height) + ' px tall (40 px at least): ' + name)
        }
        const kitchen = ${KITCHEN_ROW}
        if (!kitchen) out.problems.push('SSP-08: no Not scanned row for KITCHEN ROLL 4 PACK')
        else if (!/Kitchen roll 4 pack is a Product/.test(kitchen.textContent)) out.problems.push('SSP-08: the Kitchen roll row does not say "Kitchen roll 4 pack is a Product": ' + kitchen.textContent.replace(/\\s+/g, ' ').slice(0, 120))
        // no title is cut, and no word is broken in the middle (a title wider than its box would clip or break)
        for (const t of document.querySelectorAll('main .list-row__title')) {
          const cs = getComputedStyle(t)
          if (t.scrollWidth > t.clientWidth + 1 || cs.textOverflow === 'ellipsis') out.problems.push('P23: a review row title is cut: ' + t.textContent.trim().slice(0, 50))
          if (cs.wordBreak === 'break-all') out.problems.push('a review row title breaks words anywhere: ' + t.textContent.trim().slice(0, 50))
        }
        return out
      })()`)
      if (state.problems.length) throw new Error(state.problems.join('; '))
      // The Apply bar is one row; the last Add… scrolls clear of it when it is focused (a focused control is never under the sticky bar).
      const bar = await evaluate(`(() => {
        const bar = ${BAR}
        if (!bar) return { problem: 'no sticky action bar' }
        const buttons = [...bar.querySelectorAll('button')]
        const tops = buttons.map((b) => Math.round(b.getBoundingClientRect().top))
        if (Math.max(...tops) - Math.min(...tops) > 2) return { problem: 'the Apply bar is more than one row: ' + JSON.stringify(tops) }
        const rows = [...${NOT_SCANNED}.querySelectorAll(':scope > li')]
        const last = rows[rows.length - 1].querySelector('button[aria-label^="Add "]')
        last.focus()
        const r = last.getBoundingClientRect()
        const b = bar.getBoundingClientRect()
        return { covered: r.bottom > b.top + 1 && r.top < b.bottom - 1, control: Math.round(r.bottom), bar: Math.round(b.top) }
      })()`)
      if (bar.problem) throw new Error(`setup: ${bar.problem}`)
      if (bar.covered) throw new Error(`setup: a focused Add… is under the sticky Apply bar (its bottom ${bar.control}, the bar's top ${bar.bar}): the page must scroll it clear`)
    },
    async receiptAddSheet() {
      if (!ids.kitchenRollProductId) throw new Error('setup: not inspected: the seed has no "Kitchen roll 4 pack" Product (page-layout-seed/b9-50.mjs)')
      await openReview()
      await press(`(${KITCHEN_ROW})?.querySelector('button[aria-label^="Add "]')`, 'the Add… of KITCHEN ROLL 4 PACK')
      await until(`!!${SHEET}?.querySelector('form')`, 'the Add… sheet')
      const state = await evaluate(`(() => {
        const sheet = ${SHEET}
        const problems = []
        const block = sheet.querySelector('[aria-label="On the receipt"]')
        if (!block || !/KITCHEN ROLL 4 PACK/.test(block.textContent)) problems.push('SSP-08: no "On the receipt" block with the printed line')
        const group = sheet.querySelector('[role=radiogroup][aria-label="Is it one of these?"], [role=radiogroup][aria-labelledby]')
        const radios = group ? [...group.querySelectorAll('[role=radio]')] : []
        if (!group || !/Is it one of these\\?/.test(group.getAttribute('aria-label') || document.getElementById(group.getAttribute('aria-labelledby') || '')?.textContent || '')) problems.push('SSP-08: no radiogroup "Is it one of these?"')
        else if (!/^Kitchen roll 4 pack/.test(radios[0]?.textContent.trim() || '')) problems.push('SSP-08: the Product is not offered first: "' + (radios[0]?.textContent.trim() || '') + '"')
        const use = [...sheet.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Use Kitchen roll 4 pack')
        if (!use) problems.push('SSP-08: no primary "Use Kitchen roll 4 pack"')
        else {
          use.scrollIntoView({ block: 'nearest' })
          const r = use.getBoundingClientRect()
          if (r.bottom > innerHeight + 1 || r.top < 0) problems.push('SSP-08: "Use Kitchen roll 4 pack" is not on screen (' + Math.round(r.top) + ' to ' + Math.round(r.bottom) + ' of ' + innerHeight + ')')
          const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
          if (!at || !use.contains(at)) problems.push('SSP-08: "Use Kitchen roll 4 pack" is covered by ' + (at?.tagName || 'nothing'))
        }
        const closes = sheet.querySelectorAll('button[aria-label="Close"]').length
        if (closes !== 1) problems.push('R-B: the sheet has ' + closes + ' Close buttons, not 1')
        return problems
      })()`)
      if (state.length) throw new Error(state.join('; '))
    },
    async receiptPhotosBar() {
      await receiptPhotos(0)
      await until(`!!${BAR}`, 'the action bar')
      const empty = await evaluate(`(() => {
        const problems = []
        const bar = ${BAR}
        const primary = bar.querySelector('button[data-variant="primary"]')
        if (!primary || !/^(Take|Choose) a photo$/.test(primary.textContent.trim())) problems.push('SSP-19: with no photo the sticky primary is "' + (primary?.textContent.trim() || 'missing') + '", not Take a photo')
        else if (!primary.querySelector('svg')) problems.push('SSP-19: the Take a photo primary has no icon')
        if ([...bar.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Read the receipt')) problems.push('SSP-19: Read the receipt is in the bar with no photo')
        const others = [...document.querySelectorAll('main button')].filter((b) => !bar.contains(b) && /^(Take|Choose) a photo$/.test(b.textContent.trim()))
        if (others.length) problems.push('SSP-19: a second Take a photo button is on the page')
        if (!/Take a photo of the whole receipt\\. Long receipt\\? Take it in parts, top to bottom\\./.test(document.querySelector('main').textContent)) problems.push('SSP-19: the page does not say "Take a photo of the whole receipt. Long receipt? …"')
        const tops = [...bar.querySelectorAll('button')].map((b) => Math.round(b.getBoundingClientRect().top))
        if (Math.max(...tops) - Math.min(...tops) > 2) problems.push('the bar is more than one row')
        return problems
      })()`)
      if (empty.length) throw new Error(empty.join('; '))
      if (!(await evaluate(ADD_PHOTO))) throw new Error('setup: the photos screen has no file input')
      await until(`document.querySelectorAll('.receipt-photos > li').length >= 1`, 'receipt photo 1')
      await until(`document.activeElement?.getAttribute('aria-label') === 'Edit photo 1'`, 'focus on "Edit photo 1" after the photo was added (SSP-19)')
      const one = await evaluate(`(() => {
        const problems = []
        const bar = ${BAR}
        const primary = bar.querySelector('button[data-variant="primary"]')
        if (!primary || primary.textContent.trim() !== 'Read the receipt' || primary.disabled) problems.push('SSP-19: with a photo the sticky primary is "' + (primary?.textContent.trim() || 'missing') + '"' + (primary?.disabled ? ' (disabled)' : '') + ', not an enabled Read the receipt')
        const add = [...document.querySelectorAll('main button')].find((b) => !bar.contains(b) && b.textContent.trim() === 'Add another photo')
        if (!add) problems.push('SSP-19: "Add another photo" is not in the list')
        else if (add.getAttribute('data-variant') !== 'secondary') problems.push('SSP-19: "Add another photo" is not the secondary button')
        const row = document.querySelector('.receipt-photos > li')
        const set = row.querySelector('.icon-set')
        const edit = row.querySelector('button[aria-label="Edit photo 1"]')
        const remove = row.querySelector('button[aria-label="Remove photo 1"]')
        if (!set || !set.contains(edit) || !set.contains(remove)) problems.push('A11Y-09: Edit and Remove of a photo are not one IconSet')
        else {
          const a = edit.getBoundingClientRect()
          const b = remove.getBoundingClientRect()
          const gap = b.left - a.right
          if (gap < 8 - 0.5) problems.push('A11Y-09: Edit and Remove are ' + Math.round(gap * 10) / 10 + ' px apart (8 px at least)')
        }
        const thumb = row.querySelector('.thumb')
        const cs = thumb && getComputedStyle(thumb)
        if (!thumb || parseFloat(cs.borderTopWidth) < 1 || cs.borderTopStyle === 'none') problems.push('SSP-19: the thumbnail has no frame')
        if (thumb && (cs.backgroundColor === 'rgba(0, 0, 0, 0)' || cs.backgroundColor === 'transparent')) problems.push('SSP-19: nothing is behind the thumbnail image')
        // at the end of the page the sticky bar covers no content
        scrollTo(0, document.documentElement.scrollHeight)
        const b = bar.getBoundingClientRect()
        const covered = [...document.querySelectorAll('main .receipt-photo, main .receipt-hint, main .receipt-privacy')].filter((e) => {
          const r = e.getBoundingClientRect()
          return r.height > 0 && r.bottom > b.top + 1 && r.top < b.bottom - 1
        })
        if (covered.length) problems.push('the sticky bar covers ' + covered.length + ' element(s) at the end of the page')
        return problems
      })()`)
      if (one.length) throw new Error(one.join('; '))
    },
  },
}
