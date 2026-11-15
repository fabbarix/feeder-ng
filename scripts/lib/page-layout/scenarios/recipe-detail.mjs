// B9-27 (RX-04, RX-05, RX-13, SHORT-04 Cook bar; plan section 9 reserves no rule number for this package, so these scenarios measure in their setups
// and throw, like household-errors, and report only the layout rules that can catch their breakage).
//   recipe-detail-cook   /recipes/:id at 1024x768, 1280x800, 1440x900 and 1920x1080: the primary action ("Start Cook Mode") is inside the first
//                        viewport, or is in a .sticky-action-bar; the side column's edges are equal (+-1 px: the hero, the Cook tile, the metric
//                        strip and the Ingredients share them); the aside is never sticky; nothing in the metric strip is a chip (RX-13).
//   recipe-detail-phone  /recipes/:id at 375 and 390: no metric value wraps; the Cook bar is one row of at most 70 px, the button reads "Cook" at
//                        375 and "Start Cook Mode" at 390 (named "Start Cook Mode" in both); the hero chip line shows no chip cut, "+N" included.
import { evaluate, js, until } from '../helpers.mjs'

const ready = `!!document.querySelector('main h1') && !document.querySelector('[aria-busy="true"], .skeleton') && !!document.querySelector('main .recipe-detail__layout')`

const BOX = (sel) => `(() => { const e = document.querySelector(${js(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height } })()`

export default {
  order: 340,
  scenarios: [
    { name: 'recipe-detail-cook', route: '/recipes/:id', start: '/recipes/:id', setup: 'recipeDetailCook', widths: ['1024x768', '1280x800', 1440, '1920x1080'], rules: ['P1', 'P3', 'P11', 'P13', 'P14', 'P16'] },
    { name: 'recipe-detail-phone', route: '/recipes/:id', start: '/recipes/:id', setup: 'recipeDetailPhone', widths: [375, 390], rules: ['P1', 'P11', 'P13', 'P14', 'P16', 'P17'] },
  ],
  setups: {
    async recipeDetailCook() {
      await until(ready, 'Recipe detail')
      const m = await evaluate(`(() => {
        const start = [...document.querySelectorAll('main button')].find((b) => (b.getAttribute('aria-label') || b.textContent).trim() === 'Start Cook Mode')
        const r = start ? start.getBoundingClientRect() : null
        const aside = document.querySelector('.recipe-detail__aside')
        const kids = aside ? [...aside.children].map((c) => { const b = c.getBoundingClientRect(); return { cls: c.className.split(' ')[0] || c.tagName, x: Math.round(b.left * 10) / 10, r: Math.round(b.right * 10) / 10 } }) : []
        return {
          vh: innerHeight, vw: innerWidth,
          start: r ? { t: r.top, b: r.bottom, inBar: !!start.closest('.sticky-action-bar'), inTile: !!start.closest('section[aria-labelledby]') } : null,
          kids, asideSticky: aside ? getComputedStyle(aside).position === 'sticky' : null,
          metricChips: document.querySelectorAll('.bento-grid[data-min="metric"] .chip').length,
          tile: !!document.querySelector('main section.recipe-cook'),
        }
      })()`)
      if (!m.start) throw new Error('setup: no "Start Cook Mode" button on Recipe detail')
      if (!(m.start.inBar || (m.start.t >= 0 && m.start.b <= m.vh))) throw new Error(`setup: "Start Cook Mode" is below the first viewport (y ${Math.round(m.start.t)}-${Math.round(m.start.b)} of ${m.vh}) and not in a sticky bar (RX-04)`)
      if (m.vw >= 1024 && (!m.tile || m.start.inBar)) throw new Error(`setup: from 1024 px the Cook entry is the Cook tile, not a bar (tile ${m.tile}, inBar ${m.start.inBar})`)
      if (m.asideSticky) throw new Error('setup: the side column is sticky (RX-04: nothing is sticky)')
      if (m.metricChips) throw new Error(`setup: ${m.metricChips} chip(s) in the metric strip (RX-13: the Ready Meal chip is on the hero line)`)
      if (m.vw >= 720 + 32) {
        const xs = m.kids.filter((k) => !/sticky-action-bar/.test(k.cls))
        const bad = xs.filter((k) => Math.abs(k.x - xs[0].x) > 1 || Math.abs(k.r - xs[0].r) > 1)
        if (bad.length) throw new Error(`setup: the side column's edges differ by more than 1 px: ${js(xs)}`)
      }
    },
    async recipeDetailPhone() {
      await until(ready, 'Recipe detail')
      const m = await evaluate(`(() => {
        const wraps = [...document.querySelectorAll('.tile-metric__value')].map((e) => { const r = e.getBoundingClientRect(); const lh = parseFloat(getComputedStyle(e).lineHeight) || 24; return { text: e.textContent.trim(), lines: Math.round(r.height / lh), over: e.scrollWidth > e.clientWidth + 1 } }).filter((x) => x.lines > 1 || x.over)
        const bar = document.querySelector('.sticky-action-bar')
        const barBox = bar ? bar.getBoundingClientRect() : null
        const entry = bar ? bar.querySelector('.cook-entry') : null
        const button = entry ? entry.querySelector('button[data-variant="primary"]') : null
        const stepper = entry ? entry.querySelector('[role="group"]') : null
        const bb = button ? button.getBoundingClientRect() : null
        const sb = stepper ? stepper.getBoundingClientRect() : null
        const shown = button ? [...button.querySelectorAll('span')].filter((s) => getComputedStyle(s).display !== 'none').map((s) => s.textContent.trim()).join('') : null
        const line = document.querySelector('.recipe-detail__hero .recipe-tags[data-fitted="true"]')
        const lb = line ? line.getBoundingClientRect() : null
        const cut = line ? [...line.querySelectorAll('.chip')].filter((c) => { const r = c.getBoundingClientRect(); return r.width > 0 && (r.left < lb.left - 1 || r.right > lb.right + 1) }).map((c) => c.textContent.trim()) : []
        return { vw: innerWidth, wraps, barH: barBox ? barBox.height : null, sameRow: bb && sb ? Math.abs((bb.top + bb.bottom) / 2 - (sb.top + sb.bottom) / 2) < 8 : null, name: button ? button.getAttribute('aria-label') : null, shown, cut, hasLine: !!line }
      })()`)
      if (m.wraps.length) throw new Error(`setup: a metric value wraps or overflows (RX-04: nowrap, title-2 on a phone): ${js(m.wraps)}`)
      if (m.barH === null) throw new Error('setup: no Cook bar on a phone')
      if (m.barH > 71) throw new Error(`setup: the Cook bar is ${Math.round(m.barH)} px tall (one row is at most 70 px, SHORT-04)`)
      if (m.sameRow === false) throw new Error('setup: the Batches stepper and "Start Cook Mode" are not on one row (SHORT-04)')
      if (m.name !== 'Start Cook Mode') throw new Error(`setup: the Cook button is named ${js(m.name)}, not "Start Cook Mode" (label in name)`)
      const want = m.vw <= 375 ? 'Cook' : 'Start Cook Mode'
      if (m.shown !== want) throw new Error(`setup: at ${m.vw} px the Cook button reads ${js(m.shown)}, want ${js(want)} ("Cook" at 375 and below)`)
      if (!m.hasLine) throw new Error('setup: the hero has no fitted chip line (RX-04)')
      if (m.cut.length) throw new Error(`setup: chips cut by the hero chip line (the "+N" included): ${js(m.cut)}`)
    },
  },
}
