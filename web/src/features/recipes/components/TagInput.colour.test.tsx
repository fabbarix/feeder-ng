// TG-RW: the Recipe editor's Tag field: coloured chips, dots on the suggestions, a new Tag neutral with "New".
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { TagInput } from './TagInput'

const known = [{ name: 'roast', recipes: 3 }, { name: 'roasted veg', recipes: 1 }, { name: 'quick', recipes: 2 }]
const colours: Record<string, string> = { roast: 'tomato', 'roasted veg': 'sage', quick: 'sky' }
const colourOf = (n: string) => colours[n.toLowerCase()]
const chip = (tag: string) => screen.getByRole('button', { name: `Remove Tag ${tag}` })

describe('TagInput chips', () => {
  it('a saved Tag chip carries its colour and no "New" marker', () => {
    render(<TagInput tags={['roast']} known={known} colourOf={colourOf} onChange={() => {}} />)
    expect(chip('roast')).toHaveAttribute('data-tag-colour', 'tomato')
    expect(chip('roast')).not.toHaveTextContent('New')
  })
  it('finds the colour for a different spelling of a saved Tag (by key)', () => {
    render(<TagInput tags={['Roast']} known={known} colourOf={colourOf} onChange={() => {}} />)
    expect(chip('Roast')).toHaveAttribute('data-tag-colour', 'tomato')
  })
  it('a Tag no one has saved is neutral and says "New"; its accessible name stays "Remove Tag X"', () => {
    render(<TagInput tags={['fresh']} known={known} colourOf={colourOf} onChange={() => {}} />)
    expect(chip('fresh')).not.toHaveAttribute('data-tag-colour')
    expect(chip('fresh')).toHaveTextContent('fresh')
    expect(chip('fresh')).toHaveTextContent('New')
  })
  it('without colourOf no chip claims to be New (nothing is known yet)', () => {
    render(<TagInput tags={['fresh']} onChange={() => {}} />)
    expect(chip('fresh')).not.toHaveTextContent('New')
  })
})

describe('TagInput suggestions', () => {
  it('each suggestion has a dot in its Tag colour, aria-hidden, before the name', async () => {
    render(<TagInput tags={[]} known={known} colourOf={colourOf} onChange={() => {}} />)
    await userEvent.type(screen.getByRole('combobox', { name: 'Add a Tag' }), 'roast')
    const options = within(screen.getByRole('listbox', { name: 'Existing Tags' })).getAllByRole('option')
    expect(options).toHaveLength(2)
    const dots = options.map((o) => o.querySelector('.tag-dot'))
    expect(dots.map((d) => d?.getAttribute('data-tag-colour'))).toEqual(['tomato', 'sage'])
    expect(dots[0]).toHaveAttribute('aria-hidden', 'true')
  })
  it('the option\'s name stays the Tag name plus its Recipe count (the dot adds no text)', async () => {
    render(<TagInput tags={[]} known={known} colourOf={colourOf} onChange={() => {}} />)
    await userEvent.type(screen.getByRole('combobox', { name: 'Add a Tag' }), 'roast')
    expect(screen.getByRole('option', { name: 'roast 3 Recipes' })).toBeInTheDocument()
  })
  it('a suggestion with no known colour gets the neutral dot', async () => {
    render(<TagInput tags={[]} known={known} colourOf={() => undefined} onChange={() => {}} />)
    await userEvent.type(screen.getByRole('combobox', { name: 'Add a Tag' }), 'quick')
    expect(screen.getByRole('option').querySelector('.tag-dot')).not.toHaveAttribute('data-tag-colour')
  })
  it('picking a suggestion still adds the Tag with the existing spelling', async () => {
    const seen: string[][] = []
    render(<TagInput tags={[]} known={known} colourOf={colourOf} onChange={(t) => seen.push(t)} />)
    await userEvent.type(screen.getByRole('combobox', { name: 'Add a Tag' }), 'QUI')
    await userEvent.click(screen.getByRole('option'))
    expect(seen.at(-1)).toEqual(['quick'])
  })
})
