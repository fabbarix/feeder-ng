#!/usr/bin/env node
// B9-21 (RES-01) offline-launch probe: Chrome with the service worker ON visits the app once, then goes offline and opens
// /shop, / and /recipes/1 again. Each must load the app shell: no navigation error (the beta.8 failure was net::ERR_FAILED on
// a cached redirect) and a <main> element on the page. It also checks the cache holds the shell under the scope URL, not redirected.
//   node scripts/lib/res-serving/offline-launch.mjs --url http://127.0.0.1:<port> --profile-dir <dir> --server-pid PID [--chrome PATH] [--email E]
// Offline is REAL: Network.emulateNetworkConditions does not reach the worker's own fetches, so the probe stops the server it was
// given (--server-pid, the caller's detached test server) before the offline phase. The caller must not need it afterwards.
// The Chrome profile is the given directory (under the worktree's build/, never a shared path); it is removed at the end.
// A throwaway origin of its own (the caller's port): no real worker is ever registered against a shared origin.
// Exit 0 = OK, 1 = a finding, 2 = trouble with the environment (no Chrome, the server did not answer).
import { spawn } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 ? process.argv[i + 1] : fallback
}
const base = (arg('url', '') || '').replace(/\/$/, '')
const profile = arg('profile-dir', '')
const serverPid = Number(arg('server-pid', '0'))
if (!base || !profile || !serverPid) {
  console.error('offline-launch: usage: offline-launch.mjs --url http://127.0.0.1:<port> --profile-dir <dir> --server-pid PID [--chrome PATH] [--email E]')
  process.exit(2)
}
const chromeBin = arg('chrome', process.env.CHROME || 'google-chrome')
const email = arg('email', 'admin@example.test')
const ROUTES = ['/shop', '/', '/recipes/1']
// B9-59 (RES-04): the routes load their code on demand. Routes never opened online must still open offline from the precache,
// with their page drawn (an h1, nothing busy) and not the error state of a chunk that failed to load.
const NEVER_VISITED = ['/settings/tags', '/plan']

rmSync(profile, { recursive: true, force: true })
mkdirSync(profile, { recursive: true })
const flags = ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--disable-gpu', 'about:blank']
if (process.getuid && process.getuid() === 0) flags.unshift('--no-sandbox')
const chrome = spawn(chromeBin, flags, { stdio: ['ignore', 'ignore', 'pipe'], detached: true })
const killChrome = () => {
  for (const target of [-chrome.pid, chrome.pid]) {
    try {
      if (target) process.kill(target, 'SIGKILL')
    } catch {
      /* gone */
    }
  }
}
const cleanup = () => {
  killChrome()
  try {
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  } catch {
    /* best effort */
  }
}
process.on('exit', cleanup)
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => process.exit(130))
chrome.on('error', (e) => {
  console.error(`offline-launch: cannot start Chrome (${e.message})`)
  process.exit(2)
})

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const findings = []
const fail = (m) => findings.push(m)

const wsUrl = await new Promise((resolve, reject) => {
  let buf = ''
  chrome.stderr.on('data', (d) => {
    buf += d
    const m = /DevTools listening on (ws:\/\/\S+)/.exec(buf)
    if (m) resolve(m[1])
  })
  chrome.on('exit', () => reject(new Error('Chrome exited before DevTools was ready')))
  setTimeout(() => reject(new Error('timed out waiting for Chrome')), 15000)
}).catch((e) => {
  console.error(`offline-launch: ${e.message}`)
  process.exit(2)
})
const ws = new WebSocket(wsUrl)
await new Promise((resolve, reject) => {
  ws.onopen = resolve
  ws.onerror = () => reject(new Error('the DevTools WebSocket failed to open'))
}).catch((e) => {
  console.error(`offline-launch: ${e.message}`)
  process.exit(2)
})
let nextId = 1
const pending = new Map()
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data)
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id)
    pending.delete(msg.id)
    msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result)
  } else if (msg.method === 'Page.javascriptDialogOpening') {
    send('Page.handleJavaScriptDialog', { accept: true }, msg.sessionId).catch(() => {})
  }
}
const send = (method, params = {}, sessionId) =>
  new Promise((resolve, reject) => {
    const id = nextId++
    const t = setTimeout(() => {
      pending.delete(id)
      reject(new Error(`${method} timed out`))
    }, 20000)
    pending.set(id, {
      resolve: (v) => (clearTimeout(t), resolve(v)),
      reject: (e) => (clearTimeout(t), reject(e)),
    })
    ws.send(JSON.stringify({ id, method, params, sessionId }))
  })

let sessionId
const cdp = (method, params) => send(method, params, sessionId)
const evaluate = async (expression) => {
  const r = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (r.exceptionDetails) throw new Error(String(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text).split('\n')[0])
  return r.result.value
}
const waitFor = async (expression, ms, what) => {
  const end = Date.now() + ms
  while (Date.now() < end) {
    try {
      if (await evaluate(expression)) return true
    } catch {
      /* the page is navigating */
    }
    await sleep(150)
  }
  fail(`timed out waiting for ${what}`)
  return false
}

let targetId
try {
  ;({ targetId } = await send('Target.createTarget', { url: 'about:blank' }))
  ;({ sessionId } = await send('Target.attachToTarget', { targetId, flatten: true }))
  await cdp('Page.enable')
  await cdp('Network.enable')
  await cdp('Runtime.enable')

  // 1. Online: the first visit, signed in with the dev login, so the real shell (with <main>) is what gets cached.
  const first = await cdp('Page.navigate', { url: `${base}/` })
  if (first.errorText) {
    console.error(`offline-launch: the server at ${base} did not answer (${first.errorText})`)
    process.exit(2)
  }
  await waitFor(`document.readyState === 'complete'`, 15000, 'the first page load')
  const login = await evaluate(
    `fetch('/api/dev/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: ${JSON.stringify(email)} }) }).then((r) => r.status)`,
  )
  if (login !== 200 && login !== 204) {
    console.error(`offline-launch: dev login answered ${login}; is FEEDER_DEV_LOGIN=1 set?`)
    process.exit(2)
  }
  await cdp('Page.navigate', { url: `${base}/shop` })
  await waitFor(`!!document.querySelector('main')`, 15000, 'the online /shop to render a <main>')

  // 2. The worker is installed, active and controlling the page (a reload lets a first install take control).
  if (!(await evaluate(`'serviceWorker' in navigator`))) fail('this Chrome has no service worker support on this origin')
  await waitFor(`navigator.serviceWorker.ready.then((r) => !!r.active)`, 20000, 'the service worker to become active')
  await cdp('Page.navigate', { url: `${base}/shop` })
  await waitFor(`!!navigator.serviceWorker.controller && !!document.querySelector('main')`, 15000, 'the worker to control /shop')

  // 3. The cache holds the shell under the scope URL, as a response that is not a redirect.
  const shell = await evaluate(`(async () => {
    const out = { names: await caches.keys(), url: location.origin + '/', hit: null }
    const hit = await caches.match(out.url)
    out.hit = hit ? { status: hit.status, redirected: hit.redirected, type: hit.headers.get('content-type') } : null
    const index = await caches.match(location.origin + '/index.html')
    out.index = index ? { redirected: index.redirected } : null
    return out
  })()`)
  if (!shell.names.includes('feeder-shell-v2')) fail(`the cache is not feeder-shell-v2 (found ${JSON.stringify(shell.names)})`)
  if (shell.names.includes('feeder-shell-v1')) fail('the poisoned feeder-shell-v1 cache is still there')
  if (!shell.hit) fail(`the shell is not cached under ${shell.url}`)
  else if (shell.hit.redirected || shell.hit.status !== 200) fail(`the cached shell is not a plain 200 (${JSON.stringify(shell.hit)})`)
  if (shell.index?.redirected) fail('the cache still holds a redirected index.html')

  // 4. Offline: the server is stopped (the emulation does not reach the worker's own fetches), then each route must open the shell.
  try {
    process.kill(serverPid, 'SIGTERM')
  } catch (e) {
    console.error(`offline-launch: cannot stop the server (pid ${serverPid}): ${e.message}`)
    process.exit(2)
  }
  for (let i = 0; i < 50; i++) {
    const up = await fetch(`${base}/`, { signal: AbortSignal.timeout(1000) }).then(() => true, () => false)
    if (!up) break
    await sleep(100)
  }
  await cdp('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })
  for (const route of ROUTES) {
    const nav = await cdp('Page.navigate', { url: `${base}${route}` })
    if (nav.errorText) {
      fail(`offline ${route}: navigation error ${nav.errorText}`)
      continue
    }
    const ok = await waitFor(`!!document.querySelector('main')`, 15000, `offline ${route} to render a <main>`)
    const href = await evaluate('location.href')
    if (String(href).startsWith('chrome-error:')) fail(`offline ${route}: the browser's error page (${href})`)
    else if (ok) {
      const bare = await evaluate(`document.querySelector('#root')?.childElementCount ?? 0`)
      if (!bare) fail(`offline ${route}: <main> exists but the app root is empty`)
    }
  }
  // B9-59: a route never opened online (its chunk was only precached), by a full load and by an in-app navigation.
  for (const route of NEVER_VISITED) {
    const nav = await cdp('Page.navigate', { url: `${base}${route}` })
    if (nav.errorText) {
      fail(`offline ${route}: navigation error ${nav.errorText}`)
      continue
    }
    const drawn = await waitFor(`!!document.querySelector('main h1') && !document.querySelector('[aria-busy="true"]')`, 15000, `offline ${route} to draw its page`)
    if (drawn && (await evaluate(`document.body.innerText.includes('Something went wrong')`))) fail(`offline ${route}: the error state (its code did not load from the precache)`)
  }
  await evaluate(`(window.history.pushState({}, '', '/settings/household'), window.dispatchEvent(new PopStateEvent('popstate')), true)`)
  if (await waitFor(`location.pathname === '/settings/household' && !!document.querySelector('main h1') && !document.querySelector('[aria-busy="true"]')`, 15000, 'an offline in-app navigation to /settings/household')) {
    if (await evaluate(`document.body.innerText.includes('Something went wrong')`)) fail('offline in-app navigation to /settings/household: the error state (its chunk is not precached)')
  }
  await cdp('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })
} catch (e) {
  fail(`probe error: ${e.message}`)
} finally {
  try {
    await send('Target.closeTarget', { targetId })
  } catch {
    /* closing anyway */
  }
  try {
    ws.close()
  } catch {
    /* closed */
  }
  cleanup()
}

if (findings.length) {
  for (const f of findings) console.log(`  - offline-launch: ${f}`)
  console.log(`offline-launch: FAILED (${findings.length} finding${findings.length === 1 ? '' : 's'})`)
  process.exit(1)
}
console.log(`offline-launch: OK (${[...ROUTES, ...NEVER_VISITED, '/settings/household (in-app)'].join(', ')} open offline)`)
process.exit(0)
