// Probe "layout" (in-page, B9-03), moved verbatim from scripts/check-page-layout.mjs: the base metrics every rule reads (key null).
// The base probe: the box, field, bar and text metrics of <main> (P1..P11). A page without <main> returns { hasMain: false }.
const layoutProbe = `
(() => {
  // A page without the app (an error page, a 503 text, a blank document) has no <main>: report what it shows instead of measuring nothing.
  if (!document.querySelector('main')) {
    const text = (document.body?.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 80)
    return { hasMain: false, title: document.title.trim().slice(0, 80), text }
  }
  const vw = innerWidth
  const cw = document.documentElement.clientWidth
  const vis = (e) => { const b = e.getBoundingClientRect(); const s = getComputedStyle(e); return b.width > 0 && b.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' }
  const inScroller = (e) => { for (let p = e.parentElement; p; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll' || o === 'hidden') return true } return false }
  const rgb = (c) => (c.match(/[\\d.]+/g) || []).map(Number)
  const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
  const contrast = (a, b) => { const [x, y] = [lum(rgb(a)), lum(rgb(b))].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
  const main = document.querySelector('main')
  const rail = document.querySelector('nav.side-rail')
  const railR = rail && vis(rail) ? rail.getBoundingClientRect().right : 0
  let minX = 1e9, maxR = 0
  const over = []
  for (const e of (main ? main.querySelectorAll('*') : [])) {
    if (e.hasAttribute('data-page-width')) continue // the container itself: its padding is the gutter, not content
    if (e.closest('.sticky-action-bar')) continue // a bar spans the content edges by design (rule P6 checks it)
    if (!vis(e)) continue
    if (e.matches('.sticky-action-bar')) continue // as wide as the content by design (P6 checks its alignment); its inner row is measured
    const b = e.getBoundingClientRect()
    if (b.width < 2) continue
    if (b.right > cw + 1 && !inScroller(e)) over.push(e.tagName.toLowerCase() + '.' + (e.getAttribute('class') || '').split(' ')[0])
    minX = Math.min(minX, b.x); maxR = Math.max(maxR, Math.min(b.right, cw))
  }
  const fields = []
  for (const e of document.querySelectorAll('main input, main textarea, main [role=spinbutton]')) {
    if (!vis(e) || ['hidden', 'checkbox', 'radio', 'file'].includes(e.type)) continue
    const frame = e.closest('.ui-field') || e.closest('[data-size]') || e
    const size = frame.getAttribute('data-size') || ''
    const short = ['numeric', 'decimal'].includes(e.inputMode) || e.getAttribute('role') === 'spinbutton' || ['xs', 'sm'].includes(size)
    const segment = e.closest('.time-field, .stepper')
    fields.push({ label: (e.getAttribute('aria-label') || (e.id && document.querySelector('label[for="' + e.id + '"]')?.innerText) || e.name || '').trim().slice(0, 30), type: e.type || e.getAttribute('role'), short, segment: !!segment, long: !!e.closest('[data-size-intent="long"]'), inline: !!e.closest('[data-size-intent="inline"]'), size, w: Math.round(frame.getBoundingClientRect().width) })
  }
  const bars = []
  for (const e of (main ? main.querySelectorAll('*') : [])) {
    const s = getComputedStyle(e)
    // P6 is about action bars stuck to the bottom of the viewport; a top-sticky side panel (the Stock aside) is not one. A dialog or a
    // popover is in the top layer and places itself (P19 checks the popover), so it is not a page bar.
    if ((s.position === 'sticky' || s.position === 'fixed') && s.bottom !== 'auto' && vis(e) && e.querySelector('button, a') && !e.closest('dialog, [popover]')) {
      const b = e.getBoundingClientRect()
      bars.push({ cls: String(e.className).split(' ')[0], x: Math.round(b.x), r: Math.round(b.right), bgAlpha: (rgb(s.backgroundColor)[3] ?? 1) })
    }
  }
  const cur = rail && vis(rail) ? rail.querySelector('[aria-current="page"]') : null
  let railContrast = null
  if (cur) { const s = getComputedStyle(cur); let bg = s.backgroundColor; if (rgb(bg)[3] === 0) bg = getComputedStyle(cur.querySelector('.side-rail__pill') || rail).backgroundColor; if (rgb(bg)[3] === 0) bg = getComputedStyle(document.body).backgroundColor; railContrast = Math.round(contrast(s.color, bg) * 100) / 100 }
  // P11: a clipped box (overflow hidden, text wider than the box, not an intentional ellipsis) or a word broken mid-word across lines.
  const brokenText = []
  const sel = (e) => e.tagName.toLowerCase() + '.' + String(e.className).split(' ')[0]
  for (const e of (main ? main.querySelectorAll('*') : [])) {
    const s = getComputedStyle(e)
    // A visually-hidden (screen-reader) box is 1 px on purpose: only boxes wider than 2 px are checked.
    if (['hidden', 'clip'].includes(s.overflowX) && s.textOverflow !== 'ellipsis' && e.clientWidth > 2 && e.scrollWidth > e.clientWidth + 1 && vis(e) && e.innerText.trim()) {
      brokenText.push({ sel: sel(e), why: 'clipped' })
    }
  }
  const isWordChar = (c) => /[\\p{L}\\p{N}]/u.test(c)
  const midWord = (node) => {
    let prevTop = null
    let prevCh = ''
    // The whitespace-delimited token around index i, so the rule can allow emails and links.
    const tokenAt = (i) => {
      const v = node.nodeValue
      let a = i
      let b = i
      while (a > 0 && !/\\s/.test(v[a - 1])) a--
      while (b < v.length && !/\\s/.test(v[b])) b++
      return v.slice(a, b)
    }
    for (let i = 0; i < node.nodeValue.length; i++) {
      const ch = node.nodeValue[i]
      if (/\\s/.test(ch)) { prevCh = ch; continue }
      const r = document.createRange()
      r.setStart(node, i)
      r.setEnd(node, i + 1)
      const rects = r.getClientRects()
      if (!rects.length) continue
      const top = Math.round(rects[0].top)
      if (prevTop !== null && Math.abs(top - prevTop) > 2 && isWordChar(prevCh) && isWordChar(ch)) return tokenAt(i)
      prevTop = top
      prevCh = ch
    }
    return null
  }
  if (main) {
    const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT)
    let n = 0
    for (let node = walker.nextNode(); node && n < 2000; node = walker.nextNode()) {
      if (!node.nodeValue.trim() || !node.parentElement || !vis(node.parentElement)) continue
      if (node.parentElement.closest('script, style')) continue
      n++
      const token = midWord(node)
      if (token) {
        const item = { sel: sel(node.parentElement), why: 'mid-word', token: token.slice(0, 200) }
        if (!brokenText.some((b) => b.sel === item.sel && b.why === item.why)) brokenText.push(item)
      }
    }
  }
  const pageEl = main && main.querySelector('[data-page-width]')
  const container = pageEl || main
  const cb = container.getBoundingClientRect()
  // P6: the floating action bar lines up with the container's content box (inside the gutters), as the cards above it do.
  const ccs = getComputedStyle(container)
  const inner = { x: Math.round(cb.x + parseFloat(ccs.paddingLeft) + parseFloat(ccs.borderLeftWidth)), r: Math.round(cb.right - parseFloat(ccs.paddingRight) - parseFloat(ccs.borderRightWidth)) }
  return { vw, scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth, over: over.slice(0, 3),
    content: { x: Math.round(minX === 1e9 ? 0 : minX), r: Math.round(maxR) }, railR: Math.round(railR), container: { x: Math.round(cb.x), r: Math.round(cb.right) }, containerInner: inner,
    pageWidthAttr: pageEl ? pageEl.getAttribute('data-page-width') : null,
    fields, bars, railContrast, brokenText, dialog: null, hasMain: true }
})()`

export default { name: 'layout', key: null, order: 0, source: layoutProbe }
