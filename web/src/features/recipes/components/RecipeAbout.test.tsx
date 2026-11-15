// RX-05: the lede of Recipe detail: the description (clamped, with Show more) and the Source line (attribution and a link).
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ clamped: false }))
vi.mock('../../../ui/useIsClamped', () => ({ useIsClamped: () => h.clamped }))

import { RecipeAbout } from './RecipeAbout'

const LONG = 'A quick weeknight tomato sauce with garlic and basil. Make the sauce ahead on Sunday and keep it in the fridge; on the day, boil the pasta and toss everything together.'
const none = { url: '', attribution: '' }
const lede = (c: HTMLElement) => c.querySelector('.recipe-about') as HTMLElement

beforeEach(() => {
  h.clamped = false
})

describe('RecipeAbout: what shows', () => {
  it('renders nothing with no description and no Source', () => {
    const { container } = render(<RecipeAbout description="" source={none} />)
    expect(container).toBeEmptyDOMElement()
    const spaces = render(<RecipeAbout description="   " source={{ url: ' ', attribution: ' ' }} />)
    expect(spaces.container).toBeEmptyDOMElement()
  })
  it('shows the description as body text, not in a Tile', () => {
    const { container } = render(<RecipeAbout description={LONG} source={none} />)
    expect(screen.getByText(LONG)).toBeInTheDocument()
    expect(lede(container)).toBeInTheDocument()
    expect(container.querySelector('.tile')).toBeNull()
  })
  it('a Source and no description is a lede with the Source line only', () => {
    const { container } = render(<RecipeAbout description="" source={{ url: '', attribution: 'Gran' }} />)
    expect(lede(container)).toBeInTheDocument()
    expect(container.querySelector('.recipe-about__text')).toBeNull()
    expect(screen.getByText('Source: Gran')).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
  })
})

describe('RecipeAbout: the Source line', () => {
  it('with both: "Source: <attribution> · <host>", the host a link that opens in a new tab with a full name', () => {
    const { container } = render(<RecipeAbout description="" source={{ url: 'https://example.test/pancakes', attribution: 'Nonna Lucia Maria Bernadette' }} />)
    expect(container.querySelector('.recipe-source')).toHaveTextContent('Source: Nonna Lucia Maria Bernadette · example.test')
    const link = screen.getByRole('link', { name: 'Source: example.test, opens in a new tab' })
    expect(link).toHaveAttribute('href', 'https://example.test/pancakes')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link.getAttribute('rel')).toMatch(/noopener/)
    expect(link.getAttribute('rel')).toMatch(/noreferrer/)
    expect(link).toHaveClass('text-link')
    expect(link.querySelector('svg')).not.toBeNull() // the "opens in a new tab" icon, hidden from assistive technology
    expect(link.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })
  it('only an attribution: "Source: <attribution>" and no link', () => {
    render(<RecipeAbout description="" source={{ url: '', attribution: 'Gran' }} />)
    expect(screen.getByText('Source: Gran')).toBeInTheDocument()
    expect(screen.queryByRole('link')).toBeNull()
  })
  it('only an address: "Source: <host>", the host the link', () => {
    const { container } = render(<RecipeAbout description="" source={{ url: 'https://example.test/p', attribution: '' }} />)
    expect(container.querySelector('.recipe-source')).toHaveTextContent('Source: example.test')
    expect(screen.getByRole('link', { name: 'Source: example.test, opens in a new tab' })).toBeInTheDocument()
  })
  // Ruling 4 (main session): such an address is shown as plain text after the attribution, never a link and never run.
  it('an address that is not http(s) is never a link, whatever it says: it is plain text after the attribution', () => {
    const { container } = render(<RecipeAbout description="" source={{ url: 'javascript:alert(1)', attribution: 'Gran' }} />)
    expect(screen.queryByRole('link')).toBeNull()
    expect(container.querySelector('a')).toBeNull()
    expect(container.querySelector('.recipe-source')).toHaveTextContent('Source: Gran · javascript:alert(1)')
  })
  it('an address that is not http(s) and no attribution: "Source: <address>" as plain text', () => {
    const { container } = render(<RecipeAbout description="" source={{ url: 'ftp://example.test/p', attribution: '' }} />)
    expect(container.querySelector('a')).toBeNull()
    expect(container.querySelector('.recipe-source')).toHaveTextContent('Source: ftp://example.test/p')
  })
  it('has the LinkSimple icon before the text, hidden from assistive technology', () => {
    const { container } = render(<RecipeAbout description="" source={{ url: '', attribution: 'Gran' }} />)
    const first = container.querySelector('.recipe-source > svg')
    expect(first).not.toBeNull()
    expect(first).toHaveAttribute('aria-hidden', 'true')
  })
})

describe('RecipeAbout: Show more', () => {
  it('has no button when the text is not clamped', () => {
    h.clamped = false
    render(<RecipeAbout description={LONG} source={none} />)
    expect(screen.queryByRole('button')).toBeNull()
  })
  it('has a small secondary button "Show more" when the text is clamped, wired to the description', () => {
    h.clamped = true
    const { container } = render(<RecipeAbout description={LONG} source={none} />)
    const more = screen.getByRole('button', { name: 'Show more' })
    expect(more).toHaveAttribute('data-variant', 'secondary')
    expect(more).toHaveAttribute('data-size', 'sm')
    expect(more).toHaveAttribute('aria-expanded', 'false')
    const text = container.querySelector('.recipe-about__text') as HTMLElement
    expect(text.id).not.toBe('')
    expect(more).toHaveAttribute('aria-controls', text.id)
    expect(text).toHaveAttribute('data-expanded', 'false')
  })
  it('opens the whole text, and then says "Show less"', async () => {
    h.clamped = true
    const { container } = render(<RecipeAbout description={LONG} source={none} />)
    await userEvent.click(screen.getByRole('button', { name: 'Show more' }))
    const less = screen.getByRole('button', { name: 'Show less' })
    expect(less).toHaveAttribute('aria-expanded', 'true')
    expect(container.querySelector('.recipe-about__text')).toHaveAttribute('data-expanded', 'true')
    await userEvent.click(less)
    expect(screen.getByRole('button', { name: 'Show more' })).toHaveAttribute('aria-expanded', 'false')
  })
  it('keeps the button once it is open even though the open text no longer reads as clamped', async () => {
    h.clamped = true
    const { rerender } = render(<RecipeAbout description={LONG} source={none} />)
    await userEvent.click(screen.getByRole('button', { name: 'Show more' }))
    h.clamped = false // an open text fits its box
    rerender(<RecipeAbout description={LONG} source={none} />)
    expect(screen.getByRole('button', { name: 'Show less' })).toBeInTheDocument()
  })
  it('shares one row with the Source line (nothing takes a line it does not need)', () => {
    h.clamped = true
    const { container } = render(<RecipeAbout description={LONG} source={{ url: 'https://example.test/p', attribution: 'Gran' }} />)
    const row = container.querySelector('.recipe-about__row') as HTMLElement
    expect(within(row).getByRole('button', { name: 'Show more' })).toBeInTheDocument()
    expect(row.querySelector('.recipe-source')).not.toBeNull()
  })
})
