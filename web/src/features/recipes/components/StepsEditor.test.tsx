import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { flour, garlic } from '../fixtures.test-helper'

// Each Step owns its photo upload (usePhotoUpload inside the Step's picker); the editor takes no `imageUpload` prop.
const api = vi.hoisted(() => ({ uploadImage: vi.fn() }))
vi.mock('../api', () => ({ recipesApi: api }))

import type { StepDraft } from '../lib/draft'
import { StepsEditor, type StepsEditorProps } from './StepsEditor'

const step = (over: Partial<StepDraft> = {}): StepDraft => ({
  key: 'k', text: 'Chop', kind: 'active', durationMinutes: '5', leadTimeMinutes: '', after: [], uses: [], image: '', ...over,
})
const props = (steps: StepDraft[], over: Partial<StepsEditorProps> = {}): StepsEditorProps => ({
  steps, errors: {}, onChange: vi.fn(), ingredients: [garlic, flour], ...over,
})
const rows = () => screen.getAllByRole('listitem').filter((li) => li.matches('ol > li'))

describe('StepsEditor', () => {
  it('adds an Active Step at the end', async () => {
    const p = props([step()])
    render(<StepsEditor {...p} />)
    await userEvent.click(screen.getByRole('button', { name: 'Add Step' }))
    const next = vi.mocked(p.onChange).mock.calls[0]![0]
    expect(next).toHaveLength(2)
    expect(next[1]).toMatchObject({ kind: 'active', text: '', after: [] })
  })

  it('uses no native controls: kind is a Segmented, "After" are filter Chips', () => {
    const steps = [step({ key: 'a', text: 'oven' }), step({ key: 'b', text: 'veg' })]
    const { container } = render(<StepsEditor {...props(steps)} />)
    expect(container.querySelector('select')).toBeNull()
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
    const second = within(rows()[1]!)
    expect(second.getByRole('radiogroup', { name: 'Kind' })).toBeInTheDocument()
    expect(second.getByRole('radio', { name: 'Active' })).toHaveAttribute('aria-checked', 'true')
    expect(second.getByRole('button', { name: 'After step 1' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('changing the kind goes through lib/steps (an Advance Step loses its "after")', async () => {
    const p = props([step({ key: 'a' }), step({ key: 'b', after: [0] })])
    render(<StepsEditor {...p} />)
    await userEvent.click(within(rows()[1]!).getByRole('radio', { name: 'Advance Step' }))
    const next = vi.mocked(p.onChange).mock.calls[0]![0]
    expect(next[1]).toMatchObject({ kind: 'advance', after: [] })
  })

  it('shows Duration for timeline Steps and Lead time for an Advance Step, as number fields', () => {
    render(<StepsEditor {...props([step({ kind: 'advance', leadTimeMinutes: '240', durationMinutes: '' }), step({ key: 'j' })])} />)
    expect(within(rows()[0]!).getByRole('spinbutton', { name: 'Lead time (min)' })).toHaveDisplayValue('240')
    expect(within(rows()[0]!).queryByRole('spinbutton', { name: 'Duration (min)' })).toBeNull()
    expect(within(rows()[1]!).getByRole('spinbutton', { name: 'Duration (min)' })).toHaveDisplayValue('5')
  })

  it('commits a typed duration as text', async () => {
    const p = props([step()])
    render(<StepsEditor {...p} />)
    const field = screen.getByRole('spinbutton', { name: 'Duration (min)' })
    await userEvent.clear(field)
    await userEvent.type(field, '12')
    await userEvent.tab()
    expect(vi.mocked(p.onChange).mock.calls.at(-1)![0][0]).toMatchObject({ durationMinutes: '12' })
  })

  it('toggles "After" and offers only earlier non-advance Steps', async () => {
    const steps = [step({ key: 'a', kind: 'advance', leadTimeMinutes: '60' }), step({ key: 'b', text: 'veg' }), step({ key: 'c', text: 'roast' })]
    const p = props(steps)
    render(<StepsEditor {...p} />)
    expect(within(rows()[0]!).queryByRole('button', { name: /^After step/ })).toBeNull()
    expect(within(rows()[1]!).queryByRole('button', { name: /^After step/ })).toBeNull()
    const chips = within(rows()[2]!).getAllByRole('button', { name: /^After step/ })
    expect(chips).toHaveLength(1)
    await userEvent.click(chips[0]!)
    expect(vi.mocked(p.onChange).mock.calls[0]![0][2]!.after).toEqual([1])
  })

  it('removing a Step remaps the dependencies of the others', async () => {
    const steps = [step({ key: 'a', text: 'oven' }), step({ key: 'b', text: 'veg' }), step({ key: 'c', text: 'roast', after: [0, 1] })]
    const p = props(steps)
    render(<StepsEditor {...p} />)
    await userEvent.click(within(rows()[0]!).getByRole('button', { name: 'Remove Step' }))
    const next = vi.mocked(p.onChange).mock.calls[0]![0]
    expect(next.map((s) => s.text)).toEqual(['veg', 'roast'])
    expect(next[1]!.after).toEqual([0])
  })

  it('moves Steps with IconButtons (first cannot go up, last cannot go down)', async () => {
    const p = props([step({ key: 'a', text: 'one' }), step({ key: 'b', text: 'two' })])
    render(<StepsEditor {...p} />)
    expect(within(rows()[0]!).getByRole('button', { name: 'Move Step up' })).toBeDisabled()
    expect(within(rows()[1]!).getByRole('button', { name: 'Move Step down' })).toBeDisabled()
    await userEvent.click(within(rows()[0]!).getByRole('button', { name: 'Move Step down' }))
    expect(vi.mocked(p.onChange).mock.calls[0]![0].map((s) => s.text)).toEqual(['two', 'one'])
  })

  it('shows the message for a Step error', () => {
    render(<StepsEditor {...props([step({ kind: 'passive', durationMinutes: '' })], { errors: { 'steps.0.durationMinutes': 'passive_needs_duration' } })} />)
    expect(screen.getByRole('alert')).toHaveTextContent(/duration/i)
  })
})

describe('StepsEditor: Step uses (G2)', () => {
  it('adds a blank use', async () => {
    const p = props([step()])
    render(<StepsEditor {...p} />)
    await userEvent.click(screen.getByRole('button', { name: 'Add ingredient use' }))
    expect(vi.mocked(p.onChange).mock.calls[0]![0][0]!.uses).toEqual([{ key: expect.any(String), ingredientId: null, ingredientName: '', quantity: '', unit: '' }])
  })

  it('edits a use with the Ingredient, quantity and unit fields', async () => {
    const uses = [{ key: 'u1', ingredientId: 7, ingredientName: 'garlic', quantity: '2', unit: 'clove' }]
    const p = props([step({ uses })])
    render(<StepsEditor {...p} />)
    expect(screen.getByRole('combobox', { name: 'Ingredient used' })).toHaveTextContent('garlic')
    expect(screen.getByRole('textbox', { name: 'Quantity used' })).toHaveValue('2')
    expect(screen.getByRole('combobox', { name: 'Unit used' })).toHaveTextContent('clove')
    await userEvent.type(screen.getByRole('textbox', { name: 'Quantity used' }), '5')
    expect(vi.mocked(p.onChange).mock.calls.at(-1)![0][0]!.uses[0]).toMatchObject({ quantity: '25' })
  })

  it('picking an Ingredient for a use sets its Base Unit', async () => {
    const p = props([step({ uses: [{ key: 'u1', ingredientId: null, ingredientName: '', quantity: '1', unit: '' }] })])
    render(<StepsEditor {...p} />)
    await userEvent.click(screen.getByRole('combobox', { name: 'Ingredient used' }))
    await userEvent.click(screen.getByRole('option', { name: /flour/ }))
    expect(vi.mocked(p.onChange).mock.calls[0]![0][0]!.uses[0]).toMatchObject({ ingredientId: 8, ingredientName: 'flour', unit: 'g' })
  })

  it('removes a use', async () => {
    const uses = [{ key: 'u1', ingredientId: 7, ingredientName: 'garlic', quantity: '2', unit: 'clove' }]
    const p = props([step({ uses })])
    render(<StepsEditor {...p} />)
    await userEvent.click(screen.getByRole('button', { name: 'Remove ingredient use' }))
    expect(vi.mocked(p.onChange).mock.calls[0]![0][0]!.uses).toEqual([])
  })

  it('says a custom unit will need a Unit Conversion', () => {
    const uses = [{ key: 'u1', ingredientId: 7, ingredientName: 'garlic', quantity: '1', unit: 'head' }]
    render(<StepsEditor {...props([step({ uses })])} />)
    expect(screen.getByText('Feeder will ask how much 1 head is when you save.')).toBeInTheDocument()
  })
})

const png = () => new File(['x'], 'step.png', { type: 'image/png' })
const fileInputs = (c: HTMLElement) => [...c.querySelectorAll<HTMLInputElement>('input[type=file]')]

describe('StepsEditor: Step photo (G2)', () => {
  it('uploads a photo through FileDrop and stores its id on the Step', async () => {
    api.uploadImage.mockResolvedValue({ id: 'img9' })
    const p = props([step()])
    const { container } = render(<StepsEditor {...p} />)
    expect(screen.getByTestId('file-drop-zone')).toBeInTheDocument()
    const input = fileInputs(container)[0]!
    expect(input).toHaveAttribute('accept', 'image/*')
    await userEvent.upload(input, png())
    await waitFor(() => expect(vi.mocked(p.onChange).mock.calls.at(-1)![0][0]!.image).toBe('img9'))
  })

  it('shows the current photo and removes it', async () => {
    const p = props([step({ image: 'img1' })])
    const { container } = render(<StepsEditor {...p} />)
    expect(container.querySelector('img')).toHaveAttribute('src', '/api/images/img1')
    await userEvent.click(screen.getByRole('button', { name: 'Remove Step photo' }))
    expect(vi.mocked(p.onChange).mock.calls[0]![0][0]!.image).toBe('')
  })

  it('shows an upload failure on the Step that failed, and on no other Step', async () => {
    api.uploadImage.mockRejectedValue(new Error('boom'))
    const { container } = render(<StepsEditor {...props([step({ key: 'a' }), step({ key: 'b' })])} />)
    await userEvent.upload(fileInputs(container)[0]!, png())
    expect(await within(rows()[0]!).findByText('The photo could not be added.')).toBeInTheDocument()
    expect(within(rows()[1]!).queryByText('The photo could not be added.')).toBeNull()
  })

  it('one Step uploading does not disable the photo zones of the other Steps', async () => {
    api.uploadImage.mockReturnValue(new Promise(() => {}))
    const { container } = render(<StepsEditor {...props([step({ key: 'a' }), step({ key: 'b' })])} />)
    await userEvent.upload(fileInputs(container)[0]!, png())
    await waitFor(() => expect(fileInputs(container)[0]).toBeDisabled())
    expect(fileInputs(container)[1]).toBeEnabled()
    expect(within(rows()[1]!).getByRole('button', { name: 'Choose a file or drop it here' })).toBeEnabled()
  })
})

describe('StepsEditor: stable keys for use rows', () => {
  it('removing an earlier use keeps the focused field of a later use mounted (no index keys)', async () => {
    function Harness() {
      const [steps, setSteps] = useState([
        step({ uses: [{ key: 'u1', ingredientId: 7, ingredientName: 'garlic', quantity: '1', unit: 'clove' }, { key: 'u2', ingredientId: 8, ingredientName: 'flour', quantity: '2', unit: 'g' }] }),
      ])
      return <StepsEditor {...props(steps, { onChange: setSteps })} />
    }
    render(<Harness />)
    const second = screen.getAllByRole('textbox', { name: 'Quantity used' })[1]!
    second.focus()
    await userEvent.click(screen.getAllByRole('button', { name: 'Remove ingredient use' })[0]!)
    const left = screen.getByRole('textbox', { name: 'Quantity used' })
    expect(left).toHaveValue('2')
    expect(left).toBe(second)
  })
})
