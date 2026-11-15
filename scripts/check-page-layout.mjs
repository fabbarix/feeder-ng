#!/usr/bin/env node
// Page-layout guard (R2-L; design: docs/dev/design/r2l-page-layout.md section 5). Normally run through scripts/check-page-layout.sh,
// which builds and starts a worktree-unique server, seeds it and maps the findings to warn/fail per route.
//   node scripts/check-page-layout.mjs --url http://127.0.0.1:<port> [--profile quick|full] [--ids build/page-layout-ids.json]
//                                      [--chrome /usr/bin/google-chrome] [--email admin@example.test] [--scenario NAME[,NAME]]
// --url is required (no default port), so two worktrees can never probe each other's server by accident.
// --scenario (B9-03) runs only the named scenarios (and the resize walk of a named one), no route table: a package's targeted run. An
// unknown name is a usage error (exit 2) before Chrome starts.
// For every route x viewport it runs the in-page probes and asserts the rules (scripts/lib/page-layout/: probes/, rules/, scenarios/,
// through scripts/lib/page-layout-rules.mjs). Prints one line per finding
// ("  - <w>px <route>: <rule> ...") and one per probe that was not inspected ("  ! <w>px <route>: not inspected (<reason>)").
// Every route x viewport must be inspected: a probe that cannot run fails the guard unless its route is exempt
// (scripts/check-page-layout.exempt, or --exempt FILE). Exit 1 on any finding or failing not-inspected entry, never OK then;
// exit 2 = usage or environment trouble (the wrapper treats that as not run). Design: docs/dev/design/b5-pl.md.
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DARK_PROBES, PROBES, PROFILES, ROUTES, RESIZE_SWEEP, RESIZE_WALKS, SCENARIOS, SETUPS, evaluateDarkMetrics, evaluateMetrics, resizeSweepWidths, resizeWalkFindings, resizeWalkWidths, resolveRoute, resolveScenario, scenarioViewports, selectScenarios } from './lib/page-layout-rules.mjs'
import { coverageSummary, notInspectedLine, parseExemptions } from './lib/page-layout-coverage.mjs'
import { installHelpers } from './lib/page-layout/helpers.mjs'
import { emulationCalls } from './lib/page-layout/viewport.mjs'

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
// --scenario NAME[,NAME]: checked here, before Chrome starts, so a typo costs nothing.
const scenarioArg = process.argv.includes('--scenario') ? arg('scenario', '') : null
if (scenarioArg !== null && (!scenarioArg || scenarioArg.startsWith('--'))) {
  console.error('check-page-layout: usage: --scenario NAME[,NAME] (a scenario of scripts/lib/page-layout/scenarios/)')
  process.exit(2)
}
let RUN_SCENARIOS = SCENARIOS
try {
  RUN_SCENARIOS = selectScenarios(SCENARIOS, scenarioArg ?? undefined)
} catch (e) {
  console.error(`check-page-layout: ${e.message}`)
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
  // Under load the sign-in page may not have committed after 1.2 s; a fetch from about:blank fails ("Failed to fetch"). Wait for the origin (10 s cap).
  const origin = new URL(base).origin
  for (const end = Date.now() + 10000; Date.now() < end; await sleep(100)) {
    if ((await evaluate('location.origin').catch(() => '')) === origin) break
  }
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

// The in-page probes are scripts/lib/page-layout/probes/*.mjs (PROBES, run in their order after the layout probe); P10's Button probe
// runs again in the dark scheme, and the chip Select probe in the resize walk.
const probeSource = (name) => PROBES.find((p) => p.name === name).source
const layoutProbe = PROBES.find((p) => p.key === null).source
const cutSelectProbe = probeSource('cut-selects')
// The scenario setups are scripts/lib/page-layout/scenarios/*.mjs (SETUPS); they reach this tab through helpers.mjs.
const helpers = installHelpers({ evaluate, sleep, ids })
/** Puts the current tab in a viewport (device metrics, and the safe-area insets of an inset viewport: viewport.mjs). */
const emulate = async (vp, extra = []) => {
  // B9-03: then a scenario's own CDP calls (scenario.emulate: a text size, say), before the first navigation.
  for (const c of [...emulationCalls(vp), ...extra]) await cdp(c.method, c.params)
}
/** Whether a probe runs on this page: a probe with `scenarios` runs only on those scenarios' pages. */
const probeRuns = (p, vp, scenario) => vp.width >= (p.minWidth ?? 0) && (!p.scenarios || (scenario !== null && p.scenarios.includes(scenario.name)))

// Probes that did not run, one entry per route x viewport: {width, route, pattern, reason}.
const notInspected = []
let probes = 0
const started = Date.now()
/** One page at one width: navigate, settle, run every probe and report its findings; open = the Filters panel is opened first (hf-recipes-filter SCENARIOS). */
async function probePage(vp, route, pattern, kind, open, setup = null, label = route, scenario = null) {
  probes++
  const tag = `${vp.width}px ${label}`
  const t0 = Date.now()
  // One entry per probe, whichever step failed first.
  let missed = false
  const miss = (reason, missLabel = label) => {
    if (missed) return
    missed = true
    notInspected.push({ width: vp.width, route: missLabel, pattern, reason })
  }
  try {
    await closeTab()
    await openTab()
    await emulate(vp, scenario?.emulate)
    // beta.7: a setup starts from a clean device (no last Shop, no stored Scan session), whatever the probes before it left.
    if (setup) await cdp('Storage.clearDataForOrigin', { origin: base, storageTypes: 'local_storage,indexeddb' })
    await Promise.race([cdp('Page.navigate', { url: base + route }), sleep(4000)])
    await settle()
    if (setup) {
      await setup(helpers)
      await settle()
    }
    if (process.env.PAGE_LAYOUT_DEBUG) console.error(`   at ${await evaluate('location.pathname + " " + document.readyState')}`)
    if (open) {
      // The Filters button of the header (the Recipes and the Pantry scenarios): opened before the probes, so the panel is measured.
      await evaluate("document.querySelector('.filter-bar__search-row > .button')?.click()")
      await settle()
    }
    const m = await evaluate(layoutProbe)
    if (!m.hasMain) {
      miss(`no <main> element (${m.title || m.text || 'empty page'})`)
      return
    }
    // Every other probe fills its metrics field, in PROBES order (the nav probe scrolls to the end, the ring probe focuses chips), from
    // its minWidth; a soft probe (the dialog) that throws reads as nothing there.
    for (const p of PROBES) {
      if (p.key === null || !probeRuns(p, vp, scenario)) continue
      // B9-03: a probe module whose key the layout probe already fills would overwrite a metric in silence. A field the layout probe
      // leaves null is a placeholder for its probe (dialog: null, filled by the dialog probe from 768 px).
      if (Object.hasOwn(m, p.key) && m[p.key] !== null) throw new Error(`probe ${p.name}: metrics key "${p.key}" is already filled by the layout probe`)
      m[p.key] = p.soft ? await evaluate(p.source).catch(() => null) : await evaluate(p.source)
    }
    // PAGE_LAYOUT_SHOTS=<dir>: a screenshot of every light probe, to see the state a scenario's setup reached (debugging only).
    if (process.env.PAGE_LAYOUT_SHOTS) {
      const { data } = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
      mkdirSync(process.env.PAGE_LAYOUT_SHOTS, { recursive: true })
      writeFileSync(join(process.env.PAGE_LAYOUT_SHOTS, `${vp.width}-${label.replace(/[^\w.-]+/g, '_')}.png`), Buffer.from(data, 'base64'))
    }
    // The light findings are reported first, on the light page.
    // ctx.scenario: the scenario's name (null on the route table); a scenario with `rules` reports only those rules' findings.
    const ctx = { width: vp.width, route, kind, scenario: scenario?.name ?? null }
    const reported = (f) => !scenario?.rules || scenario.rules.includes(f.rule)
    for (const f of evaluateMetrics(m, ctx).filter(reported)) fail(`${tag}: ${f.message}`)
    // FU-4: the dark P10 pass runs after the light findings; only its P10 findings are reported, and a dark pass that did not run is not inspected.
    // The scheme is put back to light in the finally, whatever happens.
    try {
      // ThemeProvider reads the system scheme once at render, so the page is reloaded under the emulation and settled first. The
      // board takes its scheme from the server's phase, which is pinned to dark for this pass (pinBoardPhase).
      BOARD_PHASE.dark = true
      if (setup) {
        // The setup's state is in memory (the photos, the read): it is replayed in a fresh page opened in the dark scheme.
        await closeTab()
        await openTab()
        await emulate(vp, scenario?.emulate)
        await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] })
        await cdp('Storage.clearDataForOrigin', { origin: base, storageTypes: 'local_storage,indexeddb' })
        await Promise.race([cdp('Page.navigate', { url: base + route }), sleep(4000)])
        await settle()
        await setup(helpers)
      } else {
        await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] })
        await Promise.race([cdp('Page.reload', {}), sleep(4000)])
      }
      await settle()
      if (!(await evaluate("document.documentElement.dataset.scheme === 'dark'"))) {
        throw new Error('data-scheme is not dark; the scheme emulation did not apply')
      }
      // The probes marked `dark` (P10's Button probe) run again here; only the rules' evaluateDark findings are reported, never the
      // light ones again.
      const darkMetrics = {}
      for (const p of DARK_PROBES) if (probeRuns(p, vp, scenario)) darkMetrics[p.key] = p.soft ? await evaluate(p.source).catch(() => null) : await evaluate(p.source)
      for (const f of evaluateDarkMetrics(darkMetrics, ctx).filter(reported)) fail(`${tag}: ${f.message}`)
    } catch (e) {
      miss(`dark scheme: ${e.message}`, `${label} (dark)`)
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
  // --scenario: the named scenarios only, no route table.
  for (const [pattern, kind] of scenarioArg ? [] : ROUTES) {
    if (process.env.PAGE_LAYOUT_ONLY && !new RegExp(process.env.PAGE_LAYOUT_ONLY).test(pattern)) continue
    await probePage(vp, resolveRoute(pattern, ids), pattern, kind, false)
  }
  // hf-recipes-filter round 2: the filtered /recipes, closed and with the Filters panel open (SCENARIOS).
  for (const scenario of RUN_SCENARIOS.filter((x) => !x.widths)) {
    if (process.env.PAGE_LAYOUT_ONLY && !new RegExp(process.env.PAGE_LAYOUT_ONLY).test(scenario.route)) continue
    const kind = ROUTES.find(([pattern]) => pattern === scenario.route)?.[1] ?? 'default'
    await probePage(vp, resolveScenario(scenario, ids), scenario.route, kind, scenario.open, null, undefined, scenario)
  }
}
// beta.7 (H8, SR6, RR5): the scenarios with their own widths and a setup, at those widths in every profile. A finding or a missed probe
// is reported on "<route>#<scenario name>", so it says which state broke; the modes file reads the scenario's route.
for (const scenario of RUN_SCENARIOS.filter((x) => x.widths)) {
  if (process.env.PAGE_LAYOUT_ONLY && !new RegExp(process.env.PAGE_LAYOUT_ONLY).test(scenario.route)) continue
  const kind = ROUTES.find(([pattern]) => pattern === scenario.route)?.[1] ?? 'default'
  // B9-03: a scenario's setup is optional (the registry has checked that a named one exists); without one the page is probed as it
  // loads, under the scenario's viewport and its own emulation.
  const setup = scenario.setup ? SETUPS[scenario.setup] : null
  for (const vp of scenarioViewports(scenario, VIEWPORTS)) {
    // "<route>#<scenario>": one token, so the modes file reads the route (the part before #) and the line names the state.
    await probePage(vp, resolveScenario(scenario, ids), scenario.route, kind, false, setup, `${scenario.route}#${scenario.name}`, scenario)
  }
}

// hf-recipes-filter round 3 (P21, RESIZE_WALK): the closed filtered page is loaded fresh at each phone width from 375 to 480 px, and the
// page must not break at any of them: an uncaught exception, a console error, or the error page ("Something went wrong").
// pantry-filter: one walk per filtered header (RESIZE_WALKS: /recipes and /pantry). With --scenario, only the walk of a named scenario.
for (const walk of RESIZE_WALKS) {
  const named = SCENARIOS.find((x) => x.name === walk.scenario)
  const walkScenario = RUN_SCENARIOS.includes(named) ? named : undefined
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
        await emulate({ width: w, height: 844, mobile: true })
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
      await emulate({ width: widths[0], height: 844, mobile: true })
      await Promise.race([cdp('Page.navigate', { url: base + route }), sleep(4000)])
      await settle()
      runtimeEvents.length = 0
      for (const w of widths) {
        await emulate({ width: w, height: 844, mobile: true })
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
  console.log(`check-page-layout: PAGE_LAYOUT_ONLY=${process.env.PAGE_LAYOUT_ONLY} matches no route in ROUTES${scenarioArg ? ` or of --scenario ${scenarioArg}` : ''}; nothing was inspected`)
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
