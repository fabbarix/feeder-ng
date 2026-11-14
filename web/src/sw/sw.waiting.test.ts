// B9-21 (RES-10): sw.ts itself cannot be loaded outside a worker, so what it must NOT do is pinned on its source: it never
// skips waiting on install (the page asks with a message), and it listens for that message.
import { describe, expect, it } from 'vitest'

const nodeFs = 'node:fs'
const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, enc: string) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
const source = readFileSync(`${cwd}/src/sw/sw.ts`, 'utf8')
const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

/** the text of one addEventListener('<type>', ...) block, up to the next top-level addEventListener or the end */
function listener(type: string): string {
  const start = code.indexOf(`addEventListener('${type}'`)
  if (start < 0) return ''
  const next = code.indexOf('self.addEventListener(', start + 10)
  return code.slice(start, next < 0 ? undefined : next)
}

describe('sw.ts waits for the page (RES-10)', () => {
  it('the install listener precaches and does not skip waiting', () => {
    const install = listener('install')
    expect(install).not.toBe('')
    expect(install).not.toMatch(/skipWaiting/)
  })
  it('listens for a message, and skipWaiting is reached only through it', () => {
    expect(listener('message')).toMatch(/handleWorkerMessage|SKIP_WAITING/)
    const outsideMessage = code.replace(listener('message'), '')
    expect(outsideMessage).not.toMatch(/\bself\.skipWaiting\(\)/)
  })
  it('uses the cache name and navigation handling of ./cache and ./shell, not its own copies', () => {
    expect(code).not.toMatch(/feeder-shell-v1/)
    expect(code).not.toMatch(/new URL\(SHELL_ENTRY/)
    expect(code).toMatch(/from '\.\/shell'/)
  })
})
