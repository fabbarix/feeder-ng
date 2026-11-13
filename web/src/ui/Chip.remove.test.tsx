// hf-recipes-filter: a removable Chip (an active filter: "Main ×", "● fish ×"), docs/design/recipes-filter.md 7.4.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Chip } from './Chip'
import { readUiCss } from './test-utils'

const css = readUiCss('Chip.css').replace(/\/\*[\s\S]*?\*\//g, '')

describe('Chip onRemove', () => {
  it('is one button named by removeLabel, showing its text then a close icon', () => {
    render(<Chip kind="tag" onRemove={() => {}} removeLabel="Remove Course: Main">Main</Chip>)
    const chip = screen.getByRole('button', { name: 'Remove Course: Main' })
    expect(chip).toHaveClass('chip')
    expect(chip).toHaveAttribute('data-removable')
    expect(chip.querySelector('.chip__label')).toHaveTextContent('Main')
    const icon = chip.querySelector('.chip__remove')
    expect(icon).not.toBeNull()
    expect(icon?.querySelector('svg')).not.toBeNull()
    expect(chip.querySelector('.chip__label')?.compareDocumentPosition(icon!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  })
  it('is not a toggle (no aria-pressed)', () => {
    render(<Chip kind="tag" onRemove={() => {}} removeLabel="Remove Tag: fish">fish</Chip>)
    expect(screen.getByRole('button')).not.toHaveAttribute('aria-pressed')
  })
  it('calls onRemove when pressed, by click or keyboard', async () => {
    const onRemove = vi.fn()
    render(<Chip kind="tag" onRemove={onRemove} removeLabel="Remove Tag: fish">fish</Chip>)
    await userEvent.click(screen.getByRole('button'))
    screen.getByRole('button').focus()
    await userEvent.keyboard('{Enter}')
    expect(onRemove).toHaveBeenCalledTimes(2)
  })
  it('keeps its Tag colour and the full text as its tooltip', () => {
    render(<Chip kind="tag" tagColour="teal" onRemove={() => {}} removeLabel="Remove Tag: a very long Tag name">a very long Tag name</Chip>)
    const chip = screen.getByRole('button')
    expect(chip).toHaveAttribute('data-tag-colour', 'teal')
    expect(chip).toHaveAttribute('title', 'a very long Tag name')
  })
  it('without onRemove a tag chip is still a plain span', () => {
    const { container } = render(<Chip kind="tag">fish</Chip>)
    expect(screen.queryByRole('button')).toBeNull()
    expect(container.querySelector('span.chip')).not.toBeNull()
  })
})

describe('Chip.css for a removable chip', () => {
  it('has a 44 px hit area around the 26 px chip', () => {
    const before = /\.chip\[data-removable\]::before\s*\{([^}]*)\}/.exec(css)?.[1] ?? ''
    expect(before).toMatch(/content:\s*''/)
    expect(before).toMatch(/position:\s*absolute/)
    expect(css).toMatch(/\.chip\[data-removable\]\s*\{[^}]*position:\s*relative/)
  })
  it('the close icon does not shrink', () => {
    expect(css).toMatch(/\.chip__remove\s*\{[^}]*flex:\s*none/)
  })
})
