// Chip with a Tag colour (TG-UI, spec 4.1): tinted pill with a leading dot; filter chips neutral until selected.
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TAG_COLOURS } from '../lib/tags/palette'
import { Chip } from './Chip'
import { declarations, readUiCss } from './test-utils'

const IDS = ['tomato', 'apricot', 'mustard', 'olive', 'sage', 'teal', 'sky', 'blue', 'plum', 'rose']
const chipOf = (text: string) => screen.getByText(text).closest('.chip')!
const dotOf = (el: Element) => el.querySelector('.chip__dot')

describe('Chip tagColour: tag kind', () => {
  it('carries data-tag-colour and one decorative leading dot', () => {
    render(<Chip tagColour="sage">Fish</Chip>)
    const el = chipOf('Fish')
    expect(el).toHaveAttribute('data-kind', 'tag')
    expect(el).toHaveAttribute('data-tag-colour', 'sage')
    const dot = dotOf(el)!
    expect(dot).not.toBeNull()
    expect(dot).toHaveAttribute('aria-hidden', 'true')
    expect(el.firstElementChild).toBe(dot)
  })
  it('the dot adds no text to the accessible name', () => {
    render(<Chip tagColour="rose">Dessert</Chip>)
    expect(chipOf('Dessert')).toHaveTextContent(/^Dessert$/)
  })
  it.each(IDS)('accepts %s', (id) => {
    render(<Chip tagColour={id}>x</Chip>)
    expect(chipOf('x')).toHaveAttribute('data-tag-colour', id)
  })
  it('an unknown id is the neutral chip: no attribute, no dot', () => {
    render(<Chip tagColour="chartreuse">Odd</Chip>)
    const el = chipOf('Odd')
    expect(el).not.toHaveAttribute('data-tag-colour')
    expect(dotOf(el)).toBeNull()
    expect(el).toHaveAttribute('data-kind', 'tag')
  })
  it('no tagColour: no dot and no attribute (existing tag chips are unchanged)', () => {
    render(<Chip>Plain</Chip>)
    expect(chipOf('Plain')).not.toHaveAttribute('data-tag-colour')
    expect(dotOf(chipOf('Plain'))).toBeNull()
  })
  it('a dot goes before an icon', () => {
    const { container } = render(<Chip tagColour="sky" icon="pinned">x</Chip>)
    const chip = container.querySelector('.chip')!
    expect(chip.children[0]).toHaveClass('chip__dot')
    expect(chip.children[1]!.tagName.toLowerCase()).toBe('svg')
  })
})

describe('Chip tagColour: filter kind', () => {
  it('unselected: neutral filter chip with the dot, no tick', () => {
    const { container } = render(<Chip kind="filter" tagColour="plum" selected={false} onClick={() => {}}>Pasta</Chip>)
    const el = screen.getByRole('button', { name: 'Pasta' })
    expect(el).toHaveAttribute('aria-pressed', 'false')
    expect(el).toHaveAttribute('data-tag-colour', 'plum')
    expect(dotOf(el)).not.toBeNull()
    expect(container.querySelector('svg')).toBeNull()
  })
  it('selected: tinted, with the tick instead of the dot', () => {
    const { container } = render(<Chip kind="filter" tagColour="plum" selected onClick={() => {}}>Pasta</Chip>)
    const el = screen.getByRole('button', { name: 'Pasta' })
    expect(el).toHaveAttribute('aria-pressed', 'true')
    expect(el).toHaveAttribute('data-tag-colour', 'plum')
    expect(dotOf(el)).toBeNull()
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })
  it('an unknown id on a filter chip is the usual filter chip', () => {
    const { container } = render(<Chip kind="filter" tagColour="nope" selected={false} onClick={() => {}}>Pasta</Chip>)
    expect(screen.getByRole('button', { name: 'Pasta' })).not.toHaveAttribute('data-tag-colour')
    expect(container.querySelector('.chip__dot')).toBeNull()
  })
})

describe('Chip tagColour: other kinds are untouched', () => {
  it.each(['status', 'state'] as const)('a %s chip ignores tagColour', (kind) => {
    render(<Chip kind={kind} status="spoil" tagColour="sage">Goes off</Chip>)
    const el = chipOf('Goes off')
    expect(el).not.toHaveAttribute('data-tag-colour')
    expect(dotOf(el)).toBeNull()
    expect(el).toHaveAttribute('data-status', 'spoil')
  })
  it.each(['why', 'count'] as const)('a %s chip ignores tagColour', (kind) => {
    render(<Chip kind={kind} tagColour="sage">x</Chip>)
    expect(chipOf('x')).not.toHaveAttribute('data-tag-colour')
  })
})

describe('Chip.css: Tag colour tokens', () => {
  const css = readUiCss('Chip.css')
  it('the palette is the ten ids', () => expect(TAG_COLOURS).toEqual(IDS))
  it.each(IDS)('%s tag chip: tinted fill and text from its tokens', (id) => {
    expect(declarations(css, `.chip[data-kind='tag'][data-tag-colour='${id}']`)).toMatchObject({
      background: `var(--tag-${id}-bg)`,
      color: `var(--tag-${id}-fg)`,
    })
  })
  it.each(IDS)('%s selected filter chip: tinted fill and text from its tokens', (id) => {
    expect(declarations(css, `.chip[data-kind='filter'][data-tag-colour='${id}'][aria-pressed='true']`)).toMatchObject({
      background: `var(--tag-${id}-bg)`,
      color: `var(--tag-${id}-fg)`,
    })
  })
  it.each(IDS)('%s dot: its dot token', (id) => {
    expect(declarations(css, `.chip[data-tag-colour='${id}'] .chip__dot`)).toMatchObject({ background: `var(--tag-${id}-dot)` })
  })
  it('the dot is an 8 px circle', () => {
    expect(declarations(css, '.chip__dot')).toMatchObject({ 'inline-size': '8px', 'block-size': '8px', 'border-radius': '50%' })
  })
  it('an unselected filter chip keeps the neutral filter look (no rule tints it)', () => {
    for (const id of IDS) {
      expect(() => declarations(css, `.chip[data-kind='filter'][data-tag-colour='${id}']`)).toThrow()
    }
  })
  it('the existing kinds still map to their tokens', () => {
    expect(declarations(css, ".chip[data-kind='tag']")).toMatchObject({ background: 'var(--color-surface-2)', color: 'var(--color-muted)' })
    expect(declarations(css, ".chip[data-kind='filter'][aria-pressed='true']")).toMatchObject({ background: 'var(--color-accent)' })
  })
})
