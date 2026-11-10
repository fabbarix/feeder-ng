import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { BentoGrid } from './BentoGrid'
import { ProgressTile } from './ProgressTile'
import { Tile, TileMetric } from './Tile'
import { declarations, readUiCss, ruleBlocks } from './test-utils'
import { TimerTile } from './TimerTile'

describe('Tile', () => {
  it('is a plain surface tile spanning one column by default', () => {
    render(<Tile>Tonight: lasagne</Tile>)
    const el = screen.getByText('Tonight: lasagne')
    expect(el).toHaveAttribute('data-variant', 'surface')
    expect(el).toHaveAttribute('data-span', '1')
  })

  it.each(['surface', 'hero', 'soft', 'media', 'action'] as const)('exposes variant %s', (variant) => {
    render(<Tile variant={variant}>x</Tile>)
    expect(screen.getByText('x')).toHaveAttribute('data-variant', variant)
  })

  it.each(['leftover', 'spoil', 'danger', 'success', 'pinned'] as const)('status variant carries status %s', (status) => {
    render(<Tile variant="status" status={status}>x</Tile>)
    expect(screen.getByText('x')).toHaveAttribute('data-variant', 'status')
    expect(screen.getByText('x')).toHaveAttribute('data-status', status)
  })

  it.each([1, 2, 'full'] as const)('exposes span %s', (span) => {
    render(<Tile span={span}>x</Tile>)
    expect(screen.getByText('x')).toHaveAttribute('data-span', String(span))
  })

  it('exposes rowSpan', () => {
    render(<Tile rowSpan={2}>x</Tile>)
    expect(screen.getByText('x')).toHaveAttribute('data-row-span', '2')
  })

  it('renders an overline with an optional decorative icon, and a media header', () => {
    const { container } = render(
      <Tile overline="Use soon" overlineIcon="useSoon" media={<img alt="" src="/p.jpg" />}>body</Tile>,
    )
    expect(screen.getByText('Use soon')).toBeInTheDocument()
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    expect(container.querySelector('.tile__media img')).not.toBeNull()
  })

  it('is the scope of the single-primary dev warning', () => {
    render(<Tile>x</Tile>)
    expect(screen.getByText('x')).toHaveAttribute('data-primary-scope')
  })

  it('applies an accessible label', () => {
    render(<Tile aria-label="Dinner tonight">x</Tile>)
    expect(screen.getByLabelText('Dinner tonight')).toBeInTheDocument()
  })
})

describe('Tile never renders a button (plan 4.4)', () => {
  it('a plain tile contains no button and is no button', () => {
    const { container } = render(<Tile>plain</Tile>)
    expect(container.querySelector('button')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it.each(['surface', 'hero', 'soft', 'status', 'media', 'action'] as const)('the %s variant is not a <button>', (variant) => {
    render(<Tile variant={variant} status="spoil" stretched={{ label: 'Open', onActivate: () => {} }}>x</Tile>)
    expect(screen.getByRole('article').tagName).toBe('ARTICLE')
  })

  it('a stretched tile is an <article> holding one full-bleed <button> named by its label', async () => {
    const onActivate = vi.fn()
    const { container } = render(<Tile stretched={{ label: 'Open Lasagne', onActivate }}><h3>Lasagne</h3></Tile>)
    expect(screen.getByRole('article').tagName).toBe('ARTICLE')
    const target = screen.getByRole('button', { name: 'Open Lasagne' })
    expect(target.parentElement).toBe(screen.getByRole('article'))
    expect(target).toHaveClass('tile__stretch')
    expect(container.querySelectorAll('button')).toHaveLength(1)
    await userEvent.click(target)
    expect(onActivate).toHaveBeenCalledOnce()
  })

  it('a stretched tile with href renders a link instead, and no button', () => {
    const { container } = render(<Tile stretched={{ label: 'Open Lasagne', href: '/recipes/7' }}>x</Tile>)
    expect(screen.getByRole('link', { name: 'Open Lasagne' })).toHaveAttribute('href', '/recipes/7')
    expect(container.querySelector('button')).toBeNull()
  })

  it('inner buttons still work and do not trigger the stretched target', async () => {
    const onActivate = vi.fn()
    const onSwap = vi.fn()
    render(
      <Tile stretched={{ label: 'Open Lasagne', onActivate }}>
        <button type="button" onClick={onSwap}>Swap</button>
      </Tile>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Swap' }))
    expect(onSwap).toHaveBeenCalledOnce()
    expect(onActivate).not.toHaveBeenCalled()
  })

  it('the stretched target is reachable and operable by keyboard', async () => {
    const onActivate = vi.fn()
    render(<Tile stretched={{ label: 'Open', onActivate }}>x</Tile>)
    await userEvent.tab()
    expect(screen.getByRole('button', { name: 'Open' })).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    expect(onActivate).toHaveBeenCalledOnce()
  })

  it('stretched needs a label at the type level', () => {
    // @ts-expect-error label is required
    const bad = () => <Tile stretched={{ onActivate: () => {} }}>x</Tile>
    expect(bad).toBeTypeOf('function')
  })
})

describe('Tile compatibility path for the deprecated props', () => {
  it('onClick makes the tile role=button, operable by mouse, Enter and Space, but never a <button>', async () => {
    const onClick = vi.fn()
    const { container } = render(<Tile onClick={onClick}>Open</Tile>)
    expect(container.querySelector('button')).toBeNull()
    const el = screen.getByRole('button', { name: 'Open' })
    expect(el).not.toBeInstanceOf(HTMLButtonElement)
    await userEvent.click(el)
    el.focus()
    await userEvent.keyboard('{Enter}')
    await userEvent.keyboard(' ')
    expect(onClick).toHaveBeenCalledTimes(3)
  })

  it('tone maps onto variant and status', () => {
    render(<><Tile tone="accent">a</Tile><Tile tone="spoil">b</Tile></>)
    expect(screen.getByText('a')).toHaveAttribute('data-variant', 'soft')
    expect(screen.getByText('b')).toHaveAttribute('data-variant', 'status')
    expect(screen.getByText('b')).toHaveAttribute('data-status', 'spoil')
  })

  it.each([['sm', '1'], ['md', '1'], ['lg', '1'], ['wide', 'full'], ['full', 'full']] as const)('size %s maps to span %s', (size, span) => {
    render(<Tile size={size}>x</Tile>)
    expect(screen.getByText('x')).toHaveAttribute('data-span', span)
  })

  it('keeps the as= element choice', () => {
    render(<Tile as="section" aria-label="s">x</Tile>)
    expect(screen.getByRole('region', { name: 's' }).tagName).toBe('SECTION')
  })
})

describe('TileMetric', () => {
  it('shows the number and what it counts', () => {
    render(<Tile><TileMetric value="14" label="left to get" /></Tile>)
    expect(screen.getByText('14')).toBeInTheDocument()
    expect(screen.getByText('left to get')).toBeInTheDocument()
  })
})

describe('Tile styling (plan 4.4)', () => {
  const css = readUiCss('Tile.css')
  it('has no min-height or fixed height anywhere: height follows content', () => {
    expect(css).not.toMatch(/min-height|min-block-size|(^|[^-])height\s*:/)
  })
  it('hero is accent / on-accent, soft is soft / text, surface has the card elevation', () => {
    expect(declarations(css, ".tile[data-variant='hero']")).toMatchObject({ background: 'var(--color-accent)', color: 'var(--color-on-accent)' })
    expect(declarations(css, ".tile[data-variant='soft']")).toMatchObject({ background: 'var(--color-soft)', color: 'var(--color-text)' })
    expect(declarations(css, '.tile')['box-shadow']).toBe('var(--elev-1)')
  })
  it.each(['leftover', 'spoil', 'danger', 'success', 'pinned'] as const)('status %s uses the status container', (s) => {
    expect(declarations(css, `.tile[data-variant='status'][data-status='${s}']`)).toMatchObject({
      background: `var(--status-${s}-bg)`,
      color: `var(--status-${s}-fg)`,
    })
  })
  it('the stretched target covers the tile; inner controls sit above it', () => {
    expect(declarations(css, '.tile__stretch')).toMatchObject({ position: 'absolute', inset: '0' })
    expect(declarations(css, '.tile__stretch')['z-index']).toBe('0')
  })
  it('the interactive-content lift does not apply to a ListRow target inside a tile', () => {
    const lifts = ruleBlocks(css).filter((b) => /position\s*:\s*relative/.test(b.body) && b.selectors.some((s) => /button/.test(s) && /\ba\b/.test(s)))
    expect(lifts.length).toBeGreaterThan(0)
    for (const b of lifts) for (const s of b.selectors) expect(s).toContain(':not(.list-row__target)')
  })
  it('the overline gap is a token', () => {
    expect(declarations(css, '.tile__overline').gap).toMatch(/^var\(--/)
  })
  it('a legacy clickable tile (role=button) shows a pointer', () => {
    expect(declarations(css, ".tile[role='button']").cursor).toBe('pointer')
  })
  it('spans full row with data-span=full', () => {
    expect(declarations(css, ".tile[data-span='full']")['grid-column']).toBe('1 / -1')
  })
})

describe('BentoGrid', () => {
  it('lays out children and defaults to 2 columns', () => {
    render(<BentoGrid label="Today"><Tile>a</Tile><Tile>b</Tile></BentoGrid>)
    const grid = screen.getByRole('group', { name: 'Today' })
    expect(grid).toHaveAttribute('data-columns', '2')
    expect(grid).toContainElement(screen.getByText('a'))
    expect(grid).toContainElement(screen.getByText('b'))
  })

  it.each([3, 4] as const)('supports %i columns', (columns) => {
    render(<BentoGrid columns={columns} label="g">x</BentoGrid>)
    expect(screen.getByRole('group', { name: 'g' })).toHaveAttribute('data-columns', String(columns))
  })
})

describe('BentoGrid styling (plan 4.4)', () => {
  const css = readUiCss('BentoGrid.css')
  it('uses the Bento gap and lets tiles of a row stretch to the tallest', () => {
    const d = declarations(css, '.bento-grid')
    expect(d.gap).toBe('var(--bento-gap)')
    expect(d['align-items']).toBe('stretch')
    expect(d['grid-auto-rows']).toBe('auto')
  })
  it.each([2, 3, 4])('lays out %i columns', (n) => {
    expect(declarations(css, `.bento-grid[data-columns='${n}']`)['grid-template-columns']).toBe(`repeat(${n}, minmax(0, 1fr))`)
  })
})

describe('ProgressTile', () => {
  it('exposes progress semantics and a default "value / max" label', () => {
    render(<ProgressTile label="Shopping List" value={3} max={8} />)
    const bar = screen.getByRole('progressbar', { name: 'Shopping List' })
    expect(bar).toHaveAttribute('aria-valuenow', '3')
    expect(bar).toHaveAttribute('aria-valuemin', '0')
    expect(bar).toHaveAttribute('aria-valuemax', '8')
    expect(screen.getByText('3 / 8')).toBeInTheDocument()
  })

  it('shows a custom value label', () => {
    render(<ProgressTile label="Shopping List" value={3} max={8} valueLabel="3 of 8 ticked" />)
    expect(screen.getByText('3 of 8 ticked')).toBeInTheDocument()
  })

  it('clamps the value into 0..max', () => {
    const { rerender } = render(<ProgressTile label="p" value={12} max={8} />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '8')
    rerender(<ProgressTile label="p" value={-2} max={8} />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0')
  })

  it('handles max = 0 without NaN', () => {
    render(<ProgressTile label="p" value={0} max={0} />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0')
  })
})

describe('TimerTile (plan 4.12)', () => {
  // Decision: a timer with the deprecated onClick is a button (the focusable element must be operable);
  // role=timer is not kept on it. data-state and the time text stay.
  it('with onClick the focusable element is a button, not a timer', async () => {
    const onClick = vi.fn()
    render(<TimerTile label="Rice" seconds={30} running onClick={onClick} />)
    expect(screen.queryByRole('timer')).toBeNull()
    const el = screen.getByRole('button', { name: 'Rice' })
    expect(el).toHaveAttribute('data-state', 'running')
    expect(el).toHaveTextContent('0:30')
    await userEvent.click(el)
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('shows the formatted time in a labelled timer', () => {
    render(<TimerTile label="Simmer sauce" seconds={605} running />)
    const t = screen.getByRole('timer', { name: 'Simmer sauce' })
    expect(t).toHaveTextContent('10:05')
    expect(t).toHaveAttribute('data-state', 'running')
  })

  it('reports paused, finished (exactly 0) and overdue (below 0, counting up as +m:ss)', () => {
    const { rerender } = render(<TimerTile label="t" seconds={30} />)
    expect(screen.getByRole('timer')).toHaveAttribute('data-state', 'paused')
    rerender(<TimerTile label="t" seconds={0} running />)
    expect(screen.getByRole('timer')).toHaveAttribute('data-state', 'finished')
    rerender(<TimerTile label="t" seconds={-5} running />)
    expect(screen.getByRole('timer')).toHaveTextContent('+0:05')
    expect(screen.getByRole('timer')).toHaveAttribute('data-state', 'overdue')
  })

  it('is a soft tile when running, a success status tile when finished, a spoil status tile when overdue', () => {
    const { rerender } = render(<TimerTile label="t" seconds={30} running />)
    const tile = () => screen.getByRole('timer')
    expect(tile()).toHaveAttribute('data-variant', 'soft')
    rerender(<TimerTile label="t" seconds={0} running />)
    expect(tile()).toHaveAttribute('data-variant', 'status')
    expect(tile()).toHaveAttribute('data-status', 'success')
    rerender(<TimerTile label="t" seconds={-1} running />)
    expect(tile()).toHaveAttribute('data-status', 'spoil')
  })

  it('shows hours past an hour', () => {
    render(<TimerTile label="Roast" seconds={3725} running />)
    expect(screen.getByRole('timer')).toHaveTextContent('1:02:05')
  })

  it('has no controls unless handlers are given', () => {
    render(<TimerTile label="t" seconds={30} running />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('renders labelled icon buttons for the handlers given, each calling its own handler', async () => {
    const onToggle = vi.fn()
    const onAddMinute = vi.fn()
    const onDismiss = vi.fn()
    const { rerender } = render(
      <TimerTile label="Rice" seconds={30} running onToggle={onToggle} onAddMinute={onAddMinute} onDismiss={onDismiss} />,
    )
    await userEvent.click(screen.getByRole('button', { name: /pause/i }))
    await userEvent.click(screen.getByRole('button', { name: /add a minute|\+1/i }))
    await userEvent.click(screen.getByRole('button', { name: /dismiss|close/i }))
    expect([onToggle, onAddMinute, onDismiss].map((f) => f.mock.calls.length)).toEqual([1, 1, 1])
    rerender(<TimerTile label="Rice" seconds={30} onToggle={onToggle} />)
    expect(screen.getByRole('button', { name: /resume|start|play/i })).toBeInTheDocument()
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })

  it('the optional progress bar is decorative', () => {
    const { container } = render(<TimerTile label="t" seconds={30} totalSeconds={60} running />)
    expect(container.querySelector('.timer-tile__bar')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.queryByRole('progressbar')).toBeNull()
  })
})
