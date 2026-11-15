// B9-44 (TB-09, RES-09 target): To confirm's title row is the shared TileHeader (an info `markCooked` badge, the h2 "To confirm" that names the
// section, a count Chip named "<n> items"); .to-confirm__head / __badge / __heading / __count are gone from the DOM and from TonightHero.css.
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { readSource } from '../test-css'
import { courseMeal, planCourse, slot } from '../test-utils'
import type { PlanEntry } from '../types'
import { ToConfirmTile } from './TodayTiles'

const entry = (mealSlotId: number, name: string): PlanEntry =>
  slot({ date: '2026-11-11', mealSlotId, name, courseId: 1, courseName: 'Main', meal: courseMeal(1, 'Main', { recipeName: `Recipe ${name}`, mealSlotId, date: '2026-11-11' }), courses: [planCourse({ courseId: 1, name: 'Main', main: true })] })
const noop = () => {}
const view = (slots: PlanEntry[]) => render(<ToConfirmTile slots={slots} onYesCooked={noop} onAdjust={noop} onNotCooked={noop} />)

describe('ToConfirmTile: TileHeader (TB-09)', () => {
  it('has one .tile-header with an info badge, the h2 "To confirm" and a count Chip', () => {
    const { container } = view([entry(1, 'Lunch'), entry(2, 'Dinner')])
    expect(container.querySelectorAll('.tile-header')).toHaveLength(1)
    expect(container.querySelector('.tile-header__badge')).toHaveAttribute('data-tone', 'info')
    const count = container.querySelector('.tile-header .chip[data-kind="count"]')!
    expect(count).toHaveTextContent('2')
    expect(count).toHaveAccessibleName('2 items')
  })

  it('the section is named by its h2 (aria-labelledby)', () => {
    view([entry(1, 'Lunch')])
    const h2 = screen.getByRole('heading', { level: 2, name: 'To confirm' })
    const section = h2.closest('section')!
    expect(section).toHaveAttribute('aria-labelledby', h2.id)
    expect(within(section).getAllByRole('listitem')).toHaveLength(1)
  })

  it('has no hand-built title row', () => {
    const { container } = view([entry(1, 'Lunch')])
    for (const c of ['to-confirm__head', 'to-confirm__badge', 'to-confirm__heading', 'to-confirm__count']) expect(container.querySelector(`.${c}`), c).toBeNull()
  })

  it('TonightHero.css no longer styles the hand-built title row', () => {
    const css = readSource('features/plan/components/TonightHero.css')
    for (const c of ['.to-confirm__head', '.to-confirm__badge', '.to-confirm__heading', '.to-confirm__count']) expect(css, c).not.toContain(c)
  })
})
