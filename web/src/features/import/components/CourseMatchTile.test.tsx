// CRS E2: one unknown or archived Course name of the file (keyboard and ARIA; docs/dev/design/crs-e2.md 4.3).
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { courseChoices } from '../../recipes/fixtures.test-helper'
import { courseRow } from '../fixtures.test-helper'
import type { CourseMatch } from '../types'
import { CourseMatchTile } from './CourseMatchTile'

const soup = courseRow({ key: 'soup', name: 'Soup', status: 'unknown' })
const brunch = courseRow({ key: 'brunch', name: 'Brunch', status: 'archived', match: { id: 9, name: 'Brunch', main: false, archived: true } })

function view(match: CourseMatch = soup, over: { isAdmin?: boolean; usedBy?: string[] } = {}) {
  const on = { onUse: vi.fn(), onSkip: vi.fn(), onAdd: vi.fn(), onUnarchive: vi.fn() }
  render(<CourseMatchTile match={match} usedBy={over.usedBy ?? ['Pancakes', 'Rice']} courses={courseChoices} isAdmin={over.isAdmin ?? true} {...on} />)
  return on
}

describe('CourseMatchTile: an unknown name', () => {
  it('is a section named after the name, with a status chip and the sentence', () => {
    view()
    const tile = screen.getByRole('region', { name: 'Soup' })
    expect(within(tile).getByRole('heading', { name: 'Soup' })).toBeInTheDocument()
    expect(within(tile).getByText('Not one of your Courses')).toBeInTheDocument()
    expect(within(tile).getByText('Soup is not one of your Courses')).toBeInTheDocument()
  })
  it('names the Recipes that use it', () => {
    view()
    expect(screen.getByText('Used by Pancakes, Rice')).toBeInTheDocument()
  })
  it('says nothing about Recipes when none is listed', () => {
    view(soup, { usedBy: [] })
    expect(screen.queryByText(/^Used by/)).toBeNull()
  })
  it('offers the shared Course select with the answer in force (the main Course by default)', () => {
    view()
    expect(screen.getByRole('combobox', { name: 'Use this Course instead' })).toHaveTextContent('Main')
  })
  it('shows an empty select while the answer is Skip', () => {
    view({ ...soup, effective: { key: 'soup', action: 'skip' } })
    expect(screen.getByRole('combobox', { name: 'Use this Course instead' })).not.toHaveTextContent('Main')
  })
  it('choosing a Course in the select answers use with its id', async () => {
    const on = view()
    await userEvent.click(screen.getByRole('combobox', { name: 'Use this Course instead' }))
    await userEvent.click(screen.getByRole('option', { name: /Starter/ }))
    expect(on.onUse).toHaveBeenCalledWith(3)
  })
  it('offers Skip and, to an Admin, Add as a Course, in a group named for the name', () => {
    view()
    const group = screen.getByRole('group', { name: 'Answer for Soup' })
    expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual(['Skip Soup', 'Add Soup as a Course'])
  })
  it('Skip and Add call their handlers', async () => {
    const on = view()
    await userEvent.click(screen.getByRole('button', { name: 'Skip Soup' }))
    await userEvent.click(screen.getByRole('button', { name: 'Add Soup as a Course' }))
    expect(on.onSkip).toHaveBeenCalledTimes(1)
    expect(on.onAdd).toHaveBeenCalledTimes(1)
  })
  it('presses the chip of the answer in force', () => {
    view({ ...soup, effective: { key: 'soup', action: 'add' } })
    expect(screen.getByRole('button', { name: 'Add Soup as a Course' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Skip Soup' })).toHaveAttribute('aria-pressed', 'false')
  })
  it('presses none of them while the answer is use', () => {
    view()
    for (const b of within(screen.getByRole('group', { name: 'Answer for Soup' })).getAllByRole('button')) expect(b).toHaveAttribute('aria-pressed', 'false')
  })
  it('is reachable from the keyboard: Tab to the chips, Enter and Space answer', async () => {
    const on = view()
    screen.getByRole('button', { name: 'Skip Soup' }).focus()
    await userEvent.keyboard('{Enter}')
    await userEvent.tab()
    expect(screen.getByRole('button', { name: 'Add Soup as a Course' })).toHaveFocus()
    await userEvent.keyboard(' ')
    expect(on.onSkip).toHaveBeenCalledTimes(1)
    expect(on.onAdd).toHaveBeenCalledTimes(1)
  })
  it('offers a non-Admin no Add, and says why', () => {
    view(soup, { isAdmin: false })
    expect(screen.queryByRole('button', { name: /Add Soup/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'Skip Soup' })).toBeInTheDocument()
    expect(screen.getByText('Only an Admin can add a Course.')).toBeInTheDocument()
  })
  it('uses no native select', () => {
    view()
    expect(document.querySelector('select')).toBeNull()
  })
})

describe('CourseMatchTile: an archived Course', () => {
  it('says the Course is archived', () => {
    view(brunch)
    expect(screen.getByText('Archived Course')).toBeInTheDocument()
    expect(screen.getByText('Brunch is an archived Course')).toBeInTheDocument()
  })
  it('offers an Admin Skip and Unarchive, never Add', async () => {
    const on = view(brunch)
    const group = screen.getByRole('group', { name: 'Answer for Brunch' })
    expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual(['Skip Brunch', 'Unarchive Brunch'])
    await userEvent.click(screen.getByRole('button', { name: 'Unarchive Brunch' }))
    expect(on.onUnarchive).toHaveBeenCalledTimes(1)
  })
  it('offers a non-Admin no Unarchive, and says why', () => {
    view(brunch, { isAdmin: false })
    expect(screen.queryByRole('button', { name: /Unarchive/ })).toBeNull()
    expect(screen.getByText('Only an Admin can unarchive a Course.')).toBeInTheDocument()
  })
  it('still offers the select, whose options are the active Courses only', async () => {
    view(brunch)
    await userEvent.click(screen.getByRole('combobox', { name: 'Use this Course instead' }))
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Mainmain Course', 'Side', 'Starter', 'Dessert'])
  })
})
