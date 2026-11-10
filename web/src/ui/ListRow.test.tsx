import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { IconButton } from './IconButton'
import { ListGroup, ListRow } from './ListRow'
import { declarations, readUiCss, ruleBlocks } from './test-utils'

const inList = (row: React.ReactNode) => render(<ListGroup label="Stock">{row}</ListGroup>)

describe('ListGroup', () => {
  it('is a labelled list of rows', () => {
    render(
      <ListGroup label="Stock">
        <ListRow title="Milk" />
        <ListRow title="Eggs" />
      </ListGroup>,
    )
    const list = screen.getByRole('list', { name: 'Stock' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(2)
  })
})

describe('ListRow (plan 4.13)', () => {
  it.each([
    ['one line', {}, '56'],
    ['two lines', { meta: '2 packs' }, '64'],
    ['a thumb', { leading: <span data-testid="thumb" /> }, '72'],
    ['a thumb and two lines', { meta: '2 packs', leading: <span /> }, '72'],
  ] as const)('is %s: height %s', (_name, props, height) => {
    inList(<ListRow title="Milk" {...props} />)
    expect(screen.getByRole('listitem')).toHaveAttribute('data-height', height)
  })

  it('shows title, meta and a trailing value', () => {
    inList(<ListRow title="Milk" meta="Goes off Thu" trailing={<span>2 L</span>} />)
    expect(screen.getByText('Milk')).toBeInTheDocument()
    expect(screen.getByText('Goes off Thu')).toBeInTheDocument()
    expect(screen.getByText('2 L')).toBeInTheDocument()
  })

  it('draws its icon in the tinted leading square, decorative; a leading node wins over the icon', () => {
    const { container, rerender } = inList(<ListRow title="Milk" icon="stock" />)
    expect(container.querySelector('.list-row__lead svg')).toHaveAttribute('aria-hidden', 'true')
    rerender(<ListGroup label="Stock"><ListRow title="Milk" icon="stock" leading={<span data-testid="thumb" />} /></ListGroup>)
    expect(screen.getByTestId('thumb')).toBeInTheDocument()
    expect(container.querySelector('.list-row__lead svg')).toBeNull()
  })

  it('a chevron is decorative', () => {
    const { container } = inList(<ListRow title="Milk" chevron href="/stock/1" />)
    expect(container.querySelector('.list-row__chevron svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it('with href the whole row is one link named after the title', () => {
    inList(<ListRow title="Milk" href="/stock/1" />)
    expect(screen.getByRole('link', { name: 'Milk' })).toHaveAttribute('href', '/stock/1')
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('with onActivate the whole row is one button named after the title', async () => {
    const onActivate = vi.fn()
    inList(<ListRow title="Milk" onActivate={onActivate} />)
    await userEvent.click(screen.getByRole('button', { name: 'Milk' }))
    expect(onActivate).toHaveBeenCalledOnce()
  })

  it('without href or onActivate the row is static: no link, no button', () => {
    inList(<ListRow title="Milk" trailing={<span>2 L</span>} />)
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('a trailing IconButton works on its own and does not activate the row', async () => {
    const onActivate = vi.fn()
    const onDelete = vi.fn()
    inList(<ListRow title="Milk" onActivate={onActivate} trailing={<IconButton icon="delete" label="Delete Milk" onClick={onDelete} />} />)
    await userEvent.click(screen.getByRole('button', { name: 'Delete Milk' }))
    expect(onDelete).toHaveBeenCalledOnce()
    expect(onActivate).not.toHaveBeenCalled()
    expect(screen.getAllByRole('button')).toHaveLength(2)
  })

  it('marks the selected row', () => {
    inList(<ListRow title="Milk" onActivate={() => {}} selected />)
    expect(screen.getByRole('button', { name: 'Milk' })).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('listitem')).toHaveAttribute('data-selected', 'true')
  })

  it('rejects href together with onActivate at the type level', () => {
    // @ts-expect-error a row has at most one target
    const bad = () => <ListRow title="x" href="/a" onActivate={() => {}} />
    expect(bad).toBeTypeOf('function')
  })
})

describe('ListGroup scope', () => {
  it('carries data-primary-scope so a primary Button in a row is checked against the list', () => {
    const { container } = inList(<ListRow title="Milk" />)
    expect(container.querySelector('.list-group')).toHaveAttribute('data-primary-scope')
  })
})

describe('ListRow whole-row target (plan 4.13: the row is the tap target)', () => {
  it('a click on the target activates the row', async () => {
    const onActivate = vi.fn()
    inList(<ListRow title="Milk" meta="2 L" icon="stock" chevron onActivate={onActivate} />)
    await userEvent.click(screen.getByRole('button', { name: 'Milk' }))
    expect(onActivate).toHaveBeenCalledOnce()
  })
  // jsdom does no hit-testing, so the contract is in the stylesheet: content is click-through, only
  // interactive trailing content catches the pointer.
  const css = readUiCss('ListRow.css')
  it('non-target children are click-through and painted above the target', () => {
    const d = declarations(css, '.list-row > :not(.list-row__target)')
    expect(d['pointer-events']).toBe('none')
    // the absolute target has opaque hover/press/selected backgrounds: without a stacking lift it paints over the content
    expect(d.position).toBe('relative')
    expect(d['z-index']).toBe('1')
  })
  it('only interactive content inside .list-row__trailing is lifted and clickable', () => {
    const lifted = ruleBlocks(css).filter(
      (b) => b.selectors.every((s) => s.startsWith('.list-row__trailing ')) && /pointer-events\s*:\s*auto/.test(b.body) && /z-index\s*:\s*1\b/.test(b.body),
    )
    expect(lifted.length).toBeGreaterThan(0)
    for (const b of lifted) expect(b.selectors.join(','), 'targets interactive elements only').toMatch(/button|\ba\b|input|select|role/)
    // lead, title, meta and chevron never get pointer-events: auto
    for (const sel of ['.list-row__lead', '.list-row__leading', '.list-row__text', '.list-row__title', '.list-row__chevron']) {
      expect(declarations(css, sel)['pointer-events'], sel).not.toBe('auto')
    }
  })
})

describe('ListRow styling (plan 4.13)', () => {
  const css = readUiCss('ListRow.css')
  it('rows are 56 / 64 / 72 high with 16 px padding', () => {
    for (const h of ['56', '64', '72']) {
      expect(declarations(css, `.list-row[data-height='${h}']`)['block-size']).toBe(`${h}px`)
    }
    expect(declarations(css, '.list-row')['padding-inline']).toBe('var(--space-4)')
  })
  it('the leading square is 40 px, radius 12, soft fill, accent-text icon', () => {
    expect(declarations(css, '.list-row__lead')).toMatchObject({ 'inline-size': '40px', background: 'var(--color-soft)', color: 'var(--color-accent-text)', 'border-radius': 'var(--radius-thumb)' })
  })
  it('hover is surface-2, pressed surface-3; the divider is a 1 px line', () => {
    expect(declarations(css, '.list-row__target:hover')['background']).toBe('var(--color-surface-2)')
    expect(declarations(css, '.list-row__target:active')['background']).toBe('var(--color-surface-3)')
    expect(declarations(css, '.list-row + .list-row')['border-block-start']).toBe('1px solid var(--color-line)')
  })
})
