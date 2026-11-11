#!/usr/bin/env node
// Page-layout guard (R2-L; design: docs/dev/design/r2l-page-layout.md section 5). Normally run through scripts/check-page-layout.sh,
// which builds and starts a worktree-unique server, seeds it and maps the findings to warn/fail per route.
//   node scripts/check-page-layout.mjs --url http://127.0.0.1:<port> [--profile quick|full] [--ids build/page-layout-ids.json]
//                                      [--chrome /usr/bin/google-chrome] [--email admin@example.test]
// --url is required (no default port), so two worktrees can never probe each other's server by accident.
// For every route x viewport it asserts P1..P9 (scripts/lib/page-layout-rules.mjs). Prints one line per finding
// ("  - <w>px <route>: <rule> ...") and exits 1 on any; exit 2 = usage or environment trouble (the wrapper only warns about that).
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PROFILES, ROUTES, evaluateMetrics, resolveRoute } from './lib/page-layout-rules.mjs'

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
const profileName = arg('profile', 'quick')
const VIEWPORTS = PROFILES[profileName]
if (!VIEWPORTS) {
  console.error(`check-page-layout: unknown --profile "${profileName}" (quick|full)`)
  process.exit(2)
}
const chromeBin = arg('chrome', process.env.CHROME ?? 'google-chrome')
const email = arg('email', 'admin@example.test')
let ids = { recipeId: 1, ingredientId: 1, productId: 1, shopId: 1 }
try {
  ids = { ...ids, ...JSON.parse(readFileSync(arg('ids', 'build/page-layout-ids.json'), 'utf8')) }
} catch {
  /* no ids file: :id routes use 1 and may show their not-found state, which is still a layout */
}

const profile = mkdtempSync(join(tmpdir(), 'page-layout-'))
const flags = ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--disable-gpu', 'about:blank']
if (process.getuid && process.getuid() === 0) flags.unshift('--no-sandbox')
const chrome = spawn(chromeBin, flags, { stdio: ['ignore', 'ignore', 'pipe'], detached: false })
// Chrome never outlives this process, whatever way it ends.
const cleanup = () => {
  try {
    chrome.kill('SIGKILL')
  } catch {
    /* already gone */
  }
  try {
    rmSync(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
  } catch {
    /* best effort */
  }
}
process.on('exit', cleanup)
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => process.exit(130))
chrome.on('error', (e) => {
  console.error(`check-page-layout: cannot start Chrome (${e.message})`)
  process.exit(2)
})

const failures = []
const fail = (msg) => failures.push(msg)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let wsUrl
try {
  wsUrl = await new Promise((resolve, reject) => {
    let buf = ''
    chrome.stderr.on('data', (d) => {
      buf += d
      const m = /DevTools listening on (ws:\/\/\S+)/.exec(buf)
      if (m) resolve(m[1])
    })
    chrome.on('exit', () => reject(new Error('Chrome exited before DevTools was ready')))
    setTimeout(() => reject(new Error('timed out waiting for Chrome')), 15000)
  })
} catch (e) {
  console.error(`check-page-layout: ${e.message}`)
  process.exit(2)
}
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
  } else if (msg.method === 'Page.javascriptDialogOpening') {
    // A "Leave site?" (beforeunload) or confirm dialog freezes the renderer until it is answered (~58 s in headless): accept at once.
    send('Page.handleJavaScriptDialog', { accept: true }, msg.sessionId).catch(() => {})
  }
}
const send = (method, params = {}, sessionId) =>
  new Promise((resolve, reject) => {
    const id = nextId++
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params, sessionId }))
    if (process.env.PAGE_LAYOUT_DEBUG) {
      const t = Date.now()
      setTimeout(() => pending.has(id) && console.error(`   slow ${method} still pending after ${Date.now() - t}ms`), 3000)
    }
  })
// One fresh tab per page (same browser context, so the login cookie is shared): reusing a tab froze its renderer for ~58 s now and then.
let targetId
let sessionId
const cdp = (method, params) => send(method, params, sessionId)
const openTab = async () => {
  ;({ targetId } = await send('Target.createTarget', { url: 'about:blank' }))
  ;({ sessionId } = await send('Target.attachToTarget', { targetId, flatten: true }))
  await cdp('Page.enable')
  await cdp('Network.enable')
  await cdp('Network.setBypassServiceWorker', { bypass: true })
}
const closeTab = async () => {
  await send('Target.closeTarget', { targetId }).catch(() => {})
}
await openTab()
const evaluate = async (expression) => {
  const r = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description ?? ''))
  return r.result.value
}

// Sign in once (dev login; the cookie stays in the browser profile).
await cdp('Page.navigate', { url: base + '/sign-in' })
await sleep(1200)
await evaluate(
  `fetch('/api/dev/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: ${JSON.stringify(email)} }) }).then((r) => r.status)`,
)

// Settle poll: load complete and nothing busy or skeleton-shaped for 300 ms, 5 s cap.
const settle = async () => {
  await sleep(150)
  const deadline = Date.now() + 5000
  let quietSince = 0
  while (Date.now() < deadline) {
    const idle = await evaluate(`document.readyState === 'complete' && !document.querySelector('[aria-busy="true"], .skeleton')`).catch(() => false)
    if (idle) {
      quietSince ||= Date.now()
      if (Date.now() - quietSince >= 300) return
    } else quietSince = 0
    await sleep(100)
  }
}

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
    if (e.hasAttribute('data-page-width')) continue // the container itself: its padding is the gutter, not content
    if (!vis(e)) continue
    const b = e.getBoundingClientRect()
    if (b.width < 2) continue
    if (b.right > vw + 1 && !inScroller(e)) over.push(e.tagName.toLowerCase() + '.' + String(e.className).split(' ')[0])
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
  const pageEl = main && main.querySelector('[data-page-width]')
  const container = pageEl || main
  const cb = container.getBoundingClientRect()
  return { vw, scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth, over: over.slice(0, 3),
    content: { x: Math.round(minX === 1e9 ? 0 : minX), r: Math.round(maxR) }, railR: Math.round(railR), container: { x: Math.round(cb.x), r: Math.round(cb.right) },
    pageWidthAttr: pageEl ? pageEl.getAttribute('data-page-width') : null,
    fields, bars, railContrast, dialog: null }
})()`
const dialogProbe = `(() => { const d = document.querySelector('dialog[open]'); if (!d) return null; const b = d.getBoundingClientRect(); return { x: Math.round(b.x), w: Math.round(b.width), vw: innerWidth } })()`

const started = Date.now()
for (const vp of VIEWPORTS) {
  for (const [pattern, kind] of ROUTES) {
    if (process.env.PAGE_LAYOUT_ONLY && !new RegExp(process.env.PAGE_LAYOUT_ONLY).test(pattern)) continue
    const route = resolveRoute(pattern, ids)
    const tag = `${vp.width}px ${route}`
    const t0 = Date.now()
    try {
      await closeTab()
      await openTab()
      await cdp('Emulation.setDeviceMetricsOverride', { width: vp.width, height: vp.height, deviceScaleFactor: 1, mobile: vp.mobile })
      await Promise.race([cdp('Page.navigate', { url: base + route }), sleep(4000)])
      await settle()
      if (process.env.PAGE_LAYOUT_DEBUG) console.error(`   at ${await evaluate('location.pathname + " " + document.readyState')}`)
      const m = await evaluate(probe)
      if (vp.width >= 768) m.dialog = await evaluate(dialogProbe).catch(() => null)
      for (const f of evaluateMetrics(m, { width: vp.width, route, kind })) fail(`${tag}: ${f.message}`)
      if (process.env.PAGE_LAYOUT_DEBUG) console.error(`  ${tag} ${Date.now() - t0}ms`)
    } catch (e) {
      // A probe that cannot run is an environment problem, not a layout finding: say so without a finding line.
      console.error(`check-page-layout: could not inspect ${tag} (${e.message})`)
    }
  }
}

ws.close()
cleanup()
const seconds = Math.round((Date.now() - started) / 1000)
if (failures.length) {
  console.log(`check-page-layout: ${failures.length} failure(s) (${profileName} profile, ${seconds}s)\n` + failures.map((f) => '  - ' + f).join('\n'))
  process.exit(1)
}
console.log(`check-page-layout: OK (${VIEWPORTS.length} viewports x ${ROUTES.length} routes, ${seconds}s)`)
