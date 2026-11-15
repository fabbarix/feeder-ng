// B9-40 (PC-03, PC-15, SHORT-01, DS 3) over features/cook/cook.css: the Step text size by length, the capped photo, the timer strip and rail, the
// short-landscape grid, the Advance Steps chip and line, the Reheat tile. The proposed CSS is in the mocks' <style data-proposed>; widths are the
// breakpoint table's (DS-09: check-ui media-width fails features/cook on a px width), so 560 px is 37.5 em and 700 px is 48 em.
import { describe, expect, it } from 'vitest'
import { blocksOf, type CssBlock } from '../../ui/lib/cssWalk.test-helper'

const blocks = blocksOf([], ['features/cook/cook.css'])
const at = (block: CssBlock, ...conds: string[]) => conds.every((c) => block.atrules.some((a) => a === `@media ${c}`))
/** The declarations of the rules for `selector` in the given media context ('' = none) merged, later wins. */
function css(selector: string, media = ''): Record<string, string> {
  const out: Record<string, string> = {}
  for (const b of blocks) {
    if (!b.selector.split(',').map((s) => s.trim()).includes(selector)) continue
    if (media === '' ? b.atrules.length > 0 : !(b.atrules.length === 1 && at(b, media))) continue
    for (const [p, v] of b.decls) out[p] = v
  }
  return out
}
const SHORT = '(max-height: 499px) and (min-width: 37.5em)'

describe('every width query in cook.css is the breakpoint table\'s (DS-09)', () => {
  it('(min-width: Xem) or (width < Xem), X in {23.5, 37.5, 48, 64, 80, 90}; never px, never max-width', () => {
    const bad = blocks.flatMap((b) => b.atrules).filter((a) => /@media/.test(a) && [...a.matchAll(/\(\s*((?:min-|max-)?width)\s*(:|<)\s*([^)]*)\)/g)].some((m) => !(((m[1] === 'min-width' && m[2] === ':') || (m[1] === 'width' && m[2] === '<')) && [23.5, 37.5, 48, 64, 80, 90].includes(Number(m[3]!.replace(/em$/, ''))) && /em$/.test(m[3]!))))
    expect([...new Set(bad)]).toEqual([])
  })
})

describe('Step text (PC-03: Medium at every size; a long Step uses a smaller role)', () => {
  it('a short Step is 1.875rem on a phone and 3.625rem from 48 em, weight var(--text-step-weight)', () => {
    expect(css('.cook-step__text')['font-size']).toBe('1.875rem')
    expect(css('.cook-step__text')['font-weight']).toBe('var(--text-step-weight)')
    expect(css('.cook-step__text', '(min-width: 48em)')['font-size']).toBe('3.625rem')
  })
  it('a long Step is title-2 on a phone and display from 48 em, and keeps the weight token', () => {
    expect(css('.cook-step__text[data-length="long"]')).toMatchObject({ 'font-size': 'var(--text-title-2-size)', 'line-height': 'var(--text-title-2-line)' })
    expect(css('.cook-step__text[data-length="long"]', '(min-width: 48em)')).toMatchObject({ 'font-size': 'var(--text-display-size)', 'line-height': 'var(--text-display-line)' })
    expect(css('.cook-step__text[data-length="long"]')['font-weight'] ?? css('.cook-step__text')['font-weight']).toBe('var(--text-step-weight)')
  })
  it('a word never overflows the tile', () => {
    expect(css('.cook-step__text')['overflow-wrap']).toBe('break-word')
  })
})

describe('the tap-zone chevrons never touch the Step text (B9-40 review, 390 px with a 50-word Step)', () => {
  // every text child (overline, Step text, Uses, …), never the photo, the zones or the coach mark
  const ZONED = '.cook-step:has(.cook-step__zone) > :not(.cook-step__photo):not(.cook-step__zone):not(.cook-step__coach)'
  it('with zones the overline, the text and the other lines keep the room of the 28 px chevron and its inset beyond the tile padding', () => {
    expect(css('.cook-step')['--cook-zone-glyph']).toBe('1.75rem')
    expect(css(ZONED)['padding-inline']).toBe('max(0rem, calc(var(--space-half) + var(--cook-zone-glyph) + var(--space-1) - var(--tile-pad)))')
  })
  it('short landscape draws no chevrons, so it keeps no room', () => {
    expect(css(ZONED, SHORT)['padding-inline']).toBe('0')
  })
})

describe('Step photo (PC-03: capped, so Back and Next stay on screen)', () => {
  it('is at most min(32dvh, 22rem), and min(40dvh, 26rem) from 64 em', () => {
    expect(css('.cook-step__image')['max-block-size']).toBe('min(32dvh, 22rem)')
    expect(css('.cook-step__image', '(min-width: 64em)')['max-block-size']).toBe('min(40dvh, 26rem)')
  })
  it('the figure is positioned for its Enlarge button, which sits over the photo\'s bottom end', () => {
    expect(css('.cook-step__photo').position).toBe('relative')
    expect(css('.cook-step__photo .icon-button')).toMatchObject({ position: 'absolute' })
  })
})

describe('the timer strip (PC-03: one sticky line of pills with room for rings)', () => {
  it('scrolls sideways, hides its scrollbar and keeps 5 px of room for the focus ring of its first and last control (R-C)', () => {
    const strip = css('.cook-strip')
    expect(strip.display).toBe('flex')
    expect(strip['overflow-x']).toBe('auto')
    expect(strip['scrollbar-width']).toBe('none')
    // 5 px in the token form (3 px ring + 2 px offset): check-ui raw-spacing fails a literal 5px in features/cook.
    expect(strip.padding).toBe('calc(var(--focus-ring-width) + var(--focus-ring-offset))')
  })
  it('spans both nav columns', () => {
    expect(css('.cook-nav .cook-strip')['grid-column']).toBe('1 / -1')
  })
  it('a pill never shrinks to a stub or runs wider than 78 % of the strip', () => {
    expect(css('.cook-strip .timer-pill')).toMatchObject({ flex: 'none', 'max-inline-size': '78%' })
  })
})

describe('the rail (PC-03: from 1024 px, the Step column plus a 22 rem sticky rail)', () => {
  const desktop = '(min-width: 64em)'
  it('the screen is a grid of the Step and a 22 rem rail, at most 1480 px wide', () => {
    const screen = css('.cook-screen', desktop)
    expect(screen.display).toBe('grid')
    expect(screen['grid-template-columns']).toBe('minmax(0, 1fr) 22rem')
    expect(screen['max-width']).toBe('1480px')
  })
  it('the rail is sticky in the second column and scrolls on its own when taller than the screen', () => {
    const rail = css('.cook-rail', desktop)
    expect(rail.position).toBe('sticky')
    expect(rail['grid-column']).toBe('2')
    expect(rail['overflow']).toBe('auto')
    expect(rail['max-block-size']).toContain('100dvh')
  })
  it('everything but the rail stays in the first column', () => {
    expect(css('.cook-screen > :not(.cook-rail)', desktop)['grid-column']).toBe('1')
  })
})

describe('the held line (PC-12, PC-16 item 2: an icon and one line of text)', () => {
  it('is a flex row with the icon centred on the text', () => {
    expect(css('.cook-nav__held')).toMatchObject({ display: 'flex', 'align-items': 'center' })
  })
  it('stays hidden while empty', () => {
    expect(css('.cook-nav__held:empty').display).toBe('none')
  })
})

describe('Advance Steps in the info tone (DS 3)', () => {
  it('the one-line summary is an info line: info fill, 1 px info boundary, info text', () => {
    expect(css('.cook-advance-line')).toMatchObject({
      background: 'var(--color-info-bg)',
      color: 'var(--color-info-fg)',
    })
    expect(css('.cook-advance-line').border).toBe('1px solid var(--color-info-fg)')
  })
  it('the chip is a 40 px round button with an info boundary and info text, never wrapping', () => {
    const chip = css('.cook-advance-chip')
    expect(chip['min-block-size']).toBe('40px')
    expect(chip['border-radius']).toMatch(/^(999px|var\(--radius-pill\))$/)
    expect(chip.background).toBe('var(--color-info-bg)')
    expect(chip.color).toBe('var(--color-info-fg)')
    expect(chip['box-shadow']).toBe('inset 0 0 0 1px var(--color-info-fg)')
    expect(chip['white-space']).toBe('nowrap')
  })
  it('the chip shows its count only between 37.5 em and 48 em in short landscape (the name stays "Advance Steps: N to do")', () => {
    expect(css('.cook-advance-chip__short').display).toBe('none')
    const narrow = `${SHORT} and (width < 48em)`
    expect(css('.cook-advance-chip__long', narrow).display).toBe('none')
    expect(css('.cook-advance-chip__short', narrow).display).toBe('inline')
  })
  it('no Advance Steps rule paints the spoil or warn tone', () => {
    const own = blocks.filter((b) => /cook-advance/.test(b.selector)).flatMap((b) => b.decls.map(([, v]) => v))
    expect(own.filter((v) => /spoil|warn|danger/.test(v))).toEqual([])
  })
})

describe('the top row (PC-03: one line at 375 px)', () => {
  it('does not wrap, and Ingredients is icon-only (a 44 px square) below 37.5 em', () => {
    expect(css('.cook-top')['flex-wrap']).toBe('nowrap')
    expect(css('.cook-ingredients__label', '(width < 37.5em)').display).toBe('none')
    expect(css('.cook-ingredients', '(width < 37.5em)')).toMatchObject({ 'inline-size': '44px', padding: '0' })
  })
  it('Ingredients and Voice sit at the end of the row', () => {
    expect(css('.cook-top .cook-ingredients')['margin-inline-start']).toBe('auto')
  })
})

describe('short landscape (SHORT-01: Back and Next are side columns; the Step fills the middle)', () => {
  const grid = css('.cook-screen', SHORT)
  it('the screen is a grid exactly as high as the viewport, with the side columns, a middle that takes the rest, and rows for the top row, the Step, the strip and the held line', () => {
    expect(grid.display).toBe('grid')
    expect(grid['grid-template-columns']).toBe('clamp(88px, 11vw, 104px) minmax(0, 1fr) auto auto clamp(104px, 16vw, 144px)')
    expect(grid['grid-template-rows']).toBe('auto minmax(0, 1fr) auto auto')
    expect(grid['block-size']).toBe('100dvh')
    expect(grid['min-block-size']).toBe('0')
    expect(grid['max-width']).toBe('none')
  })
  it('its padding is the safe-area insets on every side (SHORT-05)', () => {
    for (const side of ['top', 'right', 'bottom', 'left']) expect(grid.padding).toContain(`var(--safe-${side})`)
  })
  it('the top row and the nav only place their children in the grid', () => {
    expect(css('.cook-top', SHORT).display).toBe('contents')
    expect(css('.cook-nav', SHORT).display).toBe('contents')
  })
  it('the Step tile scrolls inside itself, centred when it fits, and spans the middle columns', () => {
    const step = css('.cook-step', SHORT)
    expect(step['grid-column']).toBe('2 / 5')
    expect(step['overflow-y']).toBe('auto')
    expect(step['align-content']).toBe('safe center')
    expect(step['min-block-size']).toBe('0')
    expect(step['padding-block']).toBe('calc(var(--focus-ring-width) + var(--focus-ring-offset))')
  })
  it('Back is the left column and Next the right one, both from the first row under the top row to the bottom, the arrow above the label', () => {
    const tile = css('.cook-nav__tile', SHORT)
    expect(tile['grid-row']).toBe('2 / -1')
    expect(tile['flex-direction']).toBe('column')
    expect(tile['block-size']).toBe('100%')
    expect(tile['min-height']).toBe('0')
    expect(css('.cook-nav__tile:nth-of-type(1)', SHORT)['grid-column']).toBe('1')
    expect(css('.cook-nav__tile:nth-of-type(2)', SHORT)['grid-column']).toBe('5')
  })
  it('the Recipe title is one line with an ellipsis (title-3), the full name stays in the h1', () => {
    expect(css('.cook-screen__title', SHORT)).toMatchObject({ 'white-space': 'nowrap', 'text-overflow': 'ellipsis', overflow: 'hidden', 'font-size': 'var(--text-title-3-size)' })
  })
  it('the tap-zone chevrons are not drawn (the zones still work)', () => {
    expect(css('.cook-step__zone', SHORT).display).toBe('none')
  })
  it('the timer strip is whole pills in one line: no sideways scroll', () => {
    const strip = css('.cook-strip', SHORT)
    expect(strip.overflow).toBe('visible')
    expect(css('.cook-nav > .cook-strip', SHORT)).toMatchObject({ 'grid-row': '3', 'grid-column': '2 / 5' })
  })
  it('the held line is under the strip, between the side columns', () => {
    expect(css('.cook-nav__held', SHORT)).toMatchObject({ 'grid-row': '4', 'grid-column': '2 / 5' })
  })
  it('the title and the chip sit on the top row: title in column 2, chip in 3, Ingredients in 4, Voice in 5', () => {
    expect(css('.cook-screen__header', SHORT)['grid-column']).toBe('2')
    expect(css('.cook-advance-chip', SHORT)['grid-column']).toBe('3')
    expect(css('.cook-top > .cook-ingredients', SHORT)['grid-column']).toBe('4')
    expect(css('.cook-top > .cook-voice', SHORT)['grid-column']).toBe('5')
  })
  it('the coach mark is one row: text and an outlined "Got it" that never wraps', () => {
    expect(css('.cook-step__coach', '(max-height: 499px)')['flex-wrap']).toBe('nowrap')
    expect(css('.cook-step__coach .button', '(max-height: 499px)')['white-space']).toBe('nowrap')
  })
  it('a long Step uses title-2 on a short viewport too', () => {
    expect(css('.cook-step__text[data-length="long"]', '(max-height: 499px)')['font-size']).toBe('var(--text-title-2-size)')
  })
})

describe('short and narrow (SHORT-01: portrait\'s layout stays with 52 px Back and Next)', () => {
  const m = '(max-height: 499px) and (width < 37.5em)'
  it('the nav tiles are 52 px, the title title-3', () => {
    expect(css('.cook-nav__tile', m)['min-height']).toBe('52px')
    expect(css('.cook-screen__title', m)['font-size']).toBe('var(--text-title-3-size)')
  })
})

describe('Reheat tile (PC-15: the same column at every width, 40 rem at most)', () => {
  it('is a centred column no wider than 40 rem; the time is large and tabular', () => {
    expect(css('.reheat-tile')).toMatchObject({ 'max-inline-size': '40rem', 'margin-inline': 'auto' })
    expect(css('.reheat-time')['font-size']).toBe('3.5rem')
    expect(css('.reheat-time')['font-variant-numeric']).toBe('tabular-nums')
  })
  it('the tile\'s one action is full width, and so is Mark as Cooked below it', () => {
    expect(css('.reheat-tile .button')['inline-size'] ?? css('.reheat-tile .button').width).toBe('100%')
  })
  it('the old row of three wrapping buttons is gone', () => {
    expect(blocks.some((b) => b.selector === '.reheat-actions' && b.decls.some(([p, v]) => p === 'flex-wrap' && v === 'wrap'))).toBe(false)
  })
})
