import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Avatar } from './Avatar'
import { BentoGrid } from './BentoGrid'
import { Icon } from './Icon'
import * as barrel from './index'
import { icons } from './icons'
import { mealSlotIcon } from './lib/mealSlotIcon'
import { tagIcon } from './lib/tagIcon'
import { declarations, readUiCss } from './test-utils'

describe('WP3b #6/#16: icons moveUp, moveDown, mute', () => {
  it('registers the three names', () => {
    expect(Object.keys(icons)).toEqual(expect.arrayContaining(['moveUp', 'moveDown', 'mute']))
  })
  it('renders a distinct svg for each', () => {
    const html = (name: 'moveUp' | 'moveDown' | 'mute') => {
      const { container, unmount } = render(<Icon name={name} />)
      const out = container.querySelector('svg')?.innerHTML ?? ''
      unmount()
      return out
    }
    const all = [html('moveUp'), html('moveDown'), html('mute')]
    expect(all.every((h) => h.includes('<path'))).toBe(true)
    expect(new Set(all).size).toBe(3)
  })
})

describe('WP3b #9 (DS-A, ADR 0016): the week is a BentoGrid by minimum tile width, not 7 columns', () => {
  it('min="day" sets data-min and the stylesheet lays out auto-fill tracks of --tile-min-day', () => {
    render(<BentoGrid min="day" label="Week" />)
    const grid = screen.getByRole('group', { name: 'Week' })
    expect(grid).toHaveAttribute('data-min', 'day')
    expect(grid).not.toHaveAttribute('data-columns')
    expect(declarations(readUiCss('BentoGrid.css'), ".bento-grid[data-min='day']")['grid-template-columns']).toBe(
      'repeat(auto-fill, minmax(min(var(--tile-min-day), 100%), 1fr))',
    )
  })
})

describe('WP3b #10: why chip and primary Button on the accent hero (plan 4.3, 5.1)', () => {
  it('a why chip on a hero Tile uses surface fill and accent text', () => {
    expect(declarations(readUiCss('Chip.css'), ".tile[data-variant='hero'] .chip[data-kind='why']")).toMatchObject({
      background: 'var(--color-surface)',
      color: 'var(--color-accent-text)',
    })
  })
  it('a primary Button on a hero Tile uses surface fill and accent text', () => {
    expect(declarations(readUiCss('Button.css'), ".tile[data-variant='hero'] .button[data-variant='primary']")).toMatchObject({
      background: 'var(--color-surface)',
      color: 'var(--color-accent-text)',
    })
  })
  it('the existing hero secondary rule is unchanged; the base why chip is the neutral surface-2 (DS-A system.md §6)', () => {
    expect(declarations(readUiCss('Button.css'), ".tile[data-variant='hero'] .button[data-variant='secondary']")).toMatchObject({ background: 'var(--color-surface)' })
    expect(declarations(readUiCss('Chip.css'), ".chip[data-kind='why']")).toMatchObject({ background: 'var(--color-surface-2)' })
  })
})

describe('WP3b #11: barrel exports mealSlotIcon and tagIcon', () => {
  it('are the same functions as in lib/', () => {
    expect(barrel.mealSlotIcon).toBe(mealSlotIcon)
    expect(barrel.tagIcon).toBe(tagIcon)
    expect(barrel.mealSlotIcon('Dinner')).toBe('dinner')
  })
})

describe('WP3b #13: Avatar colour', () => {
  it('draws a ring in the given colour (initials avatar) through a custom property', () => {
    render(<Avatar name="Ada Lovelace" colour="#c04b2d" />)
    const el = screen.getByRole('img', { name: 'Ada Lovelace' })
    expect(el.style.getPropertyValue('--avatar-colour')).toBe('#c04b2d')
    expect(el).toHaveAttribute('data-coloured', 'true')
  })
  it('also rings a picture avatar, and accepts a token', () => {
    render(<Avatar name="Ben" imageUrl="/b.png" colour="var(--status-pinned-solid)" />)
    const el = screen.getByRole('img', { name: 'Ben' })
    expect(el.tagName).toBe('IMG')
    expect(el.style.getPropertyValue('--avatar-colour')).toBe('var(--status-pinned-solid)')
  })
  it('without colour nothing changes', () => {
    render(<Avatar name="Cy" />)
    const el = screen.getByRole('img', { name: 'Cy' })
    expect(el).not.toHaveAttribute('data-coloured')
    expect(el.getAttribute('style')).toBeNull()
  })
  it('the ring is a 2 px box-shadow in the custom property, off by default (no colour literal)', () => {
    const css = readUiCss('Avatar.css')
    expect(declarations(css, ".avatar[data-coloured='true']")['box-shadow']).toBe('0 0 0 2px var(--avatar-colour)')
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })
})
