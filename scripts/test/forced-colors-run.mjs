// B9-55 (A11Y-04): runs a static fixture page in headless Chrome with FORCED COLOURS emulated (CDP Emulation.setEmulatedMedia: Chrome has
// no command-line switch for it), walks the page with the Tab key, and prints one JSON object: { static: window.__static(), focus: [window.__focus() after each Tab] }.
//   node scripts/test/forced-colors-run.mjs <fixture.html> [tabs] [scheme: dark|light]
// Exit 0 with the JSON on stdout; exit 3 when Chrome is missing (the caller skips). Always closes the Chrome it started.
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { execSync } from 'node:child_process'

const [fixture, tabsArg = '20', scheme = 'dark'] = process.argv.slice(2)
let chrome = process.env.CHROME || ''
if (!chrome) {
  for (const c of ['google-chrome', 'chromium']) {
    try { chrome = execSync(`command -v ${c}`, { encoding: 'utf8' }).trim(); break } catch { /* next */ }
  }
}
if (!chrome) { console.error('no Chrome'); process.exit(3) }
const dir = mkdtempSync(join(tmpdir(), 'forced-colors-'))
const proc = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', '--allow-file-access-from-files', `--user-data-dir=${dir}`, '--remote-debugging-port=0', '--window-size=900,1100', 'about:blank'], { stdio: 'ignore' })
const done = (code) => { try { proc.kill('SIGKILL') } catch { /* gone */ } try { rmSync(dir, { recursive: true, force: true }) } catch { /* busy */ } process.exit(code) }
setTimeout(() => { console.error('forced-colors-run: timed out'); done(4) }, 60000).unref()
try {
  let port = 0
  for (let i = 0; i < 100 && !port; i++) {
    const f = join(dir, 'DevToolsActivePort')
    if (existsSync(f)) port = Number(readFileSync(f, 'utf8').split('\n')[0])
    else await new Promise((r) => setTimeout(r, 100))
  }
  if (!port) throw new Error('Chrome did not open its debugging port')
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
  const page = targets.find((t) => t.type === 'page')
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
  let id = 0
  const pending = new Map()
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id) } }
  const send = (method, params = {}) => new Promise((res) => { const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method, params })) })
  const evalJs = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails)); return r.result?.result?.value }
  await send('Page.enable')
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'forced-colors', value: 'active' }, { name: 'prefers-color-scheme', value: scheme }] })
  await send('Page.navigate', { url: 'file://' + resolve(fixture) })
  for (let i = 0; i < 100 && (await evalJs('document.title')) !== 'ready'; i++) await new Promise((r) => setTimeout(r, 100))
  await new Promise((r) => setTimeout(r, 300))
  const out = { static: await evalJs('JSON.stringify(window.__static())').then(JSON.parse), focus: [] }
  for (let i = 0; i < Number(tabsArg); i++) {
    for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 })
    out.focus.push(await evalJs('JSON.stringify(window.__focus())').then(JSON.parse))
  }
  console.log(JSON.stringify(out))
  done(0)
} catch (e) {
  console.error('forced-colors-run:', e && e.message ? e.message : e)
  done(1)
}
