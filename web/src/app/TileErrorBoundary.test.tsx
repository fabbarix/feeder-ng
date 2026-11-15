import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TileErrorBoundary } from './TileErrorBoundary'

// B9-20 (RES-09): a tile that throws keeps its slot; the others render; Try again resets the tile's queries so bad cached data cannot crash it again.
beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}))
afterEach(() => vi.restoreAllMocks())

function Boom(): never {
  throw new Error('kaboom')
}

const mount = (ui: React.ReactNode, client = new QueryClient()) => ({ client, ...render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>) })

describe('TileErrorBoundary', () => {
  it('renders its children when nothing throws', () => {
    mount(
      <TileErrorBoundary title="To confirm">
        <p>fine</p>
      </TileErrorBoundary>,
    )
    expect(screen.getByText('fine')).toBeInTheDocument()
  })

  it('a throwing tile shows the notice "{Tile title} couldn’t be shown. The rest of Today is fine." and a Try again button', () => {
    mount(
      <TileErrorBoundary title="To confirm">
        <Boom />
      </TileErrorBoundary>,
    )
    const alert = screen.getByRole('alert', { name: 'To confirm' })
    expect(within(alert).getByText('To confirm couldn’t be shown.')).toBeInTheDocument()
    expect(within(alert).getByText(/The rest of Today is fine\./)).toBeInTheDocument()
    expect(within(alert).getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })

  it('the notice keeps the tile\'s slot: a .tile-error with a WarningCircle icon, hidden from assistive tech', () => {
    const { container } = mount(
      <TileErrorBoundary title="To confirm">
        <Boom />
      </TileErrorBoundary>,
    )
    const notice = container.querySelector('.tile-error')!
    expect(notice).not.toBeNull()
    expect(notice.querySelector('.tile-error__icon svg')).not.toBeNull()
    expect(notice.querySelector('.tile-error__icon')).toHaveAttribute('aria-hidden', 'true')
  })

  it('the scope names the page: "The rest of the Kitchen board is fine."', () => {
    mount(
      <TileErrorBoundary title="Timers" scope="the Kitchen board">
        <Boom />
      </TileErrorBoundary>,
    )
    expect(screen.getByText(/The rest of the Kitchen board is fine\./)).toBeInTheDocument()
  })

  it('never shows the error message or a stack', () => {
    mount(
      <TileErrorBoundary title="To confirm">
        <Boom />
      </TileErrorBoundary>,
    )
    expect(screen.queryByText(/kaboom/)).toBeNull()
  })

  it('the other tiles render normally beside a crashed one', () => {
    mount(
      <>
        <TileErrorBoundary title="To confirm">
          <Boom />
        </TileErrorBoundary>
        <TileErrorBoundary title="Use soon">
          <p>Use soon tile</p>
        </TileErrorBoundary>
      </>,
    )
    expect(screen.getByText('Use soon tile')).toBeInTheDocument()
    expect(screen.getAllByRole('alert')).toHaveLength(1)
  })

  it('Try again resets the tile\'s query keys (the cached bad data is cleared and refetched) and renders the tile once the data is good', async () => {
    const fetchGood = vi.fn().mockResolvedValue({ slots: [] })
    function Tile() {
      const q = useQuery({ queryKey: ['plan', 'to-confirm'], queryFn: fetchGood })
      if (!q.data) return <p>loading tile</p>
      if ((q.data as { bad?: boolean }).bad) throw new Error('malformed')
      return <p>To confirm tile ok</p>
    }
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
    client.setQueryData(['plan', 'to-confirm'], { bad: true })
    mount(
      <TileErrorBoundary title="To confirm" queryKeys={[['plan', 'to-confirm']]}>
        <Tile />
      </TileErrorBoundary>,
      client,
    )
    expect(screen.getByRole('alert', { name: 'To confirm' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('To confirm tile ok')).toBeInTheDocument()
    expect(fetchGood).toHaveBeenCalled()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('Try again with data that is still bad shows the notice again, without a loop', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    mount(
      <TileErrorBoundary title="To confirm">
        <Boom />
      </TileErrorBoundary>,
      client,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(screen.getByRole('alert', { name: 'To confirm' })).toBeInTheDocument())
  })

  it('after Try again succeeds, focus goes to the tile\'s heading (tabindex -1) so a screen-reader User learns it is back', async () => {
    let broken = true
    function Tile() {
      if (broken) throw new Error('x')
      return <h2 tabIndex={-1} data-tile-heading>To confirm</h2>
    }
    mount(
      <TileErrorBoundary title="To confirm">
        <Tile />
      </TileErrorBoundary>,
    )
    broken = false
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    const heading = await screen.findByRole('heading', { name: 'To confirm' })
    await waitFor(() => expect(heading).toHaveFocus())
  })

  it('resets when a resetKey changes', () => {
    let broken = true
    function Tile() {
      if (broken) throw new Error('x')
      return <p>back</p>
    }
    const client = new QueryClient()
    const { rerender } = mount(
      <TileErrorBoundary title="To confirm" resetKeys={[1]}>
        <Tile />
      </TileErrorBoundary>,
      client,
    )
    expect(screen.getByRole('alert')).toBeInTheDocument()
    broken = false
    rerender(
      <QueryClientProvider client={client}>
        <TileErrorBoundary title="To confirm" resetKeys={[2]}>
          <Tile />
        </TileErrorBoundary>
      </QueryClientProvider>,
    )
    expect(screen.getByText('back')).toBeInTheDocument()
  })
})
