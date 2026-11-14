// B9-10: this package flips its five folders to fail for the check-ui rules that now find nothing there, in its own file
// scripts/check-ui.rules.d/b9-10.rules (plan section 6: "each package flips its folders ... in its own .rules.d file").
// scripts/check-ui.sh reads check-ui.rules and then every rules.d file in name order, and a later `<rule>.fail_paths=` line REPLACES the
// earlier one for that rule. So b9-10.rules must restate the paths that were already failing, plus the five folders: the test computes
// the effective list the way the script does.
import { describe, expect, it } from 'vitest'

const nodeFs = 'node:fs'
const { readFileSync, readdirSync, existsSync } = (await import(/* @vite-ignore */ nodeFs)) as {
  readFileSync: (p: string, enc: string) => string
  readdirSync: (p: string) => string[]
  existsSync: (p: string) => boolean
}
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
const scripts = (p: string) => `${cwd}/../scripts/${p}`

const FOLDERS = ['recipes', 'import', 'recipe-assistant', 'settings', 'tags'].map((f) => `web/src/features/${f}`)

/** The effective fail_paths and modes after check-ui.rules and the rules.d files up to and including `upTo` (all when omitted). */
function effective(upTo?: string) {
  const files = [scripts('check-ui.rules'), ...readdirSync(scripts('check-ui.rules.d')).sort().filter((f) => !upTo || f <= upTo).map((f) => scripts(`check-ui.rules.d/${f}`))]
  const paths: Record<string, string[]> = {}
  const modes: Record<string, string> = {}
  for (const f of files) {
    for (const raw of readFileSync(f, 'utf8').split('\n')) {
      const line = raw.replace(/#.*$/, '').trim()
      if (!line) continue
      const i = line.indexOf('=')
      const key = line.slice(0, i).trim()
      const val = line.slice(i + 1).trim()
      if (key.endsWith('.fail_paths')) paths[key.slice(0, -'.fail_paths'.length)] = val.split(/\s+/).map((p) => p.replace(/\/$/, '')).filter(Boolean)
      else modes[key] = val
    }
  }
  return { paths, modes }
}

/** The rules this branch's check-ui knows (built in or registered by a scripts/check-ui.d module). */
function knownRules(): string[] {
  const names = new Set<string>()
  const main = readFileSync(scripts('check-ui.sh'), 'utf8')
  for (const m of main.matchAll(/^rule_([a-z0-9_]+)\(\)/gm)) names.add(m[1]!.replace(/_/g, '-'))
  for (const f of readdirSync(scripts('check-ui.d'))) for (const m of readFileSync(scripts(`check-ui.d/${f}`), 'utf8').matchAll(/register_rule\s+([a-z0-9-]+)/g)) names.add(m[1]!)
  return [...names]
}

describe('scripts/check-ui.rules.d/b9-10.rules', () => {
  it('exists', () => {
    expect(existsSync(scripts('check-ui.rules.d/b9-10.rules'))).toBe(true)
  })
  it.each(['type-scale', 'opacity-muting'])('%s fails in the five folders of the sweep, and keeps every path that already failed', (rule) => {
    const before = effective('b9-09.rules').paths[rule] ?? [] // what the earlier files set (b9-01.rules ... b9-09.rules)
    const now = effective().paths[rule] ?? []
    for (const f of FOLDERS) expect(now, `${rule}: ${f}`).toContain(f)
    for (const p of before) expect(now, `${rule}: ${p} was failing and must still be`).toContain(p)
  })
  it('every rule that exists on this branch and is in the DS-09/DS-11/A11Y-02 list also fails in the five folders', () => {
    // focus-ring, raw-radius, raw-spacing and media-width are B9-07's detectors: they exist only once B9-07 has merged. This is
    // conditional on purpose; after the merge the same test requires them.
    const e = effective()
    for (const rule of ['focus-ring', 'raw-radius', 'raw-spacing', 'media-width', 'type-scale', 'opacity-muting']) {
      if (!knownRules().includes(rule)) continue
      for (const f of FOLDERS) expect(e.paths[rule] ?? [], `${rule}: ${f}`).toContain(f)
    }
  })
})
