// B9-54 (RES-03; plan sections 3 and 9): the Shop opened offline. The setups take the phone offline with Chrome's own network emulation
// (Network.emulateNetworkConditions through the driver's CDP session, `h.cdp`: the driver hands it to the helpers), tick by hand and measure
// what the User sees; each throws, with the reason, when the page does not show it, so a run that never reached the state fails and does not
// pass empty. The rules run on the end state at each width as well.
//   shop-offline-tick   /shop at 375, 390, 834 and 1440: offline, the first open Line is ticked with its tick. The row is at once in Ticked with
//                       data-sync="pending", its tick named "<Line>, waiting to sync" and still pressed, the 14 px clock badge on the tick, the meta
//                       "Waiting to sync …" (never cut), no .error-state, at most ONE toast (no toast storm), and the metrics say "waiting".
//   shop-offline-sheet  the same row's sheet at 375, 834 and 667x375 on a touch emulation: the state line says "Waiting to sync", the addition row
//                       says "waiting to sync" and has its Take back, and there is one circular Close. Sheet rules only (P1, P8, P18, P25, P33).
import { evaluate, press, until } from '../helpers.mjs'

const TOUCH = [
  { method: 'Emulation.setTouchEmulationEnabled', params: { enabled: true, maxTouchPoints: 5 } },
  { method: 'Emulation.setEmitTouchEventsForMouse', params: { enabled: true, configuration: 'mobile' } },
]
const FIRST_TICK = `document.querySelectorAll('.shop-open .list-row .line-row__tick')[0]`

/** Chrome's network emulation: every request fails and navigator.onLine turns false (the page hears `offline`). */
async function goOffline(h) {
  if (typeof h.cdp !== 'function') throw new Error('setup: the helpers have no cdp(): scripts/check-page-layout.mjs must pass its CDP call to installHelpers (B9-54)')
  await h.cdp('Network.enable', {})
  await h.cdp('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })
  await until(`navigator.onLine === false`, 'the phone offline (Network.emulateNetworkConditions)', 4000)
}

/** Ticks the first open row offline and waits for its waiting state; returns its name. */
async function tickOffline(h) {
  await until(`document.querySelectorAll('.shop-open .list-row .line-row__tick').length >= 1 && !document.querySelector('[aria-busy="true"], .skeleton')`, 'an open Line with a tick (the seed has open Lines)')
  const name = await evaluate(`${FIRST_TICK}.getAttribute('aria-label')`)
  await goOffline(h)
  await press(FIRST_TICK, `the tick "${name}"`)
  await until(`!!document.querySelector('.shop-ticked [data-sync="pending"]')`, `"${name}" in Ticked with data-sync="pending"`, 5000)
  return name.replace(/^Tick /, '')
}

export default {
  order: 540,
  scenarios: [
    { name: 'shop-offline-tick', route: '/shop', start: '/shop', setup: 'shopOfflineTick', widths: [375, 390, 834, 1440] },
    { name: 'shop-offline-sheet', route: '/shop', start: '/shop', setup: 'shopOfflineSheet', widths: [375, 834, '667x375'], emulate: TOUCH, rules: ['P1', 'P8', 'P18', 'P25', 'P33'] },
  ],
  setups: {
    async shopOfflineTick(h) {
      const line = await tickOffline(h)
      const state = await evaluate(`(() => {
        const problems = []
        const row = document.querySelector('.shop-ticked [data-sync="pending"]')
        const tick = row.querySelector('.line-row__tick')
        if (!/, waiting to sync$/.test(tick.getAttribute('aria-label') || '')) problems.push('RES-03: the tick is named "' + tick.getAttribute('aria-label') + '", not "Tick ' + ${JSON.stringify(line)} + ', waiting to sync"')
        if (tick.getAttribute('aria-pressed') !== 'true') problems.push('RES-03: the waiting tick is not aria-pressed (it is ticked)')
        const badge = row.querySelector('.list-row__sync-badge')
        if (!badge) problems.push('RES-03: no clock badge on the waiting tick')
        else if (badge.getBoundingClientRect().width < 14) problems.push('RES-03: the clock badge is ' + badge.getBoundingClientRect().width + ' px, not 14')
        const meta = row.querySelector('.list-row__meta-text')
        if (!meta || !/^Waiting to sync/.test(meta.textContent.trim())) problems.push('RES-03: the meta is "' + (meta ? meta.textContent.trim() : '') + '", not "Waiting to sync …"')
        else {
          // B9-55: in a narrow row text (ListRow's row-text container under 12 rem) the long meta is visually hidden, still the accessible
          // text, and its compact form shows: judge the line the User sees.
          const hidden = (e) => { const cs = getComputedStyle(e); return cs.display === 'none' || (cs.position === 'absolute' && e.getBoundingClientRect().width <= 1) }
          const compact = row.querySelector('.list-row__meta-compact')
          const shown = hidden(meta) && compact && !hidden(compact) ? compact : meta
          if (!hidden(shown) && shown.scrollWidth > shown.clientWidth + 1) problems.push('P23: the waiting meta is cut ("' + shown.textContent.trim() + '")')
        }
        if (document.querySelector('.error-state')) problems.push('RES-03: an .error-state shows (the raw "The network is unreachable" tile)')
        const toasts = document.querySelectorAll('.toast').length
        if (toasts > 1) problems.push('RES-03: ' + toasts + ' toasts show for one tick (no toast storm)')
        if (!/waiting/.test(document.querySelector('.shop-metrics__meta')?.textContent || '')) problems.push('RES-03: the metrics do not say "waiting"')
        return problems
      })()`)
      if (state.length > 0) throw new Error(`setup: ${state.join('; ')}`)
    },
    async shopOfflineSheet(h) {
      const line = await tickOffline(h)
      await press(`document.querySelector('.shop-ticked [data-sync="pending"] .list-row__target')`, `the row of "${line}"`)
      await until(`!!document.querySelector('dialog.sheet[open]')`, `the sheet of "${line}"`, 4000)
      const state = await evaluate(`(() => {
        const problems = []
        const sheet = document.querySelector('dialog.sheet[open]')
        const text = sheet.textContent
        if (!/Waiting to sync/.test(text)) problems.push('RES-03: the sheet has no "Waiting to sync" state line')
        if (!/waiting to sync/.test(sheet.querySelector('.ticked-sheet__adds')?.textContent || '')) problems.push('RES-03: the addition row does not say "waiting to sync"')
        if (!sheet.querySelector('[data-take-back]')) problems.push('RES-03: the waiting addition has no Take back')
        const closes = sheet.querySelectorAll('button[aria-label="Close"]').length
        if (closes !== 1) problems.push('R-B: the sheet has ' + closes + ' Close buttons, not one')
        return problems
      })()`)
      if (state.length > 0) throw new Error(`setup: ${state.join('; ')}`)
    },
  },
}
