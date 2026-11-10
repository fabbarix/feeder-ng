#!/usr/bin/env node
// Browser check of the shell layout (WP5 acceptance). Not part of scripts/check.sh: it needs Chrome and a running Vite dev server.
//   pnpm -C web dev --port 5199 &            (start it detached, log to build/)
//   node scripts/check-shell-layout.mjs --url http://localhost:5199 [--chrome /usr/bin/google-chrome]
// It drives Chrome over the DevTools protocol (no extra dependency; Node 22+ has WebSocket), fakes GET /api/me so the shell renders,
// and for every route at 390, 820 and 1280 px wide asserts:
//   1. document.documentElement.scrollWidth <= clientWidth (= innerWidth without a scrollbar): no sideways scroll;
//   2. scrolled to the end, the last element of the page ends above the nav (bottom bar < 1024, none hidden behind it);
//   3. /board and /cook/* have no nav and their <main> spans the viewport width (>= 900: the old 220 px column is gone);
//   4. ordinary routes: the current tab has aria-current="page"; the bottom bar (< 1024) or side rail (>= 1024) is visible, not both;
//   5. an unknown route shows "Page not found" and not the router's dev error page.
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
  { width: 390, height: 844, mobile: true },
  { width: 820, height: 1180, mobile: false },
  { width: 1280, height: 800, mobile: false },
]
const ROUTES = ['/', '/plan', '/scan', '/shop', '/recipes', '/stock', '/settings', '/board', '/cook/1', '/this-route-does-not-exist']
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

const page = `
(() => {
  const q = (s) => document.querySelector(s)
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
    mainWidth: main ? Math.round(main.getBoundingClientRect().width) : null,
    hasBar: !!bar, barVisible: visible(bar), railVisible: visible(rail),
    lastBottom: last ? Math.round(last.getBoundingClientRect().bottom) : null,
    navTop: nav ? Math.round(nav.getBoundingClientRect().top) : null,
    current: [...document.querySelectorAll('nav [aria-current="page"]')].map((a) => a.textContent.trim()),
    notFound: /Page not found/.test(document.body.innerText),
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
    } else if (m.current.length === 0 && route !== '/stock' && route !== '/settings') {
      fail(`${tag}: no tab has aria-current="page"`)
    }
    const phone = vp.width < 1024
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
