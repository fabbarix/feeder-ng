// SAFE-04 (R4): a field error is NOT an alert (focus does the announcing: focusFirstInvalid moves focus to the first invalid field and the
// field reads its error through aria-describedby). A server error with no field uses FormError, the one role="alert".
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { declarations, readUiCss } from '../test-utils'
import { DateField } from './DateField'
import { FieldFrame, useFieldIds } from './FieldFrame'
import { FormError } from './FormError'
import { NumberField } from './NumberField'
import { Segmented } from './Segmented'
import { StepperField } from './StepperField'
import { TextArea } from './TextArea'
import { TextField } from './TextField'
import { TimeField } from './TimeField'
import { Select } from '../Select/Select'

const noop = () => {}

function Frame({ error }: { error?: string }) {
  const ids = useFieldIds()
  return (
    <FieldFrame ids={ids} label="Name" error={error}>
      <span />
    </FieldFrame>
  )
}

describe('FieldFrame error', () => {
  it('is a paragraph with the warning icon and the text, without role="alert"', () => {
    const { container } = render(<Frame error="Enter a name for the Member." />)
    const error = container.querySelector('.ui-field__error')!
    expect(error).toHaveTextContent('Enter a name for the Member.')
    expect(error.querySelector('svg')).not.toBeNull()
    expect(error).not.toHaveAttribute('role')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('still marks the frame invalid', () => {
    const { container } = render(<Frame error="Bad" />)
    expect(container.querySelector('.ui-field')).toHaveAttribute('data-invalid')
  })
})

describe('a form with three errors fires no alert', () => {
  it('TextField, NumberField and TextArea together', () => {
    render(
      <form>
        <TextField label="Name" value="" onChange={noop} error="Give the Recipe a name." />
        <NumberField label="Yield" value={null} onChange={noop} error="Enter a yield." />
        <TextArea label="Notes" value="" onChange={noop} error="Too long." />
      </form>,
    )
    expect(screen.queryAllByRole('alert')).toHaveLength(0)
    for (const name of ['Name', 'Yield', 'Notes']) expect(screen.getByLabelText(name)).toHaveAttribute('aria-invalid', 'true')
  })
})

describe('every field passes aria-invalid and describes itself with its error when given `error`', () => {
  const describedByText = (el: HTMLElement) =>
    (el.getAttribute('aria-describedby') ?? '')
      .split(' ')
      .map((id) => document.getElementById(id)?.textContent ?? '')
      .join(' ')

  it.each([
    ['TextField', () => <TextField label="Thing" value="" onChange={noop} error="Fix it." />, () => screen.getByLabelText('Thing')],
    ['TextArea', () => <TextArea label="Thing" value="" onChange={noop} error="Fix it." />, () => screen.getByLabelText('Thing')],
    ['NumberField', () => <NumberField label="Thing" value={null} onChange={noop} error="Fix it." />, () => screen.getByRole('spinbutton', { name: 'Thing' })],
    ['DateField', () => <DateField label="Thing" value="" onChange={noop} error="Fix it." />, () => screen.getByRole('button', { name: /Thing/ })],
    ['Select', () => <Select label="Thing" options={[{ value: 'a', label: 'A' }]} value={null} onChange={noop} error="Fix it." />, () => screen.getByRole('combobox', { name: /Thing/ })],
    ['TimeField', () => <TimeField label="Thing" value="19:30" onChange={noop} error="Fix it." />, () => screen.getByRole('group', { name: 'Thing' })],
    [
      'Segmented',
      () => <Segmented label="Thing" value="a" onChange={noop} options={[{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }]} error="Fix it." />,
      () => screen.getByRole('radiogroup', { name: 'Thing' }),
    ],
    ['StepperField', () => <StepperField label="Thing" value={2} onChange={noop} error="Fix it." />, () => screen.getByRole('spinbutton', { name: 'Thing' })],
  ] as const)('%s', (_name, make, control) => {
    render(make())
    const el = control()
    expect(el).toHaveAttribute('aria-invalid', 'true')
    expect(describedByText(el)).toContain('Fix it.')
  })

  it('and none of them has aria-invalid without an error', () => {
    const { container } = render(
      <>
        <TextField label="A" value="" onChange={noop} />
        <Segmented label="B" value="a" onChange={noop} options={[{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }]} />
        <StepperField label="C" value={2} onChange={noop} />
        <TimeField label="D" value="19:30" onChange={noop} />
      </>,
    )
    expect(container.querySelector('[aria-invalid="true"]')).toBeNull()
  })
})

describe('FormError', () => {
  it('is the one role="alert" for a server error that belongs to no field', () => {
    render(<FormError>Could not save the Member.</FormError>)
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Could not save the Member.')
    expect(alert.querySelector('svg')).not.toBeNull()
    expect(alert).toHaveClass('form-error')
  })

  it('renders nothing without a message', () => {
    const { container, rerender } = render(<FormError>{''}</FormError>)
    expect(container).toBeEmptyDOMElement()
    rerender(<FormError>{null}</FormError>)
    expect(container).toBeEmptyDOMElement()
  })

  it('takes an id, so an action bar can point at it', () => {
    render(<FormError id="form-error">Offline.</FormError>)
    expect(screen.getByRole('alert')).toHaveAttribute('id', 'form-error')
  })
})

describe('Field.css (SAFE-04)', () => {
  const css = readUiCss('fields/Field.css')
  it('an invalid control keeps clear of the app bar and sticky bar when scrolled into view', () => {
    const d = declarations(css, "[aria-invalid='true']")
    expect(d['scroll-margin-block']).toBeTruthy()
    expect(d['scroll-margin-block']).not.toBe('0')
  })
  it('a data-invalid-target section has the same scroll margin', () => {
    expect(declarations(css, '[data-invalid-target]')['scroll-margin-block']).toBeTruthy()
  })
  it('the error text uses the danger foreground (dark pairs pass in theme/contrast.test.ts)', () => {
    expect(declarations(css, '.ui-field__error')['color']).toBe('var(--status-danger-fg)')
  })
})
