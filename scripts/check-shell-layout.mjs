#!/usr/bin/env node
// Browser check of the shell layout (WP5 acceptance). Not part of scripts/check.sh: it needs Chrome and a running Vite dev server.
//   pnpm -C web dev --port 5199 &            (start it detached, log to build/)
//   node scripts/check-shell-layout.mjs --url http://localhost:5199 [--chrome /usr/bin/google-chrome]
// It drives Chrome over the DevTools protocol (no extra dependency; Node 22+ has WebSocket), fakes GET /api/me so the shell renders,
// and for every route at 390, 820, 1280, 1440, 1920 and 2560 px wide asserts:
//   1. document.documentElement.scrollWidth <= clientWidth (= innerWidth without a scrollbar): no sideways scroll;
//   2. scrolled to the end, the last element of the page ends above the nav (bottom bar < 1024, none hidden behind it);
//   3. /board and /cook/* have no nav and their <main> spans the viewport width (>= 900: the old 220 px column is gone);
//   4. ordinary routes: the current tab has aria-current="page"; the bottom bar (< 1024) or side rail (>= 1024) is visible, not both;
//   5. an unknown route shows "Page not found" and not the router's dev error page;
//   6. (ordinary routes) the avatar trigger sits on the right half of the top bar below 1024;
//   7. (ordinary routes) at >= 1024 the side rail and <main> start within 120 px of the top (the grid rows must not stretch);
//   9. (ordinary routes) at >= 1024 <main> is at least min(1100, its grid column width) - 1 wide (it must not shrink to its content);
//  10. (ordinary routes) at >= 1440 every .side-rail__link sits inside the rail (left > 0, right < rail right) and its labels do not overflow (scrollWidth <= clientWidth);
//   8. (on /) the open avatar menu popover lies fully inside the viewport;
//  11. (ordinary routes) at >= 1024 the current rail item (aria-current) has a label contrast of at least 4.5:1 against its own background (L-04: Scan was 1.31:1).
//  12. (phone, < 1024) the six-button bottom bar (PN): every button is at least 44 x 44 px; Scan centred on the bar (within 1 px); no label is
//      truncated (.bottom-bar__label scrollWidth <= clientWidth, one line); the bar sits inside the viewport with its safe-area insets; /pantry shows Pantry as current.
// Exit code 0 = all passed. Prints one line per failed assertion.
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 ? process.argv[i + 1] : fallback
}
const base = arg('url', 'http://localhost:5173').replace(/\/$/, '')
const chromeBin = arg('chrome', process.env.CHROME ?? 'google-chrome')
const VIEWPORTS = [
  { width: 360, height: 800, mobile: true },
  { width: 390, height: 844, mobile: true },
  { width: 430, height: 932, mobile: true },
  { width: 820, height: 1180, mobile: false },
  { width: 1280, height: 800, mobile: false },
  { width: 1440, height: 900, mobile: false },
  { width: 1920, height: 1080, mobile: false },
  { width: 2560, height: 1440, mobile: false },
]
const ROUTES = ['/', '/plan', '/pantry', '/scan', '/shop', '/recipes', '/settings', '/board', '/cook/1', '/this-route-does-not-exist']
const CHROMELESS = /^\/(board|cook)(\/|$)/

const profile = mkdtempSync(join(tmpdir(), 'shell-layout-'))
const chrome = spawn(chromeBin, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--disable-gpu', 'about:blank'], {
  stdio: ['ignore', 'ignore', 'pipe'],
})
const failures = []
const fail = (msg) => failures.push(msg)

const wsUrl = await new Promise((resolve, reject) => {
  let buf = ''
  chrome.stderr.on('data', (d) => {
    buf += d
    const m = /DevTools listening on (ws:\/\/\S+)/.exec(buf)
    if (m) resolve(m[1])
  })
  chrome.on('exit', () => reject(new Error('Chrome exited before DevTools was ready')))
  setTimeout(() => reject(new Error('timed out waiting for Chrome')), 15000)
})

const ws = new WebSocket(wsUrl)
await new Promise((r) => (ws.onopen = r))
let nextId = 1
const pending = new Map()
const listeners = []
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data)
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id)
    pending.delete(msg.id)
    msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result)
  } else listeners.forEach((l) => l(msg))
}
const send = (method, params = {}, sessionId) =>
  new Promise((resolve, reject) => {
    const id = nextId++
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params, sessionId }))
  })

const { targetId } = await send('Target.createTarget', { url: 'about:blank' })
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })
const cdp = (method, params) => send(method, params, sessionId)
const evaluate = async (expression) => {
  const r = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description ?? ''))
  return r.result.value
}

// Fake the signed-in User; every other API call is an empty 404 (the screens show their error states, which is fine for layout).
await cdp('Fetch.enable', { patterns: [{ urlPattern: `${base}/api/*`, requestStage: 'Request' }] })
listeners.push(({ method, params, sessionId: sid }) => {
  if (method !== 'Fetch.requestPaused' || sid !== sessionId) return
  const isMe = new URL(params.request.url).pathname === '/api/me'
  const body = Buffer.from(isMe ? JSON.stringify({ id: 1, email: 'anna@example.com', displayName: 'Anna Rossi', isAdmin: true }) : '{"error":{"code":"not_found","message":"x"}}').toString('base64')
  cdp('Fetch.fulfillRequest', {
    requestId: params.requestId,
    responseCode: isMe ? 200 : 404,
    responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
    body,
  }).catch(() => {})
})

// Opens the avatar menu and reports the popover's box (null when it did not open).
const menuProbe = `
(async () => {
  window.scrollTo(0, 0)
  const btn = document.querySelector('.your-menu-button')
  if (!btn) return null
  btn.click()
  await new Promise((r) => setTimeout(r, 200))
  const menu = document.querySelector('[role="menu"]')
  if (!menu) return null
  const r = menu.getBoundingClientRect()
  return { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom), w: innerWidth, h: innerHeight }
})()`

const page = `
(() => {
  const q = (s) => document.querySelector(s)
  // Contrast of the current rail item's label colour against its effective background (own fill, else the pill, else the body).
  const rgb = (c) => (c.match(/[\\d.]+/g) || []).map(Number)
  const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
  const railContrast = () => {
    const rail = q('nav.side-rail')
    const cur = rail && getComputedStyle(rail).display !== 'none' ? rail.querySelector('[aria-current="page"]') : null
    if (!cur) return null
    const s = getComputedStyle(cur)
    let bg = s.backgroundColor
    if (rgb(bg)[3] === 0) bg = getComputedStyle(cur.querySelector('.side-rail__pill') || rail).backgroundColor
    if (rgb(bg)[3] === 0) bg = getComputedStyle(document.body).backgroundColor
    const [x, y] = [lum(rgb(s.color)), lum(rgb(bg))].sort((p, q2) => q2 - p)
    return Math.round(((x + 0.05) / (y + 0.05)) * 100) / 100
  }
  const visible = (el) => !!el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0
  const main = q('main')
  const bar = q('nav.bottom-bar')
  const rail = q('nav.side-rail')
  const nav = visible(bar) ? bar : null
  // Make the page tall enough to scroll, then go to the end.
  const probe = document.createElement('div')
  probe.setAttribute('data-qa-probe', '')
  probe.style.cssText = 'height:2500px;background:transparent'
  main && main.appendChild(probe)
  window.scrollTo(0, document.documentElement.scrollHeight)
  const last = main ? main.lastElementChild : null
  return {
    innerWidth, clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth,
    mainColumn: main && main.parentElement ? Math.round(main.parentElement.getBoundingClientRect().width - (rail && visible(rail) ? rail.getBoundingClientRect().width : 0)) : null,
    railContrast: railContrast(),
    mainWidth: main ? Math.round(main.getBoundingClientRect().width) : null,
    avatarCenterX: q('.your-menu-button') ? Math.round(q('.your-menu-button').getBoundingClientRect().left + q('.your-menu-button').getBoundingClientRect().width / 2) : null,
    railTop: rail && visible(rail) ? Math.round(rail.getBoundingClientRect().top) : null,
    mainTop: main ? Math.round(main.getBoundingClientRect().top + window.scrollY) : null,
    hasBar: !!bar, barVisible: visible(bar), railVisible: visible(rail),
    lastBottom: last ? Math.round(last.getBoundingClientRect().bottom) : null,
    navTop: nav ? Math.round(nav.getBoundingClientRect().top) : null,
    current: [...document.querySelectorAll('nav [aria-current="page"]')].map((a) => a.textContent.trim()),
    notFound: /Page not found/.test(document.body.innerText),
    railLinks: rail && visible(rail) ? [...rail.querySelectorAll('.side-rail__link')].map((a) => { const r = a.getBoundingClientRect(); return { text: a.textContent.trim(), left: Math.round(r.left), right: Math.round(r.right), sw: a.scrollWidth, cw: a.clientWidth } }) : [],
    barLinks: bar && visible(bar) ? [...bar.querySelectorAll('.bottom-bar__link')].map((a) => {
      const r = a.getBoundingClientRect()
      const label = a.querySelector('.bottom-bar__label')
      const lr = label ? label.getBoundingClientRect() : null
      return { text: a.textContent.trim(), w: r.width, h: r.height, cx: r.left + r.width / 2, lsw: label ? label.scrollWidth : 0, lcw: label ? label.clientWidth : 0, lh: lr ? lr.height : 0, fs: label ? parseFloat(getComputedStyle(label).fontSize) : 0, scan: a.getAttribute('data-accent') === 'true' }
    }) : [],
    barBox: bar && visible(bar) ? (() => { const r = bar.getBoundingClientRect(); return { left: r.left, right: r.right, cx: (r.left + r.right) / 2, vw: document.documentElement.clientWidth } })() : null,
    railRight: rail && visible(rail) ? Math.round(rail.getBoundingClientRect().right) : null,
    devErrorPage: /Unexpected Application Error|Hey developer/.test(document.body.innerText),
  }
})()`

for (const vp of VIEWPORTS) {
  await cdp('Emulation.setDeviceMetricsOverride', { width: vp.width, height: vp.height, deviceScaleFactor: 1, mobile: vp.mobile })
  for (const route of ROUTES) {
    const tag = `${vp.width}px ${route}`
    await cdp('Page.navigate', { url: base + route })
    await new Promise((r) => setTimeout(r, 1500))
    let m
    try {
      m = await evaluate(page)
    } catch (e) {
      fail(`${tag}: could not inspect the page (${e.message})`)
      continue
    }
    // clientWidth = innerWidth minus a classic scrollbar (headless Chrome has one); scrollWidth must never exceed it.
    if (m.scrollWidth > m.clientWidth) fail(`${tag}: scrollWidth ${m.scrollWidth} > clientWidth ${m.clientWidth} (innerWidth ${m.innerWidth}): sideways scroll`)
    if (m.devErrorPage) fail(`${tag}: React Router's dev error page is showing`)
    if (CHROMELESS.test(route)) {
      if (m.hasBar || m.railVisible) fail(`${tag}: chromeless route shows navigation`)
      if (vp.width >= 900 && (m.mainWidth ?? 0) < m.clientWidth - 1) fail(`${tag}: <main> is ${m.mainWidth}px wide, not the full ${m.clientWidth}px viewport`)
      continue
    }
    if (route.includes('does-not-exist')) {
      if (!m.notFound) fail(`${tag}: no "Page not found" state`)
    } else if (m.current.length === 0 && route !== '/settings') {
      fail(`${tag}: no tab has aria-current="page"`)
    }
    if (route === '/pantry' && !m.current.some((t) => t.startsWith('Pantry'))) fail(`${tag}: Pantry is not the current tab`)
    const phone = vp.width < 1024
    if (phone && m.avatarCenterX !== null && m.avatarCenterX < m.innerWidth / 2) fail(`${tag}: avatar trigger is on the left half (centre x ${m.avatarCenterX} of ${m.innerWidth})`)
    if (!phone) {
      if (m.railTop !== null && m.railTop > 120) fail(`${tag}: side rail starts ${m.railTop}px from the top (grid rows stretch)`)
      if (m.mainWidth !== null && m.mainColumn !== null && m.mainWidth < m.mainColumn - 1) fail(`${tag}: <main> is ${m.mainWidth}px wide, narrower than its column (${m.mainColumn}px): it shrinks to its content`)
      if (m.mainTop !== null && m.mainTop > 120) fail(`${tag}: <main> starts ${m.mainTop}px from the top (grid rows stretch)`)
    }
    if (!phone && m.railContrast !== null && m.railContrast < 4.5) fail(`${tag}: current rail item (aria-current) contrast ${m.railContrast}:1 is below 4.5`)
    if (vp.width >= 1440) {
      if (m.railLinks.length === 0) fail(`${tag}: no .side-rail__link found in the rail`)
      for (const l of m.railLinks) {
        if (!(l.left > 0 && l.right < m.railRight)) fail(`${tag}: rail link "${l.text}" (${l.left}-${l.right}) is not inside the rail (right edge ${m.railRight})`)
        if (l.sw > l.cw) fail(`${tag}: rail link "${l.text}" overflows (scrollWidth ${l.sw} > clientWidth ${l.cw})`)
      }
    }
    if (route === '/') {
      const box = await evaluate(menuProbe).catch(() => null)
      if (!box) fail(`${tag}: the avatar menu did not open`)
      else if (box.left < 0 || box.top < 0 || box.right > box.w || box.bottom > box.h) {
        fail(`${tag}: avatar menu popover (${box.left},${box.top})-(${box.right},${box.bottom}) leaves the ${box.w}x${box.h} viewport`)
      }
    }
    if (phone && m.barBox && m.barLinks.length !== 6) fail(`${tag}: the bottom bar has ${m.barLinks.length} buttons, expected 6`)
    if (phone && m.barBox) {
      // Rule 12: the six-button bar on the narrowest phones.
      const scan = m.barLinks.find((l) => l.scan)
      if (scan && Math.abs(scan.cx - m.barBox.cx) > 1) fail(`${tag}: Scan is not centred on the bar (centre ${scan.cx.toFixed(1)}, bar centre ${m.barBox.cx.toFixed(1)})`)
      for (const l of m.barLinks) {
        if (l.w < 44 || l.h < 44) fail(`${tag}: bar button "${l.text}" is ${l.w.toFixed(0)}x${l.h.toFixed(0)}, below the 44 px target`)
        if (l.lsw > l.lcw) fail(`${tag}: bar label "${l.text}" is truncated (scrollWidth ${l.lsw} > clientWidth ${l.lcw})`)
        if (l.fs && l.lh > l.fs * 1.5) fail(`${tag}: bar label "${l.text}" wraps onto more than one line`)
      }
      if (m.barBox.left < 0 || m.barBox.right > m.barBox.vw) fail(`${tag}: bottom bar (${m.barBox.left.toFixed(0)}-${m.barBox.right.toFixed(0)}) leaves the viewport (safe-area insets)`)
    }
    if (phone && (!m.barVisible || m.railVisible)) fail(`${tag}: expected the bottom bar only (bar ${m.barVisible}, rail ${m.railVisible})`)
    if (!phone && (m.barVisible || !m.railVisible)) fail(`${tag}: expected the side rail only (bar ${m.barVisible}, rail ${m.railVisible})`)
    if (phone && m.navTop !== null && m.lastBottom !== null && m.lastBottom > m.navTop) {
      fail(`${tag}: end of page (${m.lastBottom}px) is hidden behind the bottom bar (top ${m.navTop}px)`)
    }
  }
}

ws.close()
chrome.removeAllListeners('exit')
const closed = new Promise((r) => chrome.once('exit', r))
chrome.kill()
await closed
rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
if (failures.length) {
  console.error(`check-shell-layout: ${failures.length} failure(s)\n` + failures.map((f) => '  - ' + f).join('\n'))
  process.exit(1)
}
console.log(`check-shell-layout: OK (${VIEWPORTS.length} viewports x ${ROUTES.length} routes)`)
