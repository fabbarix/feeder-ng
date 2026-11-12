// QA-1 (1.0.0-beta.4.1): "Choose a Recipe" on the Today hero was a tertiary Button (accent text, transparent) on the accent
// hero: 1.5:1 in light, 1.3:1 in dark. On the accent surface it is a Button whose variant the hero restyles with
// tokens that meet AA. The contrast is computed from the tokens of the rendered variant, not from a fixed variant name.
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { contrastRatio } from '../../../theme/contrast'
import { generatePalette, type ColorToken, type Scheme } from '../../../theme/palette'
import { ACCENT_PRESETS } from '../../settings/lib/accents'
import { EXCLUDED, dinner, empty, planned } from '../couldnt-fixtures'
import { readSource } from '../test-css'
import { TonightHero } from './TonightHero'

const AA = 4.5
const buttonCss = readSource('ui/Button.css')

function heroAction() {
  const slot = dinner('2026-11-10', [planned(1, 'Main'), empty(2, 'Starter', EXCLUDED)], { time: '19:00', at: '2026-11-10T19:00:00Z', cookMinutes: 30, startBy: '18:30' })
  const noop = vi.fn()
  render(
    <MemoryRouter>
      <TonightHero slot={slot} now={new Date('2026-11-10T17:00:00Z')} today="2026-11-10" onCook={noop} onYesCooked={noop} onAdjust={noop} rowHandlers={{ onOpen: noop, onChoose: noop }} />
    </MemoryRouter>,
  )
  return within(screen.getByRole('listitem', { name: 'Starter' })).getByRole('button', { name: 'Choose a Recipe' })
}

/** Declarations of `selector` (exact, whitespace-normalised) in Button.css; '' when missing. */
function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = new RegExp(`(^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`, 'm').exec(buttonCss)
  return m ? m[2]!.replace(/\s+/g, ' ') : ''
}
const token = (block: string, prop: 'color' | 'background'): ColorToken | 'transparent' | null => {
  const m = new RegExp(`(?:^|[;\\s])${prop}:\\s*(?:var\\(--color-([a-z0-9-]+)\\)|(transparent))`).exec(block)
  if (!m) return null
  if (m[2]) return 'transparent'
  return m[1]!.replace(/-([a-z0-9])/g, (_s, c: string) => c.toUpperCase()) as ColorToken
}

describe('Today hero: Choose a Recipe on the accent surface', () => {
  it('is a real Button (a <button>, class "button"), not styled text', () => {
    const b = heroAction()
    expect(b.tagName).toBe('BUTTON')
    expect(b).toHaveClass('button')
  })

  it('uses a variant that the hero restyles for the accent surface, never the tertiary accent-text-on-accent', () => {
    const variant = heroAction().getAttribute('data-variant')!
    expect(variant).not.toBe('tertiary')
    expect(rule(`.tile[data-variant='hero'] .button[data-variant='${variant}']`), `no hero rule for ${variant}`).not.toBe('')
  })

  it.each(ACCENT_PRESETS.flatMap((p) => (['light', 'dark'] as Scheme[]).map((s) => [p.name, p.hex, s] as const)))(
    'its label meets 4.5:1 on its own background: %s %s',
    (_name, hex, scheme) => {
      const variant = heroAction().getAttribute('data-variant')!
      const block = rule(`.tile[data-variant='hero'] .button[data-variant='${variant}']`) || rule(`.button[data-variant='${variant}']`)
      const c = generatePalette({ accent: hex }, scheme).colors
      const fg = token(block, 'color')
      let bg = token(block, 'background')
      expect(fg, 'label colour token').not.toBeNull()
      if (bg === 'transparent' || bg === null) bg = 'accent' // the hero tile's own background
      expect(contrastRatio(c[fg as ColorToken], c[bg])).toBeGreaterThanOrEqual(AA)
    },
  )
})
