import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ChoiceChip } from './ChoiceChip'
import { declarations, readUiCss } from './test-utils'

describe('ChoiceChip', () => {
  it('is a real button that calls onClick', async () => {
    const onClick = vi.fn()
    render(<ChoiceChip onClick={onClick}>500 g</ChoiceChip>)
    const chip = screen.getByRole('button', { name: '500 g' })
    expect(chip).toHaveAttribute('type', 'button')
    await userEvent.click(chip)
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('a toggle carries aria-pressed; a chip that acts at once has none', () => {
    render(
      <>
        <ChoiceChip pressed onClick={() => {}}>
          500 g
        </ChoiceChip>
        <ChoiceChip pressed={false} onClick={() => {}}>
          1 kg
        </ChoiceChip>
        <ChoiceChip onClick={() => {}}>Mozzarella</ChoiceChip>
      </>,
    )
    expect(screen.getByRole('button', { name: '500 g' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '1 kg' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Mozzarella' })).not.toHaveAttribute('aria-pressed')
  })

  it('shows a leading Thumb (its monogram without a Picture), or else a leading icon, and a muted note', () => {
    const { container, rerender } = render(
      <ChoiceChip thumb={{ name: 'Mozzarella' }} icon="search" note="125 g" onClick={() => {}}>
        Mozzarella
      </ChoiceChip>,
    )
    expect(container.querySelector('.choice-chip__lead .thumb')).not.toBeNull()
    expect(container.querySelector('.choice-chip__lead svg')).toBeNull()
    expect(screen.getByText('125 g')).toHaveClass('choice-chip__note')
    expect(screen.getByRole('button')).toHaveAccessibleName('Mozzarella 125 g')
    rerender(
      <ChoiceChip icon="search" onClick={() => {}}>
        Something else
      </ChoiceChip>,
    )
    expect(container.querySelector('.choice-chip__lead svg')).not.toBeNull()
    expect(container.querySelector('.choice-chip__note')).toBeNull()
  })

  it('names its variant (filled by default) and can be disabled', () => {
    render(
      <>
        <ChoiceChip onClick={() => {}}>a</ChoiceChip>
        <ChoiceChip variant="outline" onClick={() => {}}>
          b
        </ChoiceChip>
        <ChoiceChip variant="quiet" disabled onClick={() => {}}>
          c
        </ChoiceChip>
      </>,
    )
    expect(screen.getByRole('button', { name: 'a' })).toHaveAttribute('data-variant', 'filled')
    expect(screen.getByRole('button', { name: 'b' })).toHaveAttribute('data-variant', 'outline')
    expect(screen.getByRole('button', { name: 'c' })).toBeDisabled()
  })

  it('a label replaces the accessible name', () => {
    render(
      <ChoiceChip label="Mozzarella, 125 g still to get" note="125 g" onClick={() => {}}>
        Mozzarella
      </ChoiceChip>,
    )
    expect(screen.getByRole('button', { name: 'Mozzarella, 125 g still to get' })).toBeInTheDocument()
  })
})

describe('ChoiceChip.css', () => {
  const css = readUiCss('ChoiceChip.css')

  it('is tap-sized: at least 44 px high, a pill', () => {
    const d = declarations(css, '.choice-chip')
    expect(d['min-block-size']).toBe('44px')
    expect(d['border-radius']).toBe('var(--radius-pill)')
  })

  it('a pressed chip uses the primary container tokens', () => {
    const d = declarations(css, ".choice-chip[aria-pressed='true']")
    expect(d['background']).toBe('var(--color-primary-container)')
    expect(d['color']).toBe('var(--color-on-primary-container)')
  })

  it('has no raw colours and no px font sizes: tokens only', () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/)
    expect(css).not.toMatch(/font-size:\s*\d/)
  })
})
