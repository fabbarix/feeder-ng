// B9-46 (SET-16): a Member with a current or coming Away gets a meta line in the info tone: "Away 20–27 Nov". The row is named
// "<Member>, Away 20–27 Nov"; the trailing value stays "×1". Today is Sun 15 Nov 2026.
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Away } from '../../plan/types'
import { anna, marco, sam } from './fixtures'
import { MemberList } from './MemberList'

const TODAY = '2026-11-15'
const away = (over: Partial<Away> = {}): Away => ({ id: 1, memberId: 2, memberName: 'Marco', from: '2026-11-20', fromMealSlotId: null, through: '2026-11-27', throughMealSlotId: null, started: false, ...over })
const list = (aways: Record<number, Away[]>, canEdit = true) =>
  render(<MemberList members={[anna, marco, sam]} canEdit={canEdit} aways={aways} today={TODAY} onAdd={() => {}} onEdit={() => {}} />)
const row = (name: string | RegExp) => screen.getByRole(screen.queryAllByRole('button').length ? 'button' : 'listitem', { name }).closest('li') as HTMLElement

describe('MemberList: Away', () => {
  it('shows the next Away as an info-tone meta line, and the row is named with it', () => {
    list({ 2: [away()] })
    const li = row('Marco, Away 20–27 Nov')
    const meta = li.querySelector('.list-row__meta')!
    expect(meta).toHaveTextContent('Away 20–27 Nov')
    expect(meta).toHaveAttribute('data-status', 'info')
    expect(li).toHaveTextContent('×1') // the value column stays
  })

  it('a running Away says until when; one with no last day says from when', () => {
    list({ 1: [away({ memberId: 1, from: '2026-11-13', through: '2026-11-16', started: true })], 3: [away({ memberId: 3, from: '2026-12-01', through: null })] })
    expect(row('Anna, Away until Mon 16 Nov').querySelector('.list-row__meta')).toHaveTextContent('Away until Mon 16 Nov')
    expect(row('Sam, Away from Tue 1 Dec').querySelector('.list-row__meta')).toHaveTextContent('Away from Tue 1 Dec')
  })

  it('names only the next Away, with "+1 more"', () => {
    list({ 2: [away(), away({ id: 2, from: '2026-12-01', through: null })] })
    expect(row('Marco, Away 20–27 Nov · +1 more').querySelector('.list-row__meta')).toHaveTextContent('Away 20–27 Nov · +1 more')
  })

  it('a Member without an Away, and one whose Away is over, show no Away line', () => {
    list({ 2: [away({ from: '2026-11-01', through: '2026-11-12', started: true })] })
    for (const name of ['Anna', 'Marco', 'Sam']) expect(screen.getByRole('button', { name })).toBeInTheDocument()
    expect(screen.queryByText(/Away/)).toBeNull()
  })

  it('a plain User sees the line too, on a static row', () => {
    list({ 2: [away()] }, false)
    expect(screen.getByText('Away 20–27 Nov')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Marco/ })).toBeNull()
  })

  it('without the aways prop the list is as it was', () => {
    render(<MemberList members={[anna, marco, sam]} canEdit onAdd={() => {}} onEdit={() => {}} />)
    expect(screen.queryByText(/Away/)).toBeNull()
    expect(within(row('Marco')).getByText('×1')).toBeInTheDocument()
  })
})
