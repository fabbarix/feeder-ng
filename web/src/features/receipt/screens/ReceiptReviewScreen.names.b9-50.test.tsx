// B9-50 (ruling 2, guard rule P38): every button on the review has its own accessible name. A row's button is named after its printed line
// ("Add KITCHEN ROLL 4 PACK"); two identical printed lines are told apart by their position on the receipt ("…, line 7"), and so are their
// checkboxes once they are set up.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfirmProvider, ToastProvider } from '../../../ui'
import { takePendingReceiptApplied } from '../lib/appliedEvents'
import { forgetRead, rememberRead } from '../lib/readStore'
import { publishReceiptSession } from '../lib/receiptSession'
import { reviewRowViews } from '../lib/reviewRows'
import { initialReview, setAdd } from '../lib/reviewState'
import { completeDraft, missing5, price0, proposal, READ_ID, readDone, SHOP_ID, UUIDS } from '../fixtures.test-helper'

const api = vi.hoisted(() => ({ startRead: vi.fn(), getRead: vi.fn(), cancelRead: vi.fn(), apply: vi.fn() }))
vi.mock('../api', () => ({ receiptApi: api }))
vi.mock('../../../app/useMe', () => ({ useMe: () => ({ data: { id: 1, email: 'a@b.c', displayName: 'A', isAdmin: false } }) }))
vi.mock('../../products/hooks/useCurrency', () => ({ useCurrency: () => 'EUR' }))

import { ReceiptReviewScreen, type AddSheetRenderProps } from './ReceiptReviewScreen'

const roll = (id: string, line: number) =>
  proposal({ id, kind: 'add', line, text: 'KITCHEN ROLL 4 PACK', needsInput: true, after: { name: 'Kitchen roll', count: 1, priceCents: 349 } })
const rollA = roll('add:3', 3)
const rollB = roll('add:6', 6)
const proposals = [price0, rollA, rollB, missing5]
const money = (c: number) => `€${(c / 100).toFixed(2)}`

function show(renderAdd?: (p: AddSheetRenderProps) => ReactNode) {
  return render(
    <MemoryRouter initialEntries={['/scan/receipt/review']}>
      <ToastProvider>
        <ConfirmProvider>
          <Routes>
            <Route path="/scan/receipt/review" element={<ReceiptReviewScreen renderAdd={renderAdd} />} />
            <Route path="*" element={<p>elsewhere</p>} />
          </Routes>
        </ConfirmProvider>
      </ToastProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  forgetRead()
  takePendingReceiptApplied()
  publishReceiptSession({ shopId: SHOP_ID, clientUuids: UUIDS })
  rememberRead({ readId: READ_ID, shopId: SHOP_ID, clientUuids: UUIDS, read: readDone({ proposals }) })
})
afterEach(() => {
  forgetRead()
  publishReceiptSession(undefined)
  takePendingReceiptApplied()
})

describe('two identical printed lines', () => {
  it('the row views name each button and checkbox with the line\'s position', () => {
    const state = setAdd(initialReview(proposals), 'add:6', completeDraft)
    const views = reviewRowViews([rollA, rollB], { rows: [], state, money, today: '2026-11-15' })
    expect(views.map((v) => v.buttonName)).toEqual(['Add KITCHEN ROLL 4 PACK, line 4', 'Edit KITCHEN ROLL 4 PACK, line 7'])
    expect(views[1]!.checkName).toBe('Kitchen roll, ×1 · €3.49, line 7')
  })
  it('a printed line said once keeps its plain name', () => {
    const views = reviewRowViews([rollA], { rows: [], state: initialReview(proposals), money, today: '2026-11-15' })
    expect(views[0]!.buttonName).toBe('Add KITCHEN ROLL 4 PACK')
  })
  it('on the screen no two buttons share a name, before and after a line is set up', async () => {
    const unique = () => {
      const names = screen.getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent)
      expect(new Set(names).size).toBe(names.length)
    }
    show(({ onSave }) => <button type="button" onClick={() => onSave(completeDraft)}>Save add</button>)
    expect(screen.getByRole('button', { name: 'Add KITCHEN ROLL 4 PACK, line 4' })).toHaveTextContent('Add…')
    expect(screen.getByRole('button', { name: 'Add KITCHEN ROLL 4 PACK, line 7' })).toHaveTextContent('Add…')
    unique()
    await userEvent.click(screen.getByRole('button', { name: 'Add KITCHEN ROLL 4 PACK, line 7' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save add' }))
    expect(screen.getByRole('button', { name: 'Edit KITCHEN ROLL 4 PACK, line 7' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /, line 7$/ })).toBeChecked()
    unique()
  })
})
