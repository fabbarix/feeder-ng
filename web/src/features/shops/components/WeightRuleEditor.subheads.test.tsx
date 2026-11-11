// R2-3 send-back: "Item code" and "Value" are visible subheads over their field rows (they were only the groups' accessible names).
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { strings } from '../strings'
import { WeightRuleEditor } from './WeightRuleEditor'

describe('WeightRuleEditor subheads', () => {
  it('prints "Item code" and "Value" as visible text, once each, and keeps the named groups', () => {
    render(<WeightRuleEditor currency="USD" onSave={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByText(strings.itemCodeGroup)).toBeVisible()
    expect(screen.getByText(strings.valueGroup)).toBeVisible()
    expect(screen.getByRole('group', { name: 'Item code' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Value' })).toBeInTheDocument()
  })
})
