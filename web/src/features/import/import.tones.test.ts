// B9-28 (B9-17 tone rule, DS-06): spoil is food going off and danger is loss or destruction. Import loses and spoils nothing, so no file
// of features/import sets either tone, unless scripts/check-ui.allow-tones lists the file with a reason. A warn, info or neutral tone is
// the default for a refused file, a failed read or a question. Nor does Import use the Leftover tone for "New" (system.md 2).
import { describe, expect, it } from 'vitest'

const nodeFs = 'node:fs'
const { readFileSync, readdirSync, statSync } = (await import(/* @vite-ignore */ nodeFs)) as {
  readFileSync: (p: string, e: string) => string
  readdirSync: (p: string) => string[]
  statSync: (p: string) => { isDirectory: () => boolean }
}
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd() // vitest runs in web/
const here = `${cwd}/src/features/import`

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = `${dir}/${name}`
    if (statSync(path).isDirectory()) return sources(path)
    return /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) && !/test-helper/.test(name) ? [path] : []
  })
}
/** scripts/check-ui.allow-tones lines `<path substring>   # reason`; a line without a reason does not count. The file may not exist yet. */
function allowList(): string {
  try {
    return readFileSync(`${cwd}/../scripts/check-ui.allow-tones`, 'utf8')
  } catch {
    return ''
  }
}
const allowed = new Set(
  allowList()
    .split('\n')
    .filter((l) => /#\s*\S/.test(l) && !l.trim().startsWith('#'))
    .map((l) => l.split('#')[0]!.trim().split(/\s+/)[0]!),
)
const strip = (text: string) => text.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n')
const toneSet = /(status|tone)\s*[=:]\s*\{?\s*['"](spoil|danger)['"]/

describe('features/import tones', () => {
  const files = sources(here)
  it('finds the source files', () => expect(files.length).toBeGreaterThan(20))
  it('no file sets a spoil or danger tone unless scripts/check-ui.allow-tones lists it with a reason', () => {
    const bad = files.filter((f) => toneSet.test(strip(readFileSync(f, 'utf8'))) && ![...allowed].some((a) => f.includes(a)))
    expect(bad.map((f) => f.slice(cwd.length + 1)), 'convert these to warn, info or neutral, or list them in scripts/check-ui.allow-tones with a reason').toEqual([])
  })
  it('no status Chip of Import wears the Leftover colour', () => {
    for (const file of files) expect(strip(readFileSync(file, 'utf8')), file).not.toMatch(/status\s*[=:]\s*\{?\s*['"]leftover['"]/)
  })
  it('the old IngredientMatchTile and UnitPromptTile are gone (their rows replace them)', () => {
    const names = files.map((f) => f.split('/').pop() as string)
    expect(names).not.toContain('IngredientMatchTile.tsx')
    expect(names).not.toContain('UnitPromptTile.tsx')
    expect(names).not.toContain('RecipeConflictTile.tsx')
    expect(names).not.toContain('ConfirmTile.tsx')
    expect(names).not.toContain('AgentPromptStep.tsx')
    expect(names).not.toContain('ImportSource.tsx')
  })
})
