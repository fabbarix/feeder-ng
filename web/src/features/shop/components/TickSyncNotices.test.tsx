// B9-54 (RES-03): the notices of a sync, on the Shop above the metrics: ui/SyncNoticeStack with the notices of lib/tickNotices. Newest first, at most
// three, then "and N more". A ticked-twice notice is a polite status with R-E rows; a refused one is an alert. Queries are scoped to the stack.
import { render, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { TickNotice } from '../lib/tickNotices'
import { TickSyncNotices } from './TickSyncNotices'

const base = { scannedAt: '2026-11-14T10:20:00Z', kind: 'shop_tick' as const }
const twice = (id: string): TickNotice => ({
  id,
  kind: 'twice',
  tone: 'info',
  title: 'Carrot was ticked twice',
  subtitle: 'Both Stock Lots were added · 100 g in all',
  rows: [
    { key: 'Sam', amount: '50 g', time: 'Ticked at 10:12' },
    { key: 'You', amount: '50 g', time: 'Ticked offline at 10:20 · synced 10:31' },
  ],
  actions: [
    { id: 'takeMineBack', label: 'Take mine back' },
    { id: 'dismiss', label: 'Dismiss' },
  ],
  op: { clientUuid: id, ...base, quantity: 50 },
})
const refused = (id: string): TickNotice => ({
  id,
  kind: 'refused',
  tone: 'danger',
  title: 'Couldn’t sync the Tick of Carrot.',
  subtitle: 'It is no longer on the Shopping List for this range. Its Stock Lot was not added.',
  actions: [
    { id: 'addToStock', label: 'Add to Stock' },
    { id: 'dismiss', label: 'Dismiss' },
  ],
  op: { clientUuid: id, ...base, quantity: 50 },
})
const stack = (c: HTMLElement) => c.querySelector('.sync-notice-stack') as HTMLElement

describe('TickSyncNotices', () => {
  it('a ticked-twice notice: a status with its rows as a list and the two buttons', () => {
    const { container } = render(<TickSyncNotices notices={[twice('c-1')]} onAction={() => {}} />)
    const notice = stack(container).querySelector('[role="status"]') as HTMLElement
    expect(notice).toHaveTextContent('Carrot was ticked twice')
    expect(notice.querySelectorAll('ul li, [role="list"] [role="listitem"]').length).toBe(2)
    expect(within(notice).getByText('Ticked offline at 10:20 · synced 10:31')).toBeInTheDocument()
    expect(within(notice).getAllByRole('button').map((b) => b.textContent)).toEqual(['Take mine back', 'Dismiss'])
  })

  it('a refused notice is an alert with Add to Stock and Dismiss', () => {
    const { container } = render(<TickSyncNotices notices={[refused('c-2')]} onAction={() => {}} />)
    const notice = stack(container).querySelector('[role="alert"]') as HTMLElement
    expect(notice).toHaveTextContent('Couldn’t sync the Tick of Carrot.')
    expect(within(notice).getAllByRole('button').map((b) => b.textContent)).toEqual(['Add to Stock', 'Dismiss'])
  })

  it('a button reports its action with its notice', async () => {
    const onAction = vi.fn()
    const n = twice('c-1')
    const { container } = render(<TickSyncNotices notices={[n]} onAction={onAction} />)
    await userEvent.click(within(stack(container)).getByRole('button', { name: 'Take mine back' }))
    expect(onAction).toHaveBeenCalledWith(n, 'takeMineBack')
    await userEvent.click(within(stack(container)).getByRole('button', { name: 'Dismiss' }))
    expect(onAction).toHaveBeenLastCalledWith(n, 'dismiss')
  })

  it('newest first, three at most, then "and 2 more"', () => {
    const { container } = render(<TickSyncNotices notices={['a', 'b', 'c', 'd', 'e'].map(refused)} onAction={() => {}} />)
    const titles = [...stack(container).querySelectorAll('.sync-notice')].map((n) => n.getAttribute('data-tone'))
    expect(titles).toHaveLength(3)
    expect(stack(container)).toHaveTextContent('and 2 more')
  })

  it('renders nothing for no notices', () => {
    const { container } = render(<TickSyncNotices notices={[]} onAction={() => {}} />)
    expect(container.querySelector('.sync-notice-stack')).toBeNull()
  })
})
