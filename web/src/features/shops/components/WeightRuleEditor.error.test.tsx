// R2-3 send-back: the validation reason after Save was silent. It is an alert, tied to the offending field
// (aria-invalid + aria-describedby), and focus moves to that field.
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
  it('is announced (role=alert), names the empty prefix, and focuses it', async () => {
    const { onSave } = setup()
    expect(screen.queryByRole('alert')).toBeNull()
    await save()
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent(/prefix/i)
    const prefix = screen.getByLabelText(strings.prefixLabel)
    expect(prefix).toHaveAttribute('aria-invalid', 'true')
    expect(prefix.getAttribute('aria-describedby')?.split(' ')).toContain(alert.id)
    expect(alert.id).not.toBe('')
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
    expect(screen.getByRole('alert')).toHaveTextContent(/overlap/i)
    expect(valueStart).toHaveAttribute('aria-invalid', 'true')
    expect(valueStart).toHaveFocus()
    expect(screen.getByLabelText(strings.prefixLabel)).not.toHaveAttribute('aria-invalid')
    await user.clear(valueStart)
    await user.type(valueStart, '8')
    expect(screen.queryByRole('alert')).toBeNull()
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
