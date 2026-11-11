// TG-UI: styles.css holds exactly the Tag palette (--tag-<id>-bg|fg|dot, OKLCH) in the light, prefers-dark and data-scheme=dark blocks.
import { describe, expect, it } from 'vitest'
import { oklchToHex } from './theme/color'
import { REFERENCE_PALETTE } from './lib/tags/palette.fixture'
import { TAG_PALETTE } from './lib/tags/palette'
import { readStylesCss } from './ui/test-utils'

const css = readStylesCss().replace(/\/\*[\s\S]*?\*\//g, '')

/** Body of the first rule whose selector text starts at `selector`, up to its closing brace (flat rules only). */
function ruleBody(from: string, selector: string): string {
  const i = from.indexOf(selector)
  if (i < 0) return ''
  const open = from.indexOf('{', i)
  return from.slice(open + 1, from.indexOf('}', open))
}
function mediaBody(query: string): string {
  const i = css.indexOf(`@media (${query})`)
  if (i < 0) return ''
  const open = css.indexOf('{', i)
  let depth = 0
  for (let j = open; j < css.length; j++) {
    if (css[j] === '{') depth++
    else if (css[j] === '}' && --depth === 0) return css.slice(open + 1, j)
  }
  return ''
}

const BLOCKS = {
  light: ruleBody(css, "[data-scheme='light'] {"),
  'dark (prefers-color-scheme)': ruleBody(mediaBody('prefers-color-scheme: dark'), ":root:not([data-scheme='light']) {"),
  'dark (data-scheme)': ruleBody(css, "[data-scheme='dark'] {"),
} as const
const SCHEME_OF: Record<keyof typeof BLOCKS, 'light' | 'dark'> = { light: 'light', 'dark (prefers-color-scheme)': 'dark', 'dark (data-scheme)': 'dark' }

/** [l, c, h] of `--name: oklch(L C H);` in a block, or undefined. */
function oklch(body: string, name: string): [number, number, number] | undefined {
  const m = new RegExp(`${name}\\s*:\\s*oklch\\(\\s*([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)\\s*\\)\\s*;`).exec(body)
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : undefined
}

describe.each(Object.keys(BLOCKS) as (keyof typeof BLOCKS)[])('Tag tokens in the %s block', (blockName) => {
  const body = BLOCKS[blockName]
  const scheme = SCHEME_OF[blockName]
  it('the block exists', () => expect(body).toContain('--color-surface'))
  it.each(REFERENCE_PALETTE.map((r) => r.id))('%s: bg, fg and dot are oklch() values equal to the reference table', (id) => {
    const ref = REFERENCE_PALETTE.find((r) => r.id === id)!
    for (const part of ['bg', 'fg', 'dot'] as const) {
      const got = oklch(body, `--tag-${id}-${part}`)
      expect(got, `--tag-${id}-${part}`).toBeDefined()
      const [l, c] = ref[scheme][part]
      expect(got![0]).toBeCloseTo(l, 3)
      expect(got![1]).toBeCloseTo(c, 3)
      expect(got![2]).toBeCloseTo(ref.hue, 3)
    }
  })
  it('defines exactly thirty Tag tokens and no others', () => {
    const names = [...body.matchAll(/--tag-[a-z]+-(?:bg|fg|dot)\s*:/g)]
    expect(names).toHaveLength(30)
    expect([...body.matchAll(/--tag-[^\s:]+\s*:/g)]).toHaveLength(30)
  })
  it('no Tag token is the same sRGB colour as a status token', () => {
    const statuses = [...body.matchAll(/--status-[a-z-]+\s*:\s*(#[0-9a-f]{6})/gi)].map((m) => m[1]!.toLowerCase())
    expect(statuses.length).toBeGreaterThan(10)
    for (const r of REFERENCE_PALETTE) {
      for (const part of ['bg', 'fg', 'dot'] as const) {
        const got = oklch(body, `--tag-${r.id}-${part}`)
        if (!got) continue
        expect(statuses, `--tag-${r.id}-${part}`).not.toContain(oklchToHex({ l: got[0], c: got[1], h: got[2] }))
      }
    }
  })
  it('palette.ts holds the same numbers as the stylesheet', () => {
    expect(TAG_PALETTE).toHaveLength(10)
    for (const colour of TAG_PALETTE) {
      for (const part of ['bg', 'fg', 'dot'] as const) {
        const got = oklch(body, `--tag-${colour.id}-${part}`)
        expect(got, `--tag-${colour.id}-${part}`).toBeDefined()
        expect(colour[scheme][part].l).toBeCloseTo(got![0], 3)
        expect(colour[scheme][part].c).toBeCloseTo(got![1], 3)
        expect(colour[scheme][part].h).toBeCloseTo(got![2], 3)
      }
    }
  })
})
