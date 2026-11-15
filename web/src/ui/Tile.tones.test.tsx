// B9-17 (DS-06, DS 3, VC9; TB-05 and A11Y-02 for the hero): the Tile's tones and the hero's scheme.
// Tone rule (decision DS 3, VC9): warn means a rule or a setting that needs a decision, info a question or a time to know (Advance Steps
// tiles are info, never warn: Today, Cook Mode, the Kitchen board), spoil means food and danger means loss.
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Tile } from './Tile'
import { blocksOf, selectorList, type CssBlock } from './lib/cssWalk.test-helper'
import { declarations, readUiCss, readStylesCss } from './test-utils'

const css = readUiCss('Tile.css')
const q = (s: string) => s.replace(/"/g, "'").replace(/\s+/g, ' ').trim()
const tileBlocks = blocksOf(['ui']).filter((b) => b.file === 'ui/Tile.css')
const rule = (selector: string): CssBlock[] => tileBlocks.filter((b) => selectorList(q(b.selector)).includes(q(selector)))
const val = (blocks: CssBlock[], prop: string) => blocks.flatMap((b) => b.decls).filter(([p]) => p === prop).map(([, v]) => v).pop()

describe('Tile: the warn status tile (DS-06)', () => {
  it('<Tile variant="status" status="warn"> renders data-variant="status" data-status="warn"', () => {
    const { container } = render(<Tile variant="status" status="warn">x</Tile>)
    const el = container.querySelector('.tile')!
    expect(el).toHaveAttribute('data-variant', 'status')
    expect(el).toHaveAttribute('data-status', 'warn')
  })

  it('is bordered 1 px in its fg, filled with its bg, text in its fg (the same shape as every other status tile)', () => {
    expect(declarations(css, ".tile[data-variant='status'][data-status='warn']")).toMatchObject({
      border: '1px solid var(--status-warn-fg)',
      background: 'var(--status-warn-bg)',
      color: 'var(--status-warn-fg)',
    })
  })

  it('info stays the info status tile: --color-info-* (not a --status-* token, the info pair is fixed in styles.css)', () => {
    const info = rule(".tile[data-variant='status'][data-status='info']")
    expect(val(info, 'border')).toBe('1px solid var(--color-info-fg)')
    expect(val(info, 'background')).toBe('var(--color-info-bg)')
    expect(val(info, 'color')).toBe('var(--color-info-fg)')
  })

  it('warn and info are different looks: not the same fill and not the same text colour', () => {
    const warn = declarations(css, ".tile[data-variant='status'][data-status='warn']")
    const info = rule(".tile[data-variant='status'][data-status='info']")
    expect(warn['background']).not.toBe(val(info, 'background'))
    expect(warn['color']).not.toBe(val(info, 'color'))
  })

  it('a status tile with a tone that has no rule does not exist: every ChipStatus that a Tile accepts has its rule', () => {
    for (const s of ['leftover', 'spoil', 'danger', 'success', 'pinned', 'warn', 'info']) {
      expect(rule(`.tile[data-variant='status'][data-status='${s}']`).length, s).toBeGreaterThan(0)
    }
  })
})

describe('Tile: the hero follows the nearest scheme scope (TB-05, A11Y-03; the Gallery\'s dark panel on a light page)', () => {
  // The Gallery draws a light and a dark panel side by side, each with data-scheme on a wrapper (never on :root). The old dark rule
  // was keyed `:root[data-scheme='dark']` only, and `:root[data-scheme='light']` (specificity 0,4,0) painted the light pastel in the
  // dark panel. A rule `:root [data-scheme='X'] .tile[hero]` (a scheme scope BELOW the root) ties at 0,4,0 and wins by coming later.
  const SCOPE_DARK = ":root [data-scheme='dark'] .tile[data-variant='hero']"
  const SCOPE_LIGHT = ":root [data-scheme='light'] .tile[data-variant='hero']"
  const ROOT_DARK = ":root[data-scheme='dark'] .tile[data-variant='hero']"
  const ROOT_LIGHT = ":root[data-scheme='light'] .tile[data-variant='hero']"
  const index = (sel: string) => tileBlocks.findIndex((b) => selectorList(q(b.selector)).includes(q(sel)))

  it('keeps the root rules (B9-07\'s ui/focusLayer.css.test.ts still pins them) and adds the same two for a scheme scope below the root', () => {
    for (const s of [ROOT_DARK, ROOT_LIGHT, SCOPE_DARK, SCOPE_LIGHT]) expect(rule(s).length, s).toBe(1)
  })

  it('the dark scope paints the dark hero: soft-strong fill, text colour, and the ring in the text colour', () => {
    const dark = rule(SCOPE_DARK)
    expect(val(dark, 'background')).toBe('var(--color-soft-strong)')
    expect(val(dark, 'color')).toBe('var(--color-text)')
    expect(val(dark, '--focus-ring-color')).toBe('var(--color-text)')
    expect(dark[0]!.atrules).toEqual([])
  })

  it('the light scope paints the light hero: accent fill, on-accent text, and the ring in the on-accent colour', () => {
    const light = rule(SCOPE_LIGHT)
    expect(val(light, 'background')).toBe('var(--color-accent)')
    expect(val(light, 'color')).toBe('var(--color-on-accent)')
    expect(val(light, '--focus-ring-color')).toBe('var(--color-on-accent)')
  })

  it('the Cook button follows the scope too: an accent fill in a dark scope, a surface fill with accent text in a light one', () => {
    const dark = rule(`${SCOPE_DARK} .button[data-variant='primary']`)
    expect(val(dark, 'background')).toBe('var(--color-accent)')
    expect(val(dark, 'color')).toBe('var(--color-on-accent)')
    const light = rule(`${SCOPE_LIGHT} .button[data-variant='primary']`)
    expect(val(light, 'background')).toBe('var(--color-surface)')
    expect(val(light, 'color')).toBe('var(--color-accent-text)')
  })

  it('the scope rules come AFTER the root rules (equal specificity: the later one wins, so the nearest scope is the one that paints)', () => {
    expect(index(SCOPE_DARK)).toBeGreaterThan(Math.max(index(ROOT_DARK), index(ROOT_LIGHT)))
    expect(index(SCOPE_LIGHT)).toBeGreaterThan(Math.max(index(ROOT_DARK), index(ROOT_LIGHT)))
  })

  it('the hero does not read the OS: no prefers-color-scheme and no data-theme in Tile.css', () => {
    const code = css.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(code).not.toMatch(/prefers-color-scheme/)
    expect(code).not.toMatch(/data-theme/)
  })
})

describe('Tile: the why chip on a hero (TB-05: a currentColor tint, one rule, in Tile.css)', () => {
  it('Tile.css owns it: a tint of currentColor, the text inherited, in light and dark alike', () => {
    const why = rule(".tile[data-variant='hero'] .chip[data-kind='why']")
    expect(val(why, 'background')).toMatch(/^color-mix\(in srgb, currentColor \d+%, transparent\)$/)
    expect(val(why, 'color')).toBe('inherit')
  })

  it('it has a 1 px currentColor boundary: the tint alone is about 1.3:1 on the hero and read as loose text on a dark hero', () => {
    expect(val(rule(".tile[data-variant='hero'] .chip[data-kind='why']"), 'box-shadow')).toMatch(
      /^inset 0 0 0 1px color-mix\(in srgb, currentColor \d+%, transparent\)$/,
    )
  })

  it("its icon is the hero's colour, not Chip.css's accent-text (a dark accent on the light accent hero all but hid the glyph)", () => {
    expect(val(rule(".tile[data-variant='hero'] .chip[data-kind='why'] svg"), 'color')).toBe('inherit')
  })

  it('the tint is at most 14 % (TB-05) and Chip.css has no second rule for the same chip (a surface chip there fought this one)', () => {
    const pct = Number(/currentColor (\d+)%/.exec(val(rule(".tile[data-variant='hero'] .chip[data-kind='why']"), 'background') ?? '')?.[1])
    expect(pct).toBeLessThanOrEqual(14)
    const chipCss = readUiCss('Chip.css').replace(/\/\*[\s\S]*?\*\//g, '')
    expect(chipCss).not.toMatch(/\.tile\[data-variant=['"]hero['"]\]\s*\.chip\[data-kind=['"]why['"]\]/)
  })
})

describe('Tile: warn tokens exist in styles.css for the first paint (B9-02 added them; a tone rule here must not outrun them)', () => {
  it('--status-warn-fg, -bg and -solid are declared', () => {
    const styles = readStylesCss()
    for (const part of ['fg', 'bg', 'solid']) expect(styles).toContain(`--status-warn-${part}:`)
  })
})
