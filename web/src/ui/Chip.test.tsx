import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Avatar } from './Avatar'
import { Chip } from './Chip'
import { EmptyState } from './EmptyState'
import { WhyChip } from './WhyChip'

describe('Chip', () => {
  it('renders static text with a tone', () => {
    render(<Chip tone="spoil">Use soon</Chip>)
    expect(screen.getByText('Use soon')).toHaveAttribute('data-tone', 'spoil')
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('is a button when clickable, with pressed state when selected is given', async () => {
    const onClick = vi.fn()
    const { rerender } = render(<Chip onClick={onClick} selected={false}>Fish</Chip>)
    const chip = screen.getByRole('button', { name: 'Fish' })
    expect(chip).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(chip)
    expect(onClick).toHaveBeenCalledOnce()
    rerender(<Chip onClick={onClick} selected>Fish</Chip>)
    expect(screen.getByRole('button', { name: 'Fish' })).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('WhyChip', () => {
  it('shows the planner reason', () => {
    render(<WhyChip reason="uses Monday's chicken" />)
    const el = screen.getByText("uses Monday's chicken")
    expect(el.closest('[data-kind="why"]')).not.toBeNull()
  })

  it('is tappable when given onClick', async () => {
    const onClick = vi.fn()
    render(<WhyChip reason="Anna's favourite" onClick={onClick} />)
    await userEvent.click(screen.getByRole('button', { name: /Anna's favourite/ }))
    expect(onClick).toHaveBeenCalledOnce()
  })
})

describe('Avatar', () => {
  it('shows initials when there is no image', () => {
    render(<Avatar name="Anna Rossi" />)
    const el = screen.getByLabelText('Anna Rossi')
    expect(el).toHaveTextContent('AR')
    expect(el).toHaveAttribute('data-size', 'md')
  })

  it('shows the image with the name as alt text', () => {
    render(<Avatar name="Anna Rossi" imageUrl="/a.png" size="lg" />)
    expect(screen.getByRole('img', { name: 'Anna Rossi' })).toHaveAttribute('src', '/a.png')
  })

  it('falls back to a question mark for an empty name', () => {
    render(<Avatar name="" />)
    expect(screen.getByText('?')).toBeInTheDocument()
  })
})

describe('EmptyState', () => {
  it('renders title, description, illustration and action', () => {
    render(
      <EmptyState
        title="No Recipes yet"
        description="Add your first Recipe."
        illustration={<svg data-testid="art" />}
        action={<button>Add Recipe</button>}
      />,
    )
    expect(screen.getByRole('heading', { name: 'No Recipes yet' })).toBeInTheDocument()
    expect(screen.getByText('Add your first Recipe.')).toBeInTheDocument()
    expect(screen.getByTestId('art')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add Recipe' })).toBeInTheDocument()
  })

  it('works with only a title', () => {
    render(<EmptyState title="Nothing here" />)
    expect(screen.getByRole('heading', { name: 'Nothing here' })).toBeInTheDocument()
  })
})
