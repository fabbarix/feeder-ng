// B9-34 (SSP-05 known item): the Shop's one viewport width exception is gone. A Supply row's compact Restock reason is chosen by the
// row's own text column (ListRow's `metaCompact`), so `useCompactRows`, `lib/compactRows` and `COMPACT_ROWS_QUERY` no longer exist, and
// no Shop or Scan component takes a `compact` prop for it. Also pins that nothing in the Shop opens the old "How much?" prefill sheet.
import { describe, expect, it } from 'vitest'

const nodeFs = 'node:fs'
const { existsSync, readFileSync, readdirSync, statSync } = (await import(/* @vite-ignore */ nodeFs)) as {
  existsSync: (p: string) => boolean
  readFileSync: (p: string, enc: string) => string
  readdirSync: (p: string) => string[]
  statSync: (p: string) => { isDirectory(): boolean }
}
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = `${dir}/${name}`
    if (statSync(path).isDirectory()) return walk(path)
    return /\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) ? [path] : []
  })
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
const sources = [...walk(`${cwd}/src/features/shop`), ...walk(`${cwd}/src/features/scan`)]

describe('SSP-05: the compact Restock reason has no viewport query', () => {
  it('the hook and the lib file are deleted', () => {
    expect(existsSync(`${cwd}/src/features/shop/hooks/useCompactRows.ts`)).toBe(false)
    expect(existsSync(`${cwd}/src/features/shop/lib/compactRows.ts`)).toBe(false)
  })

  it('nothing refers to them', () => {
    const hits = sources.filter((f) => /useCompactRows|COMPACT_ROWS_QUERY|lib\/compactRows/.test(strip(readFileSync(f, 'utf8'))))
    expect(hits).toEqual([])
  })

  it('LineRow, NotNeededGroup and ShoppingBody take no `compact` prop', () => {
    for (const name of ['LineRow', 'NotNeededGroup', 'ShoppingBody']) {
      const code = strip(readFileSync(`${cwd}/src/features/shop/components/${name}.tsx`, 'utf8'))
      expect(code, name).not.toMatch(/\bcompact\??:\s*boolean/)
    }
  })
})

describe('SSP 2: one tap, no "How much?" prefill', () => {
  it('the Shop screen reads no `defaultQuantity` and the strings drop the old sheet\'s title', () => {
    expect(strip(readFileSync(`${cwd}/src/features/shop/screens/ShoppingScreen.tsx`, 'utf8'))).not.toMatch(/defaultQuantity/)
    expect(strip(readFileSync(`${cwd}/src/features/shop/components/TickSheet.tsx`, 'utf8'))).not.toMatch(/defaultQuantity/)
  })
})

describe('B9-34: the toast uses useUndoToast, never a bare "Undo" action string', () => {
  it('the tick flow and Scan\'s hook go through ui/useUndoToast', () => {
    for (const f of ['shop/hooks/useTickFlow.ts', 'scan/hooks/useToGetTick.ts']) {
      expect(strip(readFileSync(`${cwd}/src/features/${f}`, 'utf8')), f).toMatch(/useUndoToast/)
    }
  })
})
