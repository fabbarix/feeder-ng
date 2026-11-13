// DS-TODAY round 3 (docs/design/system.md §2): a status tile has a 1 px border in its tone, so it reads as a tile on every page
// colour ("Throw out or keep?" in Tomato light barely showed against the pink page). The border is the status text colour
// (--status-<name>-fg, --color-info-fg for info), which reaches 3:1 (WCAG non-text) against the page in every preset, light and dark.
import { describe, expect, it } from 'vitest'
import { contrastRatio } from '../theme/contrast'
import { generatePalette, STATUS_PALETTE, type Scheme, type StatusName } from '../theme/palette'
import { ACCENT_PRESETS } from '../features/settings/lib/accents'
import { declarations, readUiCss, ruleBlocks } from './test-utils'

const css = readUiCss('Tile.css')
const STATUSES: StatusName[] = ['leftover', 'spoil', 'danger', 'success', 'pinned']

describe('Tile.css: status tiles are bordered in their tone', () => {
  it.each(STATUSES)('%s: border 1px solid its --status-*-fg', (s) => {
    expect(declarations(css, `.tile[data-variant='status'][data-status='${s}']`)['border']).toBe(`1px solid var(--status-${s}-fg)`)
  })

  it('info: border 1px solid var(--color-info-fg)', () => {
    const body = ruleBlocks(css.replace(/\/\*[\s\S]*?\*\//g, '')).filter((b) => b.selectors.some((x) => /data-status='info'/.test(x.replace(/"/g, "'")))).map((b) => b.body).join(';')
    expect(body).toMatch(/border:\s*1px solid var\(--color-info-fg\)/)
  })

  it('the border does not change the tile\'s size (border-box) and the plain surface tile stays borderless', () => {
    expect(declarations(css, '.tile')['box-sizing'] ?? 'border-box').toBe('border-box')
    expect(declarations(css, '.tile')['border']).toBe('0')
  })
})

describe('the border reads against the page in every preset (3:1)', () => {
  it.each(ACCENT_PRESETS.flatMap((p) => (['light', 'dark'] as Scheme[]).map((s) => [p.name, p.hex, s] as const)))('%s %s', (_n, hex, scheme) => {
    const c = generatePalette({ accent: hex }, scheme).colors
    for (const s of STATUSES) expect(contrastRatio(STATUS_PALETTE[s][scheme].fg, c.bg), `${s} border on the page`).toBeGreaterThanOrEqual(3)
  })
})
