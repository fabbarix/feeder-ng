// CourseEaters (CRS D2): "Who eats it" as toggle pills; keyboard and ARIA.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CourseEaters, type CourseEatersProps } from './CourseEaters'
import { anna, marco, sam, zio } from './fixtures'

function setup(over: Partial<CourseEatersProps> = {}) {
  const props: CourseEatersProps = { courseName: 'Dessert', groupLabel: 'Who eats Dessert', members: [anna, marco, sam], optOutMemberIds: [3], onChange: vi.fn(), ...over }
  render(<CourseEaters {...props} />)
  return props
}
const group = () => screen.getByRole('group', { name: 'Who eats Dessert' })
const pill = (name: string) => within(group()).getByRole('button', { name })

describe('CourseEaters', () => {
  it('is a group with one toggle button per Member, pressed for those who eat the Course', () => {
    setup()
    expect(within(group()).getAllByRole('button').map((b) => [b.getAttribute('aria-label') ?? b.textContent, b.getAttribute('aria-pressed')])).toEqual([
      ['Anna', 'true'],
      ['Marco', 'true'],
      ['Sam', 'false'],
    ])
  })

  it('shows the Member pill (first name) but names the button by the full name', () => {
    setup({ members: [zio], optOutMemberIds: [] })
    const button = pill('Zio Carlo')
    expect(button).toHaveTextContent('Zio')
    expect(button).not.toHaveTextContent('Carlo')
  })

  it('pressing a pill says what that Member now does: opts out, or eats again', async () => {
    const { onChange } = setup()
    await userEvent.click(pill('Anna'))
    expect(onChange).toHaveBeenLastCalledWith(1, false)
    await userEvent.click(pill('Sam'))
    expect(onChange).toHaveBeenLastCalledWith(3, true)
  })

  it('works from the keyboard: Tab through the pills, Space and Enter toggle', async () => {
    const { onChange } = setup()
    await userEvent.tab()
    expect(pill('Anna')).toHaveFocus()
    await userEvent.tab()
    await userEvent.tab()
    expect(pill('Sam')).toHaveFocus()
    await userEvent.keyboard(' ')
    expect(onChange).toHaveBeenLastCalledWith(3, true)
    await userEvent.keyboard('{Enter}')
    expect(onChange).toHaveBeenCalledTimes(2)
  })

  it('writes who is left out in words, so it is not only a state of a pill', () => {
    setup({ optOutMemberIds: [3, 2] })
    expect(screen.getByText('Dessert · without Marco and Sam')).toBeInTheDocument()
  })

  it('says nothing extra when everybody eats the Course, and ignores an opt-out of a Member who is not offered', () => {
    setup({ optOutMemberIds: [99] })
    expect(screen.queryByText(/without/)).toBeNull()
    for (const b of within(group()).getAllByRole('button')) expect(b).toHaveAttribute('aria-pressed', 'true')
  })

  it('disabled: every pill is disabled and nothing is called', async () => {
    const { onChange } = setup({ disabled: true })
    for (const b of within(group()).getAllByRole('button')) expect(b).toBeDisabled()
    await userEvent.click(pill('Anna'))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('uses no native control', () => {
    setup()
    expect(document.querySelector('input, select, textarea')).toBeNull()
  })
})
