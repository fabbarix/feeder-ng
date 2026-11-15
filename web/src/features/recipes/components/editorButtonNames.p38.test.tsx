// B9-37 (A11Y-08, guard rule P38 from B9-32): every button of the Recipe editor has its own accessible name. Repeated controls name their
// Step or line ("Remove Step 2", "Step 2 actions", "Step 2: Active", "Add ingredient use to Step 2", "Choose a file for Step 2",
// "Remove 2 clove garlic from Step 2", "Unit for garlic", "Ingredient of line 2"); the visible words stay short. The name is taken as P38
// takes it: aria-label, else the text.
import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { flour, garlic } from '../fixtures.test-helper'
import { newLineDraft, type LineDraft, type StepDraft } from '../lib/draft'
import { IngredientLineRow } from './IngredientLineRow'
import { StepsEditor } from './StepsEditor'

const step = (over: Partial<StepDraft>): StepDraft => ({ key: 'k', text: 'Fry', kind: 'active', durationMinutes: '5', leadTimeMinutes: '', after: [], uses: [], image: '', ...over })
const use = (key: string) => ({ key, ingredientId: 7, ingredientName: '', quantity: '2', unit: 'clove' })
const line = (over: Partial<LineDraft>): LineDraft => ({ ...newLineDraft(), ...over })

/** Names shared by two or more buttons (any element P38 counts: button, [role=button]). */
function duplicates(root: HTMLElement): string[] {
  const seen = new Map<string, number>()
  for (const b of root.querySelectorAll<HTMLElement>('button, [role="button"]')) {
    const n = (b.getAttribute('aria-label') ?? b.textContent ?? '').replace(/\s+/g, ' ').trim()
    if (n) seen.set(n, (seen.get(n) ?? 0) + 1)
  }
  return [...seen].filter(([, k]) => k > 1).map(([n]) => n)
}

describe('the Recipe editor names every button once (P38)', () => {
  it('two Steps, each with the same use and an Add Photo, then their Photo pickers and an open use: no two buttons share a name', async () => {
    const steps = [step({ key: 'a', uses: [use('u1')] }), step({ key: 'b', uses: [use('u2')], after: [0] })]
    const { container, getAllByRole } = render(<StepsEditor steps={steps} errors={{}} onChange={() => {}} ingredients={[garlic, flour]} />)
    expect(duplicates(container)).toEqual([])
    for (const chip of getAllByRole('button', { name: /^Add Photo to Step \d$/ })) await userEvent.click(chip)
    await userEvent.click(getAllByRole('button', { name: /^2 clove Garlic( in Step \d+)?$/ })[0]!)
    expect(duplicates(container)).toEqual([])
    expect(getAllByRole('button', { name: /^Choose a file for Step \d$/ })).toHaveLength(2)
    expect(getAllByRole('button', { name: /^Remove 2 clove Garlic from Step \d$/ }).map((b) => b.getAttribute('aria-label'))).toEqual([
      'Remove 2 clove Garlic from Step 1',
      'Remove 2 clove Garlic from Step 2',
    ])
  })

  it('two lines, blank or with the same unit, never share a Select, menu or remove name', () => {
    const lines = [line({ key: 'l1', ingredientId: 7, unit: 'g' }), line({ key: 'l2', ingredientId: 8, unit: 'g' }), line({ key: 'l3' }), line({ key: 'l4' })]
    const { container } = render(
      <ul>
        {lines.map((l, i) => (
          <IngredientLineRow key={l.key} line={l} index={i} errors={{}} ingredient={[garlic, flour].find((g) => g.id === l.ingredientId)} ingredients={[garlic, flour]} onPick={() => {}} onChange={() => {}} onRemove={() => {}} />
        ))}
      </ul>,
    )
    expect(duplicates(container)).toEqual([])
    expect(container.querySelectorAll('[aria-label="Unit for garlic"], [aria-label="Unit for flour"]')).toHaveLength(2)
  })
})
