// B9-01 / DS-12 R-A: the Button variants are primary | secondary | danger | danger-secondary | link. There is no tertiary action.
// DS-03: `iconOnly="narrow"` (label hidden below the narrow band, the accessible name kept).
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Button } from './Button'

describe('Button variants (DS-12)', () => {
  it.each(['primary', 'secondary', 'danger', 'danger-secondary', 'link'] as const)('exposes variant %s', (variant) => {
    render(<Button variant={variant}>Go</Button>)
    expect(screen.getByRole('button', { name: 'Go' })).toHaveAttribute('data-variant', variant)
  })

  it.each(['ghost', 'tonal'] as const)('the deprecated %s alias renders as secondary (no tertiary exists)', (alias) => {
    render(<Button variant={alias}>Go</Button>)
    expect(screen.getByRole('button', { name: 'Go' })).toHaveAttribute('data-variant', 'secondary')
  })

  it('a danger-secondary Button is not a primary for the single-primary scope check', () => {
    render(<Button variant="danger-secondary">Delete</Button>)
    expect(screen.getByRole('button', { name: 'Delete' })).not.toHaveAttribute('data-variant', 'primary')
  })
})

describe('Button iconOnly="narrow" (DS-03)', () => {
  it('marks the button so the label hides in the narrow band, and keeps the label as the accessible name', () => {
    render(
      <Button icon="filter" iconOnly="narrow">
        Filters
      </Button>,
    )
    const b = screen.getByRole('button', { name: 'Filters' })
    expect(b).toHaveAttribute('data-icon-only', 'narrow')
    expect(b.querySelector('svg')).not.toBeNull()
  })

  it('has no data-icon-only by default', () => {
    render(<Button>Go</Button>)
    expect(screen.getByRole('button', { name: 'Go' })).not.toHaveAttribute('data-icon-only')
  })
})
