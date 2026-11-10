import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Avatar } from './Avatar'
import { Chip } from './Chip'
import { EmptyState } from './EmptyState'
import { WhyChip } from './WhyChip'
import { declarations, readUiCss } from './test-utils'

describe('Chip', () => {
  it('defaults to a static tag chip', () => {
    render(<Chip>pasta</Chip>)
    const el = screen.getByText('pasta').closest('.chip')!
    expect(el).toHaveAttribute('data-kind', 'tag')
    expect(screen.queryByRole('button')).toBeNull()
  })

  it.each(['why', 'tag', 'count'] as const)('exposes kind %s', (kind) => {
    render(<Chip kind={kind}>x</Chip>)
    expect(screen.getByText('x').closest('.chip')).toHaveAttribute('data-kind', kind)
  })

  it.each(['state', 'status'] as const)('%s chips carry their status', (kind) => {
    render(<Chip kind={kind} status="spoil">Goes off Thu</Chip>)
    const el = screen.getByText('Goes off Thu').closest('.chip')!
    expect(el).toHaveAttribute('data-kind', kind)
    expect(el).toHaveAttribute('data-status', 'spoil')
  })

  it('a status or state chip without a status falls back to the tag look and warns in dev', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    render(<Chip kind="status">x</Chip>)
    expect(screen.getByText('x').closest('.chip')).toHaveAttribute('data-kind', 'tag')
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('draws an IconName icon through Icon, decorative', () => {
    const { container } = render(<Chip kind="status" status="leftover" icon="leftover">Leftover from Mon</Chip>)
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it('a filter chip is a button with aria-pressed, a Check icon only while on', async () => {
    const onClick = vi.fn()
    const { container, rerender } = render(<Chip kind="filter" onClick={onClick} selected={false}>Fish</Chip>)
    const chip = screen.getByRole('button', { name: 'Fish' })
    expect(chip).toHaveAttribute('aria-pressed', 'false')
    expect(chip).toHaveAttribute('data-kind', 'filter')
    expect(container.querySelector('svg')).toBeNull()
    await userEvent.click(chip)
    expect(onClick).toHaveBeenCalledOnce()
    rerender(<Chip kind="filter" onClick={onClick} selected>Fish</Chip>)
    expect(screen.getByRole('button', { name: 'Fish' })).toHaveAttribute('aria-pressed', 'true')
    expect(container.querySelector('svg')).not.toBeNull()
  })

  it('a clickable chip without a kind is a filter', () => {
    render(<Chip onClick={() => {}} selected={false}>Fish</Chip>)
    expect(screen.getByRole('button', { name: 'Fish' })).toHaveAttribute('data-kind', 'filter')
  })

  it('a disabled filter chip does not fire', async () => {
    const onClick = vi.fn()
    render(<Chip kind="filter" onClick={onClick} disabled>Fish</Chip>)
    await userEvent.click(screen.getByRole('button'))
    expect(onClick).not.toHaveBeenCalled()
  })

  it('compat: the deprecated tone maps onto kind and status', () => {
    render(<><Chip tone="spoil">A</Chip><Chip tone="accent">B</Chip><Chip tone="neutral">C</Chip></>)
    const a = screen.getByText('A').closest('.chip')!
    expect(a).toHaveAttribute('data-kind', 'status')
    expect(a).toHaveAttribute('data-status', 'spoil')
    expect(screen.getByText('B').closest('.chip')).toHaveAttribute('data-kind', 'why')
    expect(screen.getByText('C').closest('.chip')).toHaveAttribute('data-kind', 'tag')
  })

  it('compat: a ReactNode icon is still rendered', () => {
    render(<Chip icon={<i data-testid="legacy" />}>x</Chip>)
    expect(screen.getByTestId('legacy')).toBeInTheDocument()
  })
})

describe('Chip kinds map to tokens (plan 4.3)', () => {
  const STATUSES = ['leftover', 'spoil', 'danger', 'success', 'pinned'] as const
  const css = readUiCss('Chip.css')

  it('why: soft / accent-text', () => {
    expect(declarations(css, ".chip[data-kind='why']")).toMatchObject({ background: 'var(--color-soft)', color: 'var(--color-accent-text)' })
  })
  it('tag: surface-2 / muted', () => {
    expect(declarations(css, ".chip[data-kind='tag']")).toMatchObject({ background: 'var(--color-surface-2)', color: 'var(--color-muted)' })
  })
  it('count: surface-2 / text', () => {
    expect(declarations(css, ".chip[data-kind='count']")).toMatchObject({ background: 'var(--color-surface-2)', color: 'var(--color-text)' })
  })
  it('filter off: surface with a 1 px outline border / text', () => {
    const d = declarations(css, ".chip[data-kind='filter']")
    expect(d).toMatchObject({ background: 'var(--color-surface)', color: 'var(--color-text)' })
    expect(d.border).toBe('1px solid var(--color-outline)')
  })
  it('filter on: accent / on-accent', () => {
    expect(declarations(css, ".chip[data-kind='filter'][aria-pressed='true']")).toMatchObject({
      background: 'var(--color-accent)',
      color: 'var(--color-on-accent)',
    })
  })
  it.each(['state', 'status'] as const)('%s: the status container / status fg, for every status', (kind) => {
    for (const s of STATUSES) {
      expect(declarations(css, `.chip[data-kind='${kind}'][data-status='${s}']`)).toMatchObject({
        background: `var(--status-${s}-bg)`,
        color: `var(--status-${s}-fg)`,
      })
    }
  })
  it('uses the chip type token and the chip radius', () => {
    const d = declarations(css, '.chip')
    expect(d['font-size']).toBe('var(--text-chip-size)')
    expect(d['border-radius']).toBe('var(--radius-chip)')
  })
})

describe('WhyChip', () => {
  it('shows the planner reason as a why chip', () => {
    render(<WhyChip reason="uses Monday's chicken" />)
    const el = screen.getByText("uses Monday's chicken")
    expect(el.closest('[data-kind="why"]')).not.toBeNull()
  })

  it('draws the icon of its cause, the sparkle by default', () => {
    const html = (cause?: 'overlap' | 'favourite') => {
      const { container, unmount } = render(<WhyChip reason="r" cause={cause} />)
      const out = container.querySelector('svg')?.innerHTML
      unmount()
      return out
    }
    expect(html()).toBeTruthy()
    expect(html('overlap')).not.toBe(html())
    expect(html('favourite')).not.toBe(html('overlap'))
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

  it('draws an icon in the art circle and lets the title level be chosen', () => {
    const { container } = render(<EmptyState icon="planEmpty" title="The week is wide open" headingLevel={3} />)
    expect(screen.getByRole('heading', { level: 3, name: 'The week is wide open' })).toBeInTheDocument()
    expect(container.querySelector('.empty-state__art svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it('compat: a deprecated illustration is still rendered when no icon is given', () => {
    render(<EmptyState title="t" illustration={<svg data-testid="art" />} />)
    expect(screen.getByTestId('art')).toBeInTheDocument()
  })
})

describe('EmptyState styling (plan 4.11)', () => {
  const css = readUiCss('EmptyState.css')
  it('keeps the text to 34ch and sits the art in a 96 px soft circle', () => {
    expect(declarations(css, '.empty-state__text')['max-inline-size']).toBe('34ch')
    const art = declarations(css, '.empty-state__art')
    expect(art.background).toBe('var(--color-soft)')
    expect(art['border-radius']).toBe('50%')
    expect(art['inline-size']).toBe('96px')
  })
})
