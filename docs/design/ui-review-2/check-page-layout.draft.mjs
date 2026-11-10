#!/usr/bin/env node
// DRAFT (UI review 2, docs/design/ui-review-2.md section 6). Not wired into scripts/check.sh.
// Page-layout guards for wide screens: complements scripts/check-shell-layout.mjs (which fakes the API and checks the shell).
// This one runs against a REAL server with seeded data, because field sizing and sticky bars only exist on loaded screens.
//
// Port: worktree-unique, never a shared fixed number (other teams run servers in parallel). Derive it from the worktree path:
//   PORT=$(( 20000 + $(printf '%s' "$PWD" | cksum | cut -d' ' -f1) % 20000 ))
//   FEEDER_DEV_LOGIN=1 FEEDER_ADMIN_EMAIL=admin@example.test FEEDER_DATA_DIR=build/data FEEDER_ADDR=127.0.0.1:$PORT \
//     setsid nohup build/feeder > build/server.log 2>&1 &          (seed it first, see ui-review-2.md "How this was reviewed")
//   node docs/design/ui-review-2/check-page-layout.draft.mjs --url http://127.0.0.1:$PORT [--chrome /usr/bin/google-chrome] [--email admin@example.test]
// --url is required (no default port), so two worktrees can never probe each other's server by accident.
//
// For every route x viewport (390, 820, 1180, 1440, 1920, 2560) it asserts:
//   P1 no sideways scroll and no visible element past the viewport's right edge (horizontal scrollers excluded);
//   P2 (>= 1024) the content is centred in the area right of the rail (|offset| <= 24 px);
//   P3 (>= 1024) the content is no wider than the route's page width (narrow 720 / default 1120 / wide 1480, + 40 px tile padding);
//   P4 (>= 820) short-value fields (inputmode numeric|decimal, role spinbutton, or data-size xs|sm) are <= 240 px wide,
//      unless the field frame says data-size="full";
//   P5 text, email and search inputs are never collapsed (>= 160 px wide);
//   P6 sticky / fixed action bars inside <main> have an opaque background and line up with the page container (+-4 px);
//   P7 the current rail item's label has >= 4.5:1 contrast against its own background;
//   P8 (>= 768) open dialogs are <= 600 px wide and horizontally centred (+-2 px).
// Exit 0 = all passed; one line per failure.
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 ? process.argv[i + 1] : fallback
}
const rawUrl = arg('url', process.env.FEEDER_URL)
if (!rawUrl) {
  console.error('check-page-layout: pass --url http://127.0.0.1:<worktree-unique port> (or FEEDER_URL); there is no default port')
  process.exit(2)
}
const base = rawUrl.replace(/\/$/, '')
const chromeBin = arg('chrome', process.env.CHROME ?? 'google-chrome')
const email = arg('email', 'admin@example.test')

const VIEWPORTS = [
  { width: 390, height: 844, mobile: true },
  { width: 820, height: 1180, mobile: false },
  { width: 1180, height: 820, mobile: false },
  { width: 1440, height: 900, mobile: false },
  { width: 1920, height: 1080, mobile: false },
  { width: 2560, height: 1440, mobile: false },
]
// Page width per route (the proposal in ui-review-2.md L-01). Ids assume the review seed; adjust to your data.
const WIDTH = { narrow: 720, default: 1120, wide: 1480 }
const ROUTES = [
  ['/', 'default'], ['/plan', 'wide'], ['/shop', 'wide'], ['/scan', 'narrow'], ['/stock', 'default'],
  ['/recipes', 'wide'], ['/recipes/3', 'default'], ['/recipes/3/edit', 'default'], ['/recipes/new', 'default'],
  ['/recipes/import', 'narrow'], ['/recipes/export', 'narrow'], ['/ingredients', 'narrow'], ['/ingredients/7', 'narrow'],
  ['/products', 'narrow'], ['/products/2', 'narrow'], ['/settings', 'narrow'], ['/settings/household', 'narrow'],
  ['/settings/members', 'narrow'], ['/settings/meal-slots', 'narrow'], ['/settings/planning', 'narrow'],
  ['/settings/shops', 'narrow'], ['/settings/shops/1', 'narrow'], ['/settings/notifications', 'narrow'],
  ['/settings/allowlist', 'narrow'], ['/settings/preferences', 'narrow'],
]

const profile = mkdtempSync(join(tmpdir(), 'page-layout-'))
const chrome = spawn(chromeBin, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--disable-gpu', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] })
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
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data)
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id)
    pending.delete(msg.id)
    msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result)
  }
}
const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
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

// Sign in once (dev login; the cookie stays in the browser profile).
await cdp('Page.navigate', { url: base + '/sign-in' })
await new Promise((r) => setTimeout(r, 1200))
await evaluate(`fetch('/api/dev/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: ${JSON.stringify(email)} }) }).then((r) => r.status)`)

const probe = `
(() => {
  const vw = innerWidth
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
    if (!vis(e)) continue
    const b = e.getBoundingClientRect()
    if (b.width < 2) continue
    if (b.right > vw + 1 && !inScroller(e)) over.push(e.tagName.toLowerCase() + '.' + String(e.className).split(' ')[0])
    if (inScroller(e) && getComputedStyle(e.parentElement).overflowX !== 'visible') { /* clipped children of scrollers do not count */ }
    minX = Math.min(minX, b.x); maxR = Math.max(maxR, Math.min(b.right, vw))
  }
  const fields = []
  for (const e of document.querySelectorAll('main input, main textarea, main [role=spinbutton]')) {
    if (!vis(e) || ['hidden', 'checkbox', 'radio', 'file'].includes(e.type)) continue
    const frame = e.closest('.ui-field') || e.closest('[data-size]') || e
    const size = frame.getAttribute('data-size') || ''
    const short = ['numeric', 'decimal'].includes(e.inputMode) || e.getAttribute('role') === 'spinbutton' || ['xs', 'sm'].includes(size)
    const segment = e.closest('.time-field, .stepper')
    fields.push({ label: (e.getAttribute('aria-label') || (e.id && document.querySelector('label[for="' + e.id + '"]')?.innerText) || e.name || '').trim().slice(0, 30), type: e.type || e.getAttribute('role'), short, segment: !!segment, size, w: Math.round(frame.getBoundingClientRect().width) })
  }
  const bars = []
  for (const e of (main ? main.querySelectorAll('*') : [])) {
    const s = getComputedStyle(e)
    if ((s.position === 'sticky' || s.position === 'fixed') && vis(e) && e.querySelector('button')) {
      const b = e.getBoundingClientRect()
      bars.push({ cls: String(e.className).split(' ')[0], x: Math.round(b.x), r: Math.round(b.right), bgAlpha: (rgb(s.backgroundColor)[3] ?? 1) })
    }
  }
  const cur = rail && vis(rail) ? rail.querySelector('[aria-current="page"]') : null
  let railContrast = null
  if (cur) { const s = getComputedStyle(cur); let bg = s.backgroundColor; if (rgb(bg)[3] === 0) bg = getComputedStyle(cur.querySelector('.side-rail__pill') || rail).backgroundColor; if (rgb(bg)[3] === 0) bg = getComputedStyle(document.body).backgroundColor; railContrast = Math.round(contrast(s.color, bg) * 100) / 100 }
  const container = main && (main.querySelector('[data-page-width]') || main)
  const cb = container.getBoundingClientRect()
  return { vw, scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth, over: over.slice(0, 3),
    content: { x: Math.round(minX), r: Math.round(maxR) }, railR: Math.round(railR), container: { x: Math.round(cb.x), r: Math.round(cb.right) },
    fields, bars, railContrast }
})()`

const dialogProbe = `(() => { const d = document.querySelector('dialog[open]'); if (!d) return null; const b = d.getBoundingClientRect(); return { x: Math.round(b.x), w: Math.round(b.width), vw: innerWidth } })()`

for (const vp of VIEWPORTS) {
  await cdp('Emulation.setDeviceMetricsOverride', { width: vp.width, height: vp.height, deviceScaleFactor: 1, mobile: vp.mobile })
  for (const [route, kind] of ROUTES) {
    const tag = `${vp.width}px ${route}`
    await cdp('Page.navigate', { url: base + route })
    await new Promise((r) => setTimeout(r, 1500))
    let m
    try { m = await evaluate(probe) } catch (e) { fail(`${tag}: could not inspect (${e.message})`); continue }
    if (m.scrollW > m.clientW) fail(`${tag}: P1 sideways scroll (scrollWidth ${m.scrollW} > ${m.clientW})`)
    if (m.over.length) fail(`${tag}: P1 elements past the right edge: ${m.over.join(', ')}`)
    if (vp.width >= 1024 && m.content.r > m.content.x) {
      const offset = Math.round((m.content.x + m.content.r) / 2 - (m.railR + m.vw) / 2)
      if (Math.abs(offset) > 24) fail(`${tag}: P2 content is off-centre by ${offset}px (content ${m.content.x}-${m.content.r}, area ${m.railR}-${m.vw})`)
      const width = m.content.r - m.content.x
      if (width > WIDTH[kind] + 40) fail(`${tag}: P3 content is ${width}px wide; a ${kind} page is at most ${WIDTH[kind]}px`)
    }
    for (const f of m.fields) {
      if (vp.width >= 820 && f.short && !f.segment && f.size !== 'full' && f.w > 240) fail(`${tag}: P4 short field "${f.label}" is ${f.w}px wide (max 240; set size="xs|sm")`)
      if (['text', 'email', 'search', 'url'].includes(f.type) && !f.short && f.w < 160) fail(`${tag}: P5 field "${f.label}" collapsed to ${f.w}px`)
    }
    for (const b of m.bars) {
      if (b.bgAlpha === 0) fail(`${tag}: P6 sticky bar .${b.cls} has a transparent background`)
      if (Math.abs(b.x - m.container.x) > 4 && Math.abs(b.r - m.container.r) > 4) fail(`${tag}: P6 sticky bar .${b.cls} (${b.x}-${b.r}) does not line up with the page container (${m.container.x}-${m.container.r})`)
    }
    if (m.railContrast !== null && m.railContrast < 4.5) fail(`${tag}: P7 current rail item contrast ${m.railContrast}:1 (< 4.5)`)
    if (vp.width >= 768) {
      const d = await evaluate(dialogProbe).catch(() => null)
      if (d && (d.w > 600 || Math.abs(d.x + d.w / 2 - d.vw / 2) > 2)) fail(`${tag}: P8 dialog ${d.w}px wide at x=${d.x}`)
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
  console.error(`check-page-layout: ${failures.length} failure(s)\n` + failures.map((f) => '  - ' + f).join('\n'))
  process.exit(1)
}
console.log(`check-page-layout: OK (${VIEWPORTS.length} viewports x ${ROUTES.length} routes)`)
