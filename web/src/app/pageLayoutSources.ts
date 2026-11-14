// B9-03 (guard-split): the page-layout guard is no longer one driver file and one seed file. Tests that read the guard's source text to
// pin a probe, a setup or a seed step read it through these two helpers, so they keep holding wherever the code lives.
//   driverSource(): scripts/check-page-layout.mjs, then every file under scripts/lib/page-layout/ (rules, probes, scenarios), by path.
//   seedSource():   scripts/test/fixtures/page-layout-seed.mjs, then every file under scripts/test/fixtures/page-layout-seed/, by path.
// Plain text: nothing here knows what a file is for.
const nodeFs = 'node:fs'
const { readFileSync, readdirSync, existsSync } = (await import(/* @vite-ignore */ nodeFs)) as {
  readFileSync: (p: string, enc: string) => string
  readdirSync: (p: string, o: { withFileTypes: true }) => { name: string; isDirectory: () => boolean }[]
  existsSync: (p: string) => boolean
}
const nodePath = 'node:path'
const { resolve } = (await import(/* @vite-ignore */ nodePath)) as { resolve: (...p: string[]) => string }
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
const scripts = (...p: string[]) => resolve(cwd, '../scripts', ...p)

function filesUnder(dir: string): string[] {
  if (!existsSync(dir)) return []
  const out: string[] = []
  for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const p = resolve(dir, e.name)
    if (e.isDirectory()) out.push(...filesUnder(p))
    else out.push(p)
  }
  return out
}

export const driverFiles = (): string[] => [scripts('check-page-layout.mjs'), ...filesUnder(scripts('lib', 'page-layout'))]
export const seedFiles = (): string[] => [scripts('test', 'fixtures', 'page-layout-seed.mjs'), ...filesUnder(scripts('test', 'fixtures', 'page-layout-seed'))]
const join = (files: string[]) => files.map((f) => readFileSync(f, 'utf8')).join('\n')
export const driverSource = (): string => join(driverFiles())
export const seedSource = (): string => join(seedFiles())
