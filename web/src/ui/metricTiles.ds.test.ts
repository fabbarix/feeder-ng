// DS-A round 2 (docs/design/system.md §2, §4): a metric tile (a TileMetric, a ProgressTile, the Shop cost tile) is neutral
// (surface) or status-toned (e.g. the Zero-waste streak is success), never accent-soft: an accent-soft fill reads as a warning
// with a red or orange accent. Scans the feature sources.
import { describe, expect, it } from 'vitest'

const nodeFs = 'node:fs'
const { readFileSync, readdirSync } = (await import(/* @vite-ignore */ nodeFs)) as {
  readFileSync: (p: string, enc: string) => string
  readdirSync: (p: string, o: { recursive: true }) => string[]
}
const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
const files = readdirSync(`${cwd}/src/features`, { recursive: true })
  .filter((f) => f.endsWith('.tsx') && !/\.test\./.test(f))
  .map((f) => ({ f, src: readFileSync(`${cwd}/src/features/${f}`, 'utf8') }))

describe('metric tiles are never accent-soft', () => {
  const metricFiles = files.filter(({ src }) => /<TileMetric\b|className="cost-tile"/.test(src))
  it('finds the metric tiles (the streak and the Shop cost tile at least)', () => {
    expect(metricFiles.map((x) => x.f).join(' ')).toMatch(/MetricStrip\.tsx/) // DS-TODAY: the streak tile became the metric strip
    expect(metricFiles.map((x) => x.f).join(' ')).toMatch(/CostTile\.tsx/)
  })
  // DS-TODAY: MetricStrip's "Lines to get" metric is the accent container on purpose (system.md §2: the one place --color-soft is a metric tone); it is a dynamic
  // variant (tone 'accent'), and is checked below instead of by the literal scan.
  it.each(files.filter(({ src, f }) => /<TileMetric\b|className="cost-tile"/.test(src) && !f.endsWith('MetricStrip.tsx')).map((x) => [x.f, x.src] as const))('%s: no variant="soft" Tile', (_f, src) => {
    expect(src).not.toMatch(/<Tile\b[^>]*variant="soft"/)
  })
  it('the Zero-waste streak is the success tone, and only "Lines to get" is the accent container', () => {
    const lib = readFileSync(`${cwd}/src/features/today/lib/metrics.ts`, 'utf8')
    expect(lib).toMatch(/id:\s*'streak'[^}]*tone:\s*'success'/)
    expect(lib).toMatch(/id:\s*'leftovers'[^}]*tone:\s*'leftover'/)
    expect(lib).toMatch(/id:\s*'lines'[^}]*tone:\s*'accent'/)
    const strip = files.find((x) => x.f.endsWith('MetricStrip.tsx'))!.src
    expect(strip).toMatch(/variant=\{m\.tone === 'accent' \? 'soft' : 'status'\}/)
  })
})
