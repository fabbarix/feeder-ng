// TG-RW: the Tag filter carries each Tag's colour (spec 4.1; tg-ui.md 4: unselected shows the dot, selected is tinted).
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TagChips } from './TagChips'

const tags = [{ name: 'roast', recipes: 1 }, { name: 'sweet', recipes: 2 }, { name: 'new thing', recipes: 1 }]
const colours: Record<string, string> = { roast: 'tomato', sweet: 'plum' }
const colourOf = (n: string) => colours[n]
const chip = (name: string) => screen.getByRole('button', { name })

describe('TagChips colours', () => {
  it('an unselected Tag chip carries its colour and shows the dot', () => {
    render(<TagChips tags={tags} selected="" onSelect={() => {}} colourOf={colourOf} />)
    expect(chip('roast')).toHaveAttribute('data-tag-colour', 'tomato')
    expect(chip('roast')).toHaveAttribute('aria-pressed', 'false')
    expect(chip('roast').querySelector('.chip__dot')).not.toBeNull()
    expect(chip('sweet')).toHaveAttribute('data-tag-colour', 'plum')
  })
  it('the selected Tag chip keeps its colour, is pressed, and swaps the dot for the tick', () => {
    render(<TagChips tags={tags} selected="roast" onSelect={() => {}} colourOf={colourOf} />)
    expect(chip('roast')).toHaveAttribute('aria-pressed', 'true')
    expect(chip('roast')).toHaveAttribute('data-tag-colour', 'tomato')
    expect(chip('roast').querySelector('.chip__dot')).toBeNull()
  })
  it('a Tag with no known colour is a neutral chip', () => {
    render(<TagChips tags={tags} selected="" onSelect={() => {}} colourOf={colourOf} />)
    expect(chip('new thing')).not.toHaveAttribute('data-tag-colour')
    expect(chip('new thing').querySelector('.chip__dot')).toBeNull()
  })
  it('"All Tags" is never coloured', () => {
    render(<TagChips tags={tags} selected="" onSelect={() => {}} colourOf={colourOf} />)
    expect(chip('All Tags')).not.toHaveAttribute('data-tag-colour')
  })
  it('selecting still works by the filter\'s own spelling, whatever the case of `selected`', () => {
    render(<TagChips tags={tags} selected="ROAST" onSelect={() => {}} colourOf={colourOf} />)
    expect(chip('roast')).toHaveAttribute('aria-pressed', 'true')
  })
  it('without colourOf the chips are neutral, as before', () => {
    const { container } = render(<TagChips tags={tags} selected="" onSelect={() => {}} />)
    expect(container.querySelector('[data-tag-colour]')).toBeNull()
  })
})
