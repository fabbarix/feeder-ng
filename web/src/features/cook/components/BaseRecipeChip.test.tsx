// BR-H: the chip that names the Base recipe a Step comes from (system.md section 6: one line, never accent).
// Pinned: <BaseRecipeChip recipe={BaseRecipeLabel} />, a shared `Chip` (kind tag, no tagColour), text = lib/baseSteps baseChipText,
// accessible name "<text>, Base recipe".
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BECHAMEL, ROUX } from '../base-fixtures'
import { BaseRecipeChip } from './BaseRecipeChip'

describe('BaseRecipeChip', () => {
  it('shows the Base recipe\'s name', () => {
    render(<BaseRecipeChip recipe={BECHAMEL} />)
    expect(screen.getByText('Béchamel')).toBeInTheDocument()
  })

  it('shows the path of a nested one on one line', () => {
    render(<BaseRecipeChip recipe={ROUX} />)
    expect(screen.getByText('Béchamel · Roux')).toBeInTheDocument()
  })

  it('is announced as a Base recipe, naming it: "Béchamel · Roux, Base recipe" (one image, starts with its visible text)', () => {
    render(<BaseRecipeChip recipe={ROUX} />)
    expect(screen.getByRole('img', { name: 'Béchamel · Roux, Base recipe' })).toBeInTheDocument()
  })

  it('is a neutral, not clickable chip: a plain tag, never a status, a filter or an accent tint', () => {
    const { container } = render(<BaseRecipeChip recipe={BECHAMEL} />)
    const chip = container.querySelector('.chip')!
    expect(chip.tagName).toBe('SPAN')
    expect(chip).toHaveAttribute('data-kind', 'tag')
    expect(chip).not.toHaveAttribute('data-status')
    expect(chip).not.toHaveAttribute('data-tag-colour')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('keeps the full text as its tooltip, as every chip does (the label truncates to one line)', () => {
    const { container } = render(<BaseRecipeChip recipe={ROUX} />)
    expect(container.querySelector('.chip')).toHaveAttribute('title', 'Béchamel · Roux')
  })
})
