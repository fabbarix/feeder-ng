// Probe "popover-align" (in-page, B9-03), moved verbatim from scripts/check-page-layout.mjs. It fills the metrics field
//   popoverAlign: { dx, left, right, contentX, contentR } of the open popover, or null (P19)
// P19 (from 768 px): an open popover (role dialog with an id) and the trigger that controls it: its end edge against the trigger's, and
// its edges against the page content box (the padding box of <main>).
const popoverAlignProbe = `
(() => {
  const pop = document.querySelector('.popover[role="dialog"][id]')
  if (!pop) return null
  const trigger = document.querySelector('[aria-controls="' + pop.id + '"]')
  const main = document.querySelector('main')
  if (!trigger || !main) return null
  const r = pop.getBoundingClientRect()
  if (r.width < 2) return null
  const t = trigger.getBoundingClientRect()
  const mr = main.getBoundingClientRect(), ms = getComputedStyle(main)
  return {
    dx: Math.round(r.right - t.right), left: Math.round(r.left), right: Math.round(r.right),
    contentX: Math.round(mr.left + parseFloat(ms.paddingLeft)), contentR: Math.round(mr.right - parseFloat(ms.paddingRight)),
  }
})()`

export default { name: 'popover-align', key: 'popoverAlign', order: 110, source: popoverAlignProbe }
