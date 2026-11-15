// R2-3 send-back: the validation reason after Save was silent. It is tied to the offending field (aria-invalid + aria-describedby),
// and focus moves to that field, which reads it out; SAFE-04: a field error is never an alert of its own.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { strings } from '../strings'
import { WeightRuleEditor } from './WeightRuleEditor'

function setup() {
  const onSave = vi.fn().mockResolvedValue(undefined)
  render(<WeightRuleEditor currency="USD" onSave={onSave} onCancel={vi.fn()} />)
  return { onSave, user: userEvent.setup() }
}
const save = () => userEvent.click(screen.getByRole('button', { name: strings.saveRule }))

describe('WeightRuleEditor validation error', () => {
  it('describes the empty prefix on the field, and focuses it', async () => {
    const { onSave } = setup()
    const prefix = screen.getByLabelText(strings.prefixLabel)
    expect(prefix).not.toHaveAttribute('aria-invalid')
    await save()
    expect(prefix).toHaveAccessibleDescription(/prefix/i)
    expect(prefix).toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryByRole('alert')).toBeNull()
    expect(prefix).toHaveFocus()
    expect(onSave).not.toHaveBeenCalled()
  })
  it('points at the value start on an overlap, and clears when the rule is fixed', async () => {
    const { user } = setup()
    await user.type(screen.getByLabelText(strings.prefixLabel), '21')
    const valueStart = screen.getByLabelText(strings.valueStartLabel)
    await user.clear(valueStart)
    await user.type(valueStart, '6')
    await save()
    expect(valueStart).toHaveAccessibleDescription(/overlap/i)
    expect(valueStart).toHaveAttribute('aria-invalid', 'true')
    expect(valueStart).toHaveFocus()
    expect(screen.getByLabelText(strings.prefixLabel)).not.toHaveAttribute('aria-invalid')
    await user.clear(valueStart)
    await user.type(valueStart, '8')
    expect(screen.queryByText(/overlap/i)).toBeNull()
    expect(valueStart).not.toHaveAttribute('aria-invalid')
  })
  it('a second failed Save moves focus back to the field', async () => {
    const { user } = setup()
    await save()
    await user.click(screen.getByLabelText(strings.sampleLabel))
    await save()
    expect(screen.getByLabelText(strings.prefixLabel)).toHaveFocus()
  })
})
