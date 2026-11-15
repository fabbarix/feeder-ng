// DS-A (docs/design/system.md §6): a chip is one line, at least 26 px (B9-17: a minimum, DS-08), its label truncates with an ellipsis and the full text stays
// available (tooltip `title` and the accessible name). One kind, one look: a why chip is neutral with an accent icon (an
// accent-soft fill read as "spoiling" with a red accent), "Leftover for" is the outlined leftover tone.
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Chip } from './Chip'
import { declarations, readUiCss } from './test-utils'

const css = readUiCss('Chip.css')
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '')
const long = 'Mia and Fabio’s favourite, and also Sam’s on Sundays'

describe('Chip: one line', () => {
  it('wraps its text in a label span that can truncate', () => {
    const { container } = render(<Chip kind="why" icon="favourite">{long}</Chip>)
    expect(container.querySelector('.chip > .chip__label')).toHaveTextContent(long)
  })

  it('a text chip carries its full text as the tooltip (title)', () => {
    const { container } = render(<Chip kind="status" status="leftover">{long}</Chip>)
    expect(container.querySelector('.chip')).toHaveAttribute('title', long)
  })

  it('a clickable chip is named by its full text even when the label is cut', () => {
    render(<Chip kind="why" onClick={() => {}}>{long}</Chip>)
    expect(screen.getByRole('button')).toHaveAccessibleName(long)
    expect(screen.getByRole('button')).toHaveAttribute('title', long)
  })

  it('is at least 1.625rem (26 px at the default text size) high, never wraps, and its label ends in an ellipsis (B9-17, DS-08: a minimum, not a fixed height)', () => {
    const chip = declarations(css, '.chip')
    expect(chip['min-block-size']).toBe('1.625rem')
    expect(chip['block-size']).toBe('auto')
    expect(chip['white-space']).toBe('nowrap')
    expect(chip['max-inline-size']).toBe('100%')
    expect(chip['min-inline-size']).toBe('0')
    const label = declarations(css, '.chip__label')
    expect(label['overflow']).toBe('hidden')
    expect(label['text-overflow']).toBe('ellipsis')
    expect(label['min-inline-size']).toBe('0')
  })

  it('no rule anywhere in Chip.css lets a chip wrap (white-space normal); the one block-size: auto is the .chip rule that pairs it with min-block-size', () => {
    expect(code(css)).not.toMatch(/white-space:\s*normal/)
    const autos = [...code(css).matchAll(/([^{}]+)\{[^}]*block-size:\s*auto/g)].map((m) => m[1]!.trim())
    expect(autos).toEqual(['.chip'])
  })
})

describe('Chip: one kind, one look', () => {
  it('a why chip is the neutral container with an accent-coloured icon (not an accent-soft fill)', () => {
    expect(declarations(css, ".chip[data-kind='why']")).toMatchObject({ background: 'var(--color-surface-2)', color: 'var(--color-text)' })
    expect(declarations(css, ".chip[data-kind='why'] svg")['color']).toBe('var(--color-accent-text)')
  })

  it('"Leftover for" is the outlined leftover tone: <Chip kind="status" status="leftover" outline>', () => {
    const { container } = render(<Chip kind="status" status="leftover" outline>Leftover for Fri</Chip>)
    expect(container.querySelector('.chip')).toHaveAttribute('data-outline', 'true')
    const d = declarations(css, ".chip[data-kind='status'][data-status='leftover'][data-outline='true']")
    expect(d['background']).toBe('transparent')
    expect(d['box-shadow']).toBe('inset 0 0 0 1.5px var(--status-leftover-solid)')
    expect(d['color']).toBe('var(--status-leftover-fg)')
  })
})
