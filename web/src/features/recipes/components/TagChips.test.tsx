import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TagChips } from './TagChips'

const tags = [{ name: 'roast', recipes: 1 }, { name: 'sweet', recipes: 2 }]
const group = () => screen.getByRole('group', { name: 'All Tags' })

describe('TagChips: scroll fade', () => {
  it('has no leading fade at scroll start, so "All Tags" is never covered', () => {
    render(<TagChips tags={tags} selected="" onSelect={() => {}} />)
    expect(group().dataset.scrolled ?? 'false').toBe('false')
  })
  it('marks the row as scrolled once it has moved, and clears the mark back at the start', () => {
    render(<TagChips tags={tags} selected="" onSelect={() => {}} />)
    const el = group()
    el.scrollLeft = 24
    fireEvent.scroll(el)
    expect(el.dataset.scrolled).toBe('true')
    el.scrollLeft = 0
    fireEvent.scroll(el)
    expect(el.dataset.scrolled ?? 'false').toBe('false')
  })
})
