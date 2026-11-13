#!/usr/bin/env node
// Page-layout guard (R2-L; design: docs/dev/design/r2l-page-layout.md section 5). Normally run through scripts/check-page-layout.sh,
// which builds and starts a worktree-unique server, seeds it and maps the findings to warn/fail per route.
//   node scripts/check-page-layout.mjs --url http://127.0.0.1:<port> [--profile quick|full] [--ids build/page-layout-ids.json]
//                                      [--chrome /usr/bin/google-chrome] [--email admin@example.test]
// --url is required (no default port), so two worktrees can never probe each other's server by accident.
// For every route x viewport it asserts P1..P9 (scripts/lib/page-layout-rules.mjs). Prints one line per finding
// ("  - <w>px <route>: <rule> ...") and one per probe that was not inspected ("  ! <w>px <route>: not inspected (<reason>)").
// Every route x viewport must be inspected: a probe that cannot run fails the guard unless its route is exempt
// (scripts/check-page-layout.exempt, or --exempt FILE). Exit 1 on any finding or failing not-inspected entry, never OK then;
// exit 2 = usage or environment trouble (the wrapper treats that as not run). Design: docs/dev/design/b5-pl.md.
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PROFILES, ROUTES, RESIZE_SWEEP, RESIZE_WALKS, SCENARIOS, darkButtonFindings, evaluateMetrics, resizeSweepWidths, resizeWalkFindings, resizeWalkWidths, resolveRoute, resolveScenario } from './lib/page-layout-rules.mjs'
import { coverageSummary, notInspectedLine, parseExemptions } from './lib/page-layout-coverage.mjs'

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
const idsPath = arg('ids', 'build/page-layout-ids.json')
let exemptions
try {
  const exemptPath = arg('exempt', join(dirname(fileURLToPath(import.meta.url)), 'check-page-layout.exempt'))
  exemptions = parseExemptions(readFileSync(exemptPath, 'utf8'))
} catch (e) {
  console.error(`check-page-layout: ${e.message}`)
  process.exit(2)
}
let ids = { recipeId: 1, ingredientId: 1, productId: 1, shopId: 1 }
try {
  ids = { ...ids, ...JSON.parse(readFileSync(idsPath, 'utf8')) }
} catch {
  /* no ids file: :id routes use 1 and may show their not-found state, which is still a layout */
}

// The Chrome profile lives next to the ids file (the worktree's build dir), never in the system tmp dir; stale ones of crashed runs are swept first.
// The sweep is safe only under the lock: scripts/check-page-layout.sh holds $BUILD/page-layout.lock (flock) for its whole run, so no other
// run in this build dir can be removing or using a profile dir at the same time. Run this driver by hand only when no wrapper run is active.
const profileRoot = dirname(idsPath)
mkdirSync(profileRoot, { recursive: true })
for (const name of readdirSync(profileRoot)) {
  if (name.startsWith('page-layout-chrome-')) rmSync(join(profileRoot, name), { recursive: true, force: true })
}
const profile = mkdtempSync(join(profileRoot, 'page-layout-chrome-'))
const flags = ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--disable-gpu', 'about:blank']
if (process.getuid && process.getuid() === 0) flags.unshift('--no-sandbox')
// Own process group, so the zygote and renderers die with the browser and cannot write into the profile while it is removed.
const chrome = spawn(chromeBin, flags, { stdio: ['ignore', 'ignore', 'pipe'], detached: true })
const killChrome = () => {
  for (const target of [-chrome.pid, chrome.pid]) {
    try {
      if (target) process.kill(target, 'SIGKILL')
    } catch {
      /* already gone */
    }
  }
}
const removeProfile = () => {
  try {
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  } catch {
    /* best effort */
  }
}
let chromeGone = false
const chromeExited = new Promise((resolve) => {
  chrome.on('exit', () => {
    chromeGone = true
    resolve()
  })
  chrome.on('error', () => resolve())
})
// Orderly end: kill Chrome, WAIT for it to exit (so it cannot recreate files), remove the profile, then leave.
const die = async (code) => {
  killChrome()
  if (!chromeGone) await Promise.race([chromeExited, new Promise((r) => setTimeout(r, 3000))])
  removeProfile()
  process.exit(code)
}
// Last resort for any other way out (crashes): synchronous kill and removal.
process.on('exit', () => {
  killChrome()
  removeProfile()
})
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => die(130))
chrome.on('error', (e) => {
  console.error(`check-page-layout: cannot start Chrome (${e.message})`)
  die(2)
})

const failures = []
const fail = (msg) => failures.push(msg)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Every wait is bounded (the wrapper adds an overall limit on top): one hung CDP call must not eat the whole run.
const CDP_TIMEOUT_MS = Number(process.env.PAGE_LAYOUT_CDP_TIMEOUT_MS) || 20000
const CHROME_TIMEOUT_MS = Number(process.env.PAGE_LAYOUT_CHROME_TIMEOUT_MS) || 15000
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
    setTimeout(() => reject(new Error('timed out waiting for Chrome')), CHROME_TIMEOUT_MS)
  })
} catch (e) {
  console.error(`check-page-layout: ${e.message}`)
  await die(2)
}
let ws
try {
  ws = new WebSocket(wsUrl)
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timed out opening the DevTools WebSocket')), CDP_TIMEOUT_MS)
    ws.onopen = () => {
      clearTimeout(t)
      resolve()
    }
    ws.onerror = () => {
      clearTimeout(t)
      reject(new Error('the DevTools WebSocket failed to open'))
    }
  })
} catch (e) {
  console.error(`check-page-layout: ${e.message}`)
  await die(2)
}
let nextId = 1
const pending = new Map()
// hf-recipes-filter round 3 (P21): the errors the current page logs (an uncaught exception, a console error, a JavaScript log error).
const runtimeEvents = []
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data)
  if (msg.method && msg.sessionId === sessionId) {
    const p = msg.params ?? {}
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = p.exceptionDetails ?? {}
      runtimeEvents.push({ why: 'exception', text: String(d.exception?.description ?? d.text ?? '').split('\n')[0].slice(0, 200) })
    } else if (msg.method === 'Runtime.consoleAPICalled' && p.type === 'error') {
      runtimeEvents.push({ why: 'console', text: (p.args ?? []).map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 200) })
    } else if (msg.method === 'Log.entryAdded' && p.entry?.level === 'error' && p.entry?.source === 'javascript') {
      runtimeEvents.push({ why: 'log', text: String(p.entry.text ?? '').slice(0, 200) })
    }
  }
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id)
    pending.delete(msg.id)
    msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result)
  } else if (msg.method === 'Page.javascriptDialogOpening') {
    // A "Leave site?" (beforeunload) or confirm dialog freezes the renderer until it is answered (~58 s in headless): accept at once.
    send('Page.handleJavaScriptDialog', { accept: true }, msg.sessionId).catch(() => {})
  } else if (msg.method === 'Fetch.requestPaused') {
    pinBoardPhase(msg.params ?? {}, msg.sessionId)
  }
}

// pantry-filter review: the kitchen board's scheme comes from the server's day/night phase (dark from sunset to sunrise, or 19:00 to
// 07:00 household time without a location), not from prefers-color-scheme, so its dark pass depended on the hour the guard ran. The
// guard pins the phase instead: every /api/board answer says dark while the dark pass runs and light otherwise (BOARD_PHASE), and its
// next change a day away, so the board's own phase timer never fires during a probe.
const BOARD_PHASE = { dark: false }
const pinBoardPhase = async (p, sid) => {
  try {
    const { body, base64Encoded } = await send('Fetch.getResponseBody', { requestId: p.requestId }, sid)
    const data = JSON.parse(base64Encoded ? Buffer.from(body, 'base64').toString('utf8') : body)
    if (data && typeof data.theme === 'object' && data.theme !== null) {
      data.theme = { ...data.theme, dark: BOARD_PHASE.dark, nextChangeAt: new Date(Date.now() + 86400e3).toISOString() }
    }
    // The body is handed over decoded and re-encoded here, so the original length and encoding no longer apply.
    const responseHeaders = (p.responseHeaders ?? []).filter((h) => !/^(content-length|content-encoding)$/i.test(h.name))
    await send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: p.responseStatusCode ?? 200, responseHeaders, body: Buffer.from(JSON.stringify(data)).toString('base64') }, sid)
  } catch {
    // Not JSON or no body (an error answer): it goes through as it came.
    await send('Fetch.continueRequest', { requestId: p.requestId }, sid).catch(() => {})
  }
}
const send = (method, params = {}, sessionId) =>
  new Promise((resolve, reject) => {
    const id = nextId++
    const timer = setTimeout(() => {
      pending.delete(id)
      reject(new Error(`CDP ${method} timed out after ${CDP_TIMEOUT_MS}ms`))
    }, CDP_TIMEOUT_MS)
    pending.set(id, {
      resolve: (v) => (clearTimeout(timer), resolve(v)),
      reject: (e) => (clearTimeout(timer), reject(e)),
    })
    try {
      ws.send(JSON.stringify({ id, method, params, sessionId }))
    } catch (e) {
      clearTimeout(timer)
      pending.delete(id)
      reject(e)
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
  await cdp('Runtime.enable')
  await cdp('Log.enable')
  await cdp('Network.enable')
  await cdp('Network.setBypassServiceWorker', { bypass: true })
  // pantry-filter review: /api/board answers are paused at the response, so pinBoardPhase can pin the board's day/night phase.
  await cdp('Fetch.enable', { patterns: [{ urlPattern: '*/api/board', requestStage: 'Response' }] })
}
const closeTab = async () => {
  await send('Target.closeTarget', { targetId }).catch(() => {})
}
const evaluate = async (expression) => {
  const r = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description ?? ''))
  return r.result.value
}

// Sign in once (dev login; the cookie stays in the browser profile).
try {
  await openTab()
  await cdp('Page.navigate', { url: base + '/sign-in' })
  await sleep(1200)
  await evaluate(
    `fetch('/api/dev/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: ${JSON.stringify(email)} }) }).then((r) => r.status)`,
  )
} catch (e) {
  // Environment trouble (no server, hung CDP), not a layout finding: exit 2, which the wrapper FAILS on in every mode (lost coverage).
  console.error(`check-page-layout: could not start the session (${e.message})`)
  await die(2)
}

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
// DS-TODAY round 2 (P15, system.md 10): an action group that collapsed to 0 px, a button narrower than its label, or text that
// runs under the group. Measured in the page for every .action-group and .plan-course__actions; fails in every mode.
const actionProbe = `
(() => {
  const main = document.querySelector('main')
  const vis = (e) => { const b = e.getBoundingClientRect(); const s = getComputedStyle(e); return b.width > 2 && b.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' }
  const sel = (e) => e.tagName.toLowerCase() + '.' + String(e.className).split(' ')[0]
  const out = []
  for (const g of (main ? main.querySelectorAll('.action-group, .plan-course__actions') : [])) {
    if (!vis(g)) continue
    const gb = g.getBoundingClientRect()
    if (gb.width < 1) { out.push({ sel: sel(g), why: 'collapsed', px: 0 }); continue }
    for (const b of g.querySelectorAll('button')) {
      const over = b.scrollWidth - b.clientWidth
      // A labelled button only: an icon button's 44 px hit area is a pseudo-element that overhangs its 40 px box on purpose.
      if (vis(b) && over > 1 && b.textContent.trim() !== '') out.push({ sel: sel(b), why: 'label-clipped', px: Math.round(over) })
    }
    const row = g.parentElement
    for (const t of (row ? row.querySelectorAll('.to-confirm__text, .to-confirm__title, .to-confirm__meta, .plan-course__what') : [])) {
      if (!vis(t) || t.contains(g) || g.contains(t)) continue
      const tb = t.getBoundingClientRect()
      const w = Math.min(tb.right, gb.right) - Math.max(tb.left, gb.left)
      const h = Math.min(tb.bottom, gb.bottom) - Math.max(tb.top, gb.top)
      if (w > 1 && h > 1) out.push({ sel: sel(t), why: 'overlaps-actions', px: Math.round(w) })
    }
  }
  return out
})()`
// P12 (DS-A round 2, system.md 8): the probe is scripts/lib/page-layout-nav-probe.js (feederNavProbe), shared with the static
// fixtures of scripts/test/ds-layout_test.sh. It is evaluated in the page below (m.navOverlap).
const navProbeSource = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'lib', 'page-layout-nav-probe.js'), 'utf8')

// P13 (DS-A round 2, system.md 10): a box whose content is wider than its tile or card (.tile, .list-group) and spills past it. A scroll
// container (overflow-x auto or scroll) between the box and its card is intentional and not counted; clipping by overflow hidden is.
const tileProbe = `
(() => {
  const main = document.querySelector('main')
  const vis = (e) => { const b = e.getBoundingClientRect(); const s = getComputedStyle(e); return b.width > 2 && b.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' }
  // round 3: named by the class attribute (an svg's className is an SVGAnimatedString)
  const sel = (e) => e.tagName.toLowerCase() + '.' + (e.getAttribute('class') || '').split(' ')[0]
  const out = []
  for (const card of (main ? main.querySelectorAll('.tile, .list-group') : [])) {
    if (!vis(card)) continue
    const cs = getComputedStyle(card)
    const edge = card.getBoundingClientRect().right - parseFloat(cs.paddingRight) - parseFloat(cs.borderRightWidth)
    for (const d of card.querySelectorAll('*')) {
      if (!vis(d)) continue
      const over = d.getBoundingClientRect().right - edge
      if (over <= 1) continue
      // round 3: only in-flow spills count. A position: absolute or fixed box (a corner menu in the tile's padding) is not one, and
      // neither is anything inside it; a scroll container (overflow-x auto / scroll) between the box and its card is intentional.
      let scrolled = false
      for (let p = d; p && p !== card; p = p.parentElement) {
        const ps = getComputedStyle(p).position
        if (ps === 'absolute' || ps === 'fixed') { scrolled = true; break }
      }
      for (let p = d.parentElement; !scrolled && p && p !== card; p = p.parentElement) {
        const o = getComputedStyle(p).overflowX
        if (o === 'auto' || o === 'scroll') { scrolled = true; break }
      }
      if (!scrolled) out.push({ sel: sel(d), card: sel(card), px: Math.round(over) })
    }
  }
  return out.slice(0, 3)
})()`

// P14 (ds-plan round 3): a chip whose label is cut by its ellipsis while its chip line still has room to spare. A chip cut because the
// line is really full is not a finding: the spare room is what the line has left after its chips (and their gaps).
const chipProbe = `
(() => {
  const main = document.querySelector('main')
  const vis = (e) => { const b = e.getBoundingClientRect(); const s = getComputedStyle(e); return b.width > 2 && b.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' }
  const sel = (e) => e.tagName.toLowerCase() + '.' + String(e.className).split(' ')[0]
  const out = []
  for (const label of (main ? main.querySelectorAll('.chip .chip__label') : [])) {
    const chip = label.closest('.chip')
    if (!chip || !vis(label) || label.scrollWidth <= label.clientWidth + 1) continue
    if (getComputedStyle(label).textOverflow !== 'ellipsis') continue
    const line = chip.parentElement
    const cs = getComputedStyle(line)
    const inner = line.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
    const kids = [...line.children]
    const used = kids.reduce((n, k) => n + k.getBoundingClientRect().width, 0) + (parseFloat(cs.columnGap) || 0) * Math.max(0, kids.length - 1)
    const room = Math.round(inner - used)
    if (room > 8) out.push({ sel: sel(chip), label: label.textContent.trim().slice(0, 60), room })
  }
  return out.slice(0, 5)
})()`

// hf-recipes-filter (P16): a visible chip whose label is crushed: the chip is on screen, its label is cut by its ellipsis, and the label is
// narrower than 24 px while its text is longer. The chip is what is checked for visibility, not the label: a label squeezed to 0 px is
// hidden by its own box and would otherwise be skipped.
const crushedProbe = `
(() => {
  const main = document.querySelector('main')
  const vis = (e) => { const b = e.getBoundingClientRect(); const s = getComputedStyle(e); return b.width > 2 && b.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' }
  const sel = (e) => e.tagName.toLowerCase() + '.' + String(e.className).split(' ')[0]
  const out = []
  for (const chip of (main ? main.querySelectorAll('.chip') : [])) {
    if (!vis(chip)) continue
    const label = chip.querySelector('.chip__label')
    if (!label || !(label.clientWidth < 24) || label.scrollWidth <= label.clientWidth + 1) continue
    if (getComputedStyle(label).textOverflow !== 'ellipsis') continue
    out.push({ sel: sel(chip), label: label.textContent.trim().slice(0, 60), px: Math.round(label.clientWidth) })
  }
  return out.slice(0, 5)
})()`

// P10 (run once per colour scheme): a visible, enabled Button label against the first non-transparent background at or above it (alpha is ignored, as in rule P7).
const buttonProbe = `
(() => {
  const main = document.querySelector('main')
  const vis = (e) => { const b = e.getBoundingClientRect(); const s = getComputedStyle(e); return b.width > 0 && b.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' }
  const rgb = (c) => (c.match(/[\\d.]+/g) || []).map(Number)
  const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
  const contrast = (a, b) => { const [x, y] = [lum(rgb(a)), lum(rgb(b))].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
  const bgOf = (e) => { for (let p = e; p; p = p.parentElement) { const c = getComputedStyle(p).backgroundColor; if (rgb(c)[3] !== 0) return c } return getComputedStyle(document.body).backgroundColor }
  const low = []
  for (const b of (main ? main.querySelectorAll('.button:not(:disabled)') : [])) {
    if (!vis(b)) continue
    const ratio = Math.round(contrast(getComputedStyle(b).color, bgOf(b)) * 100) / 100
    if (ratio < 4.5) low.push({ label: b.innerText.trim().slice(0, 40), ratio })
  }
  return low
})()`
const dialogProbe = `(() => { const d = document.querySelector('dialog[open]'); if (!d) return null; const b = d.getBoundingClientRect(); return { x: Math.round(b.x), w: Math.round(b.width), vw: innerWidth } })()`


// hf-recipes-filter round 2 (P17 to P20, docs/design/recipes-filter.md 13.6). Each probe is empty on a page without the header.
// P17: a chip line (.filter-chips, the Recipes and the Pantry header) shows a chip cut after its first one, or a chip past its end.
const fitLinesProbe = `
(() => {
  const main = document.querySelector('main')
  const sel = (e) => e.tagName.toLowerCase() + '.' + String(e.className).split(' ')[0]
  const out = []
  for (const line of (main ? main.querySelectorAll('.filter-chips') : [])) {
    const lr = line.getBoundingClientRect()
    if (lr.width <= 2) continue
    const chips = [...line.children].filter((c) => c.classList.contains('chip'))
    chips.forEach((chip, i) => {
      const r = chip.getBoundingClientRect()
      const label = chip.querySelector('.chip__label')
      const text = label ? label.textContent.trim().slice(0, 60) : ''
      const cut = label ? label.scrollWidth - label.clientWidth : 0
      if (r.width > 2 && r.right > lr.right + 1) out.push({ sel: sel(line), label: text, why: 'spill', px: Math.round(r.right - lr.right) })
      else if (i > 0 && cut > 1) out.push({ sel: sel(line), label: text, why: 'cut', px: Math.round(label.clientWidth) })
    })
  }
  return out.slice(0, 5)
})()`

// P18: a focus ring (3 px outline, 2 px offset) or a removable chip's hit area (its ::before, reaching past it) cut by a clipping
// ancestor. Each chip is focused with focusVisible so its ring is drawn. A chip scrolled partly out of its own scroll container is skipped.
const clippedRingsProbe = `
(() => {
  const main = document.querySelector('main')
  if (!main) return []
  const sel = (e) => e.tagName.toLowerCase() + '.' + String(e.className).split(' ')[0]
  const bounds = (el) => {
    const out = []
    for (let p = el.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
      // A dialog or a popover is in the top layer: the page's ancestors above it do not clip it.
      if (p.matches('dialog, [popover]')) break
      const s = getComputedStyle(p)
      const xClip = s.overflowX !== 'visible', yClip = s.overflowY !== 'visible'
      if (!xClip && !yClip) continue
      const r = p.getBoundingClientRect()
      const l = r.left + p.clientLeft, t = r.top + p.clientTop
      const m = parseFloat(s.overflowClipMargin) || 0
      const mx = s.overflowX === 'clip' ? m : 0, my = s.overflowY === 'clip' ? m : 0
      out.push({ l: xClip ? l - mx : -Infinity, r: xClip ? l + p.clientWidth + mx : Infinity, t: yClip ? t - my : -Infinity, b: yClip ? t + p.clientHeight + my : Infinity, scroller: out.length === 0 })
    }
    return out
  }
  const worst = (rect, list) => Math.max(0, ...list.map((c) => Math.max(c.l - rect.l, rect.r - c.r, c.t - rect.t, rect.b - c.b)))
  const out = []
  // The chip line of both headers, and the chip lines of an open Filters panel (Course; the Pantry's Show and Kind).
  const targets = [...main.querySelectorAll('.filter-chips > .chip, .course-filter > .chip, .filter-chip-group > .chip')]
  for (const el of targets) {
    if (el.getBoundingClientRect().width <= 2) continue
    el.focus({ focusVisible: true })
    const r = el.getBoundingClientRect()
    const list = bounds(el)
    const scroller = list.find((c) => c.scroller)
    if (scroller && (r.left < scroller.l - 0.5 || r.right > scroller.r + 0.5)) continue
    const label = el.textContent.trim().slice(0, 40)
    const ring = worst({ l: r.left - 5, r: r.right + 5, t: r.top - 5, b: r.bottom + 5 }, list)
    if (Math.round(ring) >= 1) out.push({ sel: sel(el), label, what: 'focus ring', px: Math.round(ring) })
    const before = getComputedStyle(el, '::before')
    if (el.matches('.chip[data-removable]') && before.position === 'absolute') {
      const ext = Math.max(0, -parseFloat(before.top) || 0, -parseFloat(before.bottom) || 0)
      const hit = worst({ l: r.left, r: r.right, t: r.top - ext, b: r.bottom + ext }, list)
      if (ext > 0 && Math.round(hit) >= 1) out.push({ sel: sel(el), label, what: 'hit area', px: Math.round(hit) })
    }
  }
  if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur()
  return out.slice(0, 8)
})()`

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

// P20: row 3 (the chip line) sits one slot gap below row 2 (the gap of the header's own stack, .filter-bar, or the ListPage's), and the
// panel's sections are spaced.
const filterSpacingProbe = `
(() => {
  const row2 = document.querySelector('.filter-bar__view-row'), row3 = document.querySelector('.filter-chips')
  const stack = row3 ? row3.closest('.filter-bar, .list-page') : null
  const slotGap = stack ? parseFloat(getComputedStyle(stack).rowGap) : NaN
  let rowGap = null
  if (row2 && row3 && row3.getBoundingClientRect().height > 0) rowGap = Math.round((row3.getBoundingClientRect().top - row2.getBoundingClientRect().bottom) * 10) / 10
  const sections = [...document.querySelectorAll('.filter-panel__section')]
  const sectionGap = sections.length >= 2 ? Math.round((sections[1].getBoundingClientRect().top - sections[0].getBoundingClientRect().bottom) * 10) / 10 : null
  if (rowGap === null && sectionGap === null) return null
  return { rowGap, slotGap, sectionGap }
})()`

// pantry-filter review (P22): a chip Select (a toolbar picker: the Sort of both filter headers, Shop's) whose value is cut by its ellipsis.
// The value's text is measured with a Range (its laid-out width, whatever the ellipsis paints) and by its scroll overflow.
const cutSelectProbe = `
(() => {
  const main = document.querySelector('main')
  const out = []
  for (const v of (main ? main.querySelectorAll('.select__trigger[data-appearance="chip"] .select__value') : [])) {
    if (v.getClientRects().length === 0) continue
    const box = v.getBoundingClientRect()
    const range = document.createRange()
    range.selectNodeContents(v)
    const cut = Math.max(v.scrollWidth - v.clientWidth, range.getBoundingClientRect().width - box.width)
    if (cut > 0.5) out.push({ sel: 'button.select__trigger', label: v.textContent.trim(), shown: Math.round(box.width), px: Math.round(cut) })
  }
  return out
})()`

// Probes that did not run, one entry per route x viewport: {width, route, pattern, reason}.
const notInspected = []
let probes = 0
const started = Date.now()
/** One page at one width: navigate, settle, run every probe and report its findings; open = the Filters panel is opened first (hf-recipes-filter SCENARIOS). */
async function probePage(vp, route, pattern, kind, open) {
  probes++
  const tag = `${vp.width}px ${route}`
  const t0 = Date.now()
  // One entry per probe, whichever step failed first.
  let missed = false
  const miss = (reason, label = route) => {
    if (missed) return
    missed = true
    notInspected.push({ width: vp.width, route: label, pattern, reason })
  }
  try {
    await closeTab()
    await openTab()
    await cdp('Emulation.setDeviceMetricsOverride', { width: vp.width, height: vp.height, deviceScaleFactor: 1, mobile: vp.mobile })
    await Promise.race([cdp('Page.navigate', { url: base + route }), sleep(4000)])
    await settle()
    if (process.env.PAGE_LAYOUT_DEBUG) console.error(`   at ${await evaluate('location.pathname + " " + document.readyState')}`)
    if (open) {
      // The Filters button of the header (the Recipes and the Pantry scenarios): opened before the probes, so the panel is measured.
      await evaluate("document.querySelector('.filter-bar__search-row > .button')?.click()")
      await settle()
    }
    const m = await evaluate(probe)
    if (!m.hasMain) {
      miss(`no <main> element (${m.title || m.text || 'empty page'})`)
      return
    }
    m.lowContrastButtons = await evaluate(buttonProbe)
    m.navOverlap = await evaluate(`(() => { ${navProbeSource}\n; return feederNavProbe() })()`)
    m.tileOverflow = await evaluate(tileProbe)
    Object.assign(m, { clippedChips: await evaluate(chipProbe), crushedChips: await evaluate(crushedProbe) })
    m.actionLayout = await evaluate(actionProbe)
    m.dialog = vp.width >= 768 ? await evaluate(dialogProbe).catch(() => null) : null
    // hf-recipes-filter round 2: the chip line, its focus rings and hit areas, the popover's alignment and the header's spacing.
    Object.assign(m, {
      fitLines: await evaluate(fitLinesProbe),
      clippedRings: await evaluate(clippedRingsProbe),
      popoverAlign: await evaluate(popoverAlignProbe),
      filterSpacing: await evaluate(filterSpacingProbe),
      cutSelects: await evaluate(cutSelectProbe),
    })
    // The light findings are reported first, on the light page.
    for (const f of evaluateMetrics(m, { width: vp.width, route, kind })) fail(`${tag}: ${f.message}`)
    // FU-4: the dark P10 pass runs after the light findings; only its P10 findings are reported, and a dark pass that did not run is not inspected.
    // The scheme is put back to light in the finally, whatever happens.
    try {
      // ThemeProvider reads the system scheme once at render, so the page is reloaded under the emulation and settled first. The
      // board takes its scheme from the server's phase, which is pinned to dark for this pass (pinBoardPhase).
      BOARD_PHASE.dark = true
      await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] })
      await Promise.race([cdp('Page.reload', {}), sleep(4000)])
      await settle()
      if (!(await evaluate("document.documentElement.dataset.scheme === 'dark'"))) {
        throw new Error('data-scheme is not dark; the scheme emulation did not apply')
      }
      const lowContrastButtonsDark = await evaluate(buttonProbe)
      for (const f of darkButtonFindings(lowContrastButtonsDark)) fail(`${tag}: ${f.message}`)
    } catch (e) {
      miss(`dark scheme: ${e.message}`, `${route} (dark)`)
    } finally {
      BOARD_PHASE.dark = false
      await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] }).catch(() => {})
    }
    if (process.env.PAGE_LAYOUT_DEBUG) console.error(`  ${tag} ${Date.now() - t0}ms`)
  } catch (e) {
    // A probe that cannot run is not a layout finding, but it is lost coverage: it is not inspected, and it fails unless exempt.
    miss(e.message)
  }
}

for (const vp of VIEWPORTS) {
  for (const [pattern, kind] of ROUTES) {
    if (process.env.PAGE_LAYOUT_ONLY && !new RegExp(process.env.PAGE_LAYOUT_ONLY).test(pattern)) continue
    await probePage(vp, resolveRoute(pattern, ids), pattern, kind, false)
  }
  // hf-recipes-filter round 2: the filtered /recipes, closed and with the Filters panel open (SCENARIOS).
  for (const scenario of SCENARIOS) {
    if (process.env.PAGE_LAYOUT_ONLY && !new RegExp(process.env.PAGE_LAYOUT_ONLY).test(scenario.route)) continue
    const kind = ROUTES.find(([pattern]) => pattern === scenario.route)?.[1] ?? 'default'
    await probePage(vp, resolveScenario(scenario, ids), scenario.route, kind, scenario.open)
  }
}

// hf-recipes-filter round 3 (P21, RESIZE_WALK): the closed filtered page is loaded fresh at each phone width from 360 to 480 px, and the
// page must not break at any of them: an uncaught exception, a console error, or the error page ("Something went wrong").
// pantry-filter: one walk per filtered header (RESIZE_WALKS: /recipes and /pantry).
for (const walk of RESIZE_WALKS) {
  const walkScenario = SCENARIOS.find((x) => x.name === walk.scenario)
  if (walkScenario && (!process.env.PAGE_LAYOUT_ONLY || new RegExp(process.env.PAGE_LAYOUT_ONLY).test(walkScenario.route))) {
    for (const w of resizeWalkWidths()) {
      probes++
      const route = resolveScenario(walkScenario, ids)
      const tag = `${w}px ${route}`
      try {
        await closeTab()
        await openTab()
        runtimeEvents.length = 0
        // Phone emulation, as the quick profile's 390 px probe: the app lays out at exactly w CSS px (documentElement.clientWidth = w; no
        // scrollbar takes 15 px of it, as it does without mobile emulation). Only a page wider than w (a horizontal overflow) reports a
        // larger innerWidth under mobile emulation; its layout width is still w.
        await cdp('Emulation.setDeviceMetricsOverride', { width: w, height: 844, deviceScaleFactor: 1, mobile: true })
        await Promise.race([cdp('Page.navigate', { url: base + route }), sleep(4000)])
        await settle()
        const runtimeErrors = [...runtimeEvents]
        if (await evaluate("document.body.innerText.includes('Something went wrong')")) runtimeErrors.push({ why: 'error-page', text: 'Something went wrong' })
        // pantry-filter review: and whether a chip Select (the Sort) cuts its value at this width (P22): the quick profile's only phone
        // width is 390, and the Pantry's Sort read "Good u…" from 360 to 397 px.
        const cutSelects = await evaluate(cutSelectProbe)
        if (process.env.PAGE_LAYOUT_DEBUG) console.error(`  walk ${tag}: ${JSON.stringify({ runtimeErrors, cutSelects })}`)
        // Only P21 and P22 are read from the walk: the page's error state and its Sort chip at this width.
        for (const f of resizeWalkFindings(runtimeErrors, { width: w, route }, cutSelects)) fail(`${tag}: ${f.message}`)
      } catch (e) {
        notInspected.push({ width: w, route, pattern: walkScenario.route, reason: e.message })
      }
    }
  }

  // Review of round 3 (P21, RESIZE_SWEEP): the 10 px steps of the walk can step over a narrow window (round 2's loop lived in 8 px), and a
  // fresh load never exercises the resize path (ResizeObserver). So the same page is also loaded once at the widest width and resized
  // live, 1 px at a time, down to the narrowest and back up. The first width at which it logs an error or shows the error page is a
  // P21 finding, labelled "(live resize)".
  if (walkScenario && (!process.env.PAGE_LAYOUT_ONLY || new RegExp(process.env.PAGE_LAYOUT_ONLY).test(walkScenario.route))) {
    probes++
    const route = resolveScenario(walkScenario, ids)
    const widths = resizeSweepWidths()
    try {
      await closeTab()
      await openTab()
      await cdp('Emulation.setDeviceMetricsOverride', { width: widths[0], height: 844, deviceScaleFactor: 1, mobile: true })
      await Promise.race([cdp('Page.navigate', { url: base + route }), sleep(4000)])
      await settle()
      runtimeEvents.length = 0
      for (const w of widths) {
        await cdp('Emulation.setDeviceMetricsOverride', { width: w, height: 844, deviceScaleFactor: 1, mobile: true })
        await sleep(RESIZE_SWEEP.pauseMs)
        const runtimeErrors = [...runtimeEvents]
        if (await evaluate("document.body.innerText.includes('Something went wrong')")) runtimeErrors.push({ why: 'error-page', text: 'Something went wrong' })
        if (runtimeErrors.length > 0) {
          for (const f of resizeWalkFindings(runtimeErrors, { width: w, route })) fail(`${w}px ${route} (live resize): ${f.message}`)
          break
        }
      }
    } catch (e) {
      notInspected.push({ width: widths[0], route: `${route} (live resize)`, pattern: walkScenario.route, reason: e.message })
    }
  }
}

ws.close()
// A PAGE_LAYOUT_ONLY filter that matches no route inspected nothing: a usage error (exit 2), never "inspected 0 of 0" and never OK.
if (probes === 0) {
  console.log(`check-page-layout: PAGE_LAYOUT_ONLY=${process.env.PAGE_LAYOUT_ONLY} matches no route in ROUTES; nothing was inspected`)
  await die(2)
}
const seconds = Math.round((Date.now() - started) / 1000)
const coverage = coverageSummary({ inspected: probes - notInspected.length, notInspected, exemptions })
const exemptReason = (entry) => exemptions.find((x) => x.pattern === entry.pattern).reason
const detail = [
  ...failures.map((f) => '  - ' + f),
  ...notInspected.map((entry) =>
    coverage.exempt.includes(entry) ? `  ~ ${entry.width}px ${entry.route}: exempt (${exemptReason(entry)})` : notInspectedLine(entry),
  ),
]
const bad = failures.length + coverage.failing.length
if (bad) {
  console.log(`check-page-layout: ${failures.length} failure(s), ${coverage.failing.length} not inspected (${profileName} profile, ${seconds}s)`)
}
if (detail.length) console.log(detail.join('\n'))
console.log(coverage.line)
if (bad) await die(1)
console.log(`check-page-layout: OK (${probes} probes, ${seconds}s)`)
await die(0)
