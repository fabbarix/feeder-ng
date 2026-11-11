// R2-1 (E-01, F-01): Tags are a chip input: chips and the text field on one line in one control, md wide.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { TagInput } from './TagInput'

const view = (tags = ['roast', 'quick']) => {
  const onChange = vi.fn()
  const { container } = render(<TagInput tags={tags} onChange={onChange} />)
  return { onChange, container }
}

describe('TagInput', () => {
  it('is a group named "Tags", md wide', () => {
    const { container } = view()
    const group = screen.getByRole('group', { name: 'Tags' })
    expect(group).toBe(container.querySelector('.tag-input'))
    expect(group).toHaveAttribute('data-size', 'md')
  })
  it('puts the chips and the text field in the same control, chips first', () => {
    const { container } = view()
    const control = container.querySelector('.tag-input__control')!
    const chips = screen.getAllByRole('button')
    const box = screen.getByRole('combobox', { name: 'Add a Tag' })
    for (const c of chips) expect(control).toContainElement(c)
    expect(control).toContainElement(box)
    expect(chips.at(-1)!.compareDocumentPosition(box) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
  it('shows the group label "Tags" as visible text and hides the text field label visually', () => {
    const { container } = view()
    const group = screen.getByRole('group', { name: 'Tags' })
    const caption = container.querySelector('.tag-input__label')!
    expect(caption).toHaveTextContent('Tags')
    expect(caption).not.toHaveClass('visually-hidden')
    expect(group).toHaveAttribute('aria-labelledby', caption.id)
    expect(group).not.toHaveAttribute('aria-label')
    const fieldLabel = container.querySelector('.tag-input__control .ui-field__label')!
    expect(fieldLabel).toHaveTextContent('Add a Tag')
    expect(fieldLabel).not.toHaveClass('tag-input__label') // hidden by recipes.css, kept for assistive tech
    expect(screen.getByRole('combobox', { name: 'Add a Tag' })).toBeInTheDocument()
  })
  it('the text field has the placeholder "Add a Tag"', () => {
    view()
    expect(screen.getByRole('combobox', { name: 'Add a Tag' })).toHaveAttribute('placeholder', 'Add a Tag')
  })
  it('names each chip "Remove Tag X"', () => {
    view()
    expect(screen.getByRole('button', { name: 'Remove Tag roast' })).toHaveTextContent('roast')
    expect(screen.getByRole('button', { name: 'Remove Tag quick' })).toBeInTheDocument()
  })
  it('a chip is pressed; choosing it removes the Tag', async () => {
    const { onChange } = view()
    const chip = screen.getByRole('button', { name: 'Remove Tag roast' })
    expect(chip).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(chip)
    expect(onChange).toHaveBeenCalledWith(['quick'])
  })
  it('Enter and a comma add the typed Tag', async () => {
    const { onChange } = view([])
    await userEvent.type(screen.getByRole('combobox', { name: 'Add a Tag' }), 'soup{Enter}')
    expect(onChange).toHaveBeenLastCalledWith(['soup'])
    await userEvent.type(screen.getByRole('combobox', { name: 'Add a Tag' }), 'stew,')
    expect(onChange).toHaveBeenLastCalledWith(['stew'])
  })
  it('Backspace in the empty field removes the last Tag', async () => {
    const { onChange } = view()
    await userEvent.click(screen.getByRole('combobox', { name: 'Add a Tag' }))
    await userEvent.keyboard('{Backspace}')
    expect(onChange).toHaveBeenCalledWith(['roast'])
  })
  it('Backspace in a non-empty field only edits the text', async () => {
    const { onChange } = view()
    await userEvent.type(screen.getByRole('combobox', { name: 'Add a Tag' }), 'ab{Backspace}')
    expect(onChange).not.toHaveBeenCalled()
  })
  it('renders no chip list when there are no Tags', () => {
    view([])
    expect(screen.queryByRole('button')).toBeNull()
  })
})

describe('TagInput suggestions (existing Tags)', () => {
  const known = [
    { name: 'pasta', recipes: 12 },
    { name: 'pasta bake', recipes: 3 },
    { name: 'roast', recipes: 9 },
  ]
  const setup = (tags: string[] = []) => {
    const onChange = vi.fn()
    render(<TagInput tags={tags} known={known} onChange={onChange} />)
    return { onChange, box: screen.getByRole('combobox', { name: 'Add a Tag' }) }
  }

  it('lists matching Tags with their Recipe count while typing', async () => {
    const { box } = setup()
    expect(box).toHaveAttribute('aria-expanded', 'false')
    await userEvent.type(box, 'pas')
    expect(box).toHaveAttribute('aria-expanded', 'true')
    const options = screen.getAllByRole('option')
    expect(options.map((o) => o.textContent)).toEqual(['pasta12 Recipes', 'pasta bake3 Recipes'])
  })

  it('picks a suggestion with the arrows and Enter', async () => {
    const { box, onChange } = setup(['quick'])
    await userEvent.type(box, 'pas{ArrowDown}{ArrowDown}')
    expect(box).toHaveAttribute('aria-activedescendant', screen.getAllByRole('option')[1]!.id)
    await userEvent.keyboard('{Enter}')
    expect(onChange).toHaveBeenLastCalledWith(['quick', 'pasta bake'])
  })

  it('picks a suggestion with a tap', async () => {
    const { box, onChange } = setup()
    await userEvent.type(box, 'ro')
    await userEvent.click(screen.getByRole('option', { name: /roast/ }))
    expect(onChange).toHaveBeenLastCalledWith(['roast'])
  })

  it('saves a typed Tag that exists in another spelling with the existing spelling', async () => {
    const { box, onChange } = setup()
    await userEvent.type(box, 'PASTA{Enter}')
    expect(onChange).toHaveBeenLastCalledWith(['pasta'])
  })

  it('still adds a new Tag as typed', async () => {
    const { box, onChange } = setup()
    await userEvent.type(box, 'Vegan,')
    expect(onChange).toHaveBeenLastCalledWith(['Vegan'])
  })
})
