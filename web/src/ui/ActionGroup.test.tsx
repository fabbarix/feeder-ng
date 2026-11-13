// DS-A (docs/design/system.md §5): ActionGroup. At most one primary and one secondary; everything else in a ⋮ Menu named
// "More for <label>". Wide host (>= 35rem): at the row's end, natural widths, one fixed inline size so the groups of a list line
// up in one column. Narrow host: its own line, equal tracks (1fr 1fr 44px). It never flex-wraps.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ActionGroup } from './index'
import { declarations, readStylesCss, readUiCss } from './test-utils'

const css = readUiCss('ActionGroup.css')
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '')

describe('ActionGroup: render', () => {
  it('is a labelled group with one primary and one secondary Button, in that order', async () => {
    const onCooked = vi.fn()
    const onAdjust = vi.fn()
    render(<ActionGroup label="Thu Dinner" primary={{ label: 'All Cooked', icon: 'tick', onClick: onCooked }} secondary={{ label: 'Adjust', onClick: onAdjust }} />)
    const group = screen.getByRole('group', { name: 'Thu Dinner' })
    const buttons = within(group).getAllByRole('button')
    expect(buttons.map((b) => b.textContent)).toEqual(['All Cooked', 'Adjust'])
    expect(buttons[0]).toHaveAttribute('data-variant', 'primary')
    expect(buttons[1]).toHaveAttribute('data-variant', 'secondary')
    await userEvent.click(buttons[0]!)
    await userEvent.click(buttons[1]!)
    expect(onCooked).toHaveBeenCalledOnce()
    expect(onAdjust).toHaveBeenCalledOnce()
  })

  it('takes no list of buttons: a third action is a type error, it belongs in `more`', () => {
    // @ts-expect-error ActionGroup has no `actions` / children: one primary, one secondary, the rest in `more`
    const el = <ActionGroup label="x" actions={[]} />
    expect(el).toBeTruthy()
  })

  it('puts the rest in a ⋮ Menu named "More for <label>", after the buttons', async () => {
    const onNotCooked = vi.fn()
    render(
      <ActionGroup
        label="Wed Dinner"
        primary={{ label: 'Cooked', onClick: () => {} }}
        secondary={{ label: 'Adjust', onClick: () => {} }}
        more={[{ id: 'not-cooked', label: 'Not cooked', onSelect: onNotCooked }]}
      />,
    )
    const group = screen.getByRole('group', { name: 'Wed Dinner' })
    const buttons = within(group).getAllByRole('button')
    expect(buttons).toHaveLength(3)
    expect(buttons[2]).toHaveAccessibleName('More for Wed Dinner')
    expect(group).toHaveAttribute('data-more', 'true')
    await userEvent.click(buttons[2]!)
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Not cooked' }))
    expect(onNotCooked).toHaveBeenCalledOnce()
  })

  it('without `more` there is no ⋮; a secondary alone is allowed (no primary in this group)', () => {
    render(<ActionGroup label="Fri Lunch" secondary={{ label: 'Adjust', onClick: () => {} }} />)
    const group = screen.getByRole('group', { name: 'Fri Lunch' })
    expect(within(group).getAllByRole('button')).toHaveLength(1)
    expect(group).not.toHaveAttribute('data-more')
    expect(group.querySelector('[data-variant="primary"]')).toBeNull()
  })

  it('a disabled primary stays in place, disabled', () => {
    render(<ActionGroup label="x" primary={{ label: 'Confirm', disabled: true, onClick: () => {} }} />)
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled()
  })

  it('is exported from the barrel with its props type', async () => {
    const mod = await import('./index')
    expect(mod.ActionGroup).toBeTypeOf('function')
    const props: import('./index').ActionGroupProps = { label: 'x' }
    expect(props.label).toBe('x')
  })
})

describe('ActionGroup: the group is the root; the container is the caller\'s row or tile (round 2)', () => {
  // A host of its own inside a flex row has no intrinsic width under container-type: inline-size, so it collapsed to 0 px and
  // was always "narrow" (review repro dsa-review/t.html). The container is now a caller-provided ancestor with a definite width.
  it('renders no wrapper: the labelled group is the root element', () => {
    const { container } = render(<ActionGroup label="Thu Dinner" primary={{ label: 'Cooked', onClick: () => {} }} />)
    const root = container.firstElementChild!
    expect(root).toHaveClass('action-group')
    expect(root).toHaveAttribute('role', 'group')
    expect(container.querySelector('.action-group-host')).toBeNull()
  })
})

describe('ActionGroup: layout (container query on the caller\'s .action-group-host or .list-row)', () => {
  it('.action-group-host (put on the row or tile) and .list-row are inline-size containers', () => {
    expect(declarations(css, '.action-group-host')['container-type']).toBe('inline-size')
    expect(declarations(readUiCss('ListRow.css'), '.list-row')['container-type']).toBe('inline-size')
  })

  it('wide (default): a flex row at the end that never shrinks or wraps; a minimum inline size, not a fixed one', () => {
    const d = declarations(css, '.action-group')
    expect(d['display']).toBe('flex')
    expect(d['justify-content']).toBe('flex-end')
    expect(d['flex-wrap'] ?? 'nowrap').toBe('nowrap')
    expect(d['flex']).toBe('none')
    expect(d['min-inline-size']).toBe('var(--action-group-min-inline-size)')
    expect(d['inline-size']).toBeUndefined() // a fixed 15rem overflowed with "All Cooked" + "Adjust" + ⋮
  })

  it('narrow host (< 35rem): its own line as equal tracks 1fr 1fr 44px', () => {
    const narrow = code(css).match(/@container\s*\(max-width:\s*35rem\)\s*\{([\s\S]*?)\n\}/)?.[1] ?? ''
    expect(narrow).toMatch(/\.action-group\s*\{[^}]*display:\s*grid/)
    expect(narrow).toMatch(/\.action-group\s*\{[^}]*grid-template-columns:\s*1fr 1fr 44px/)
    expect(narrow).toMatch(/\.action-group\s*\{[^}]*min-inline-size:\s*0/)
  })

  it('never flex-wraps anywhere', () => {
    expect(code(css)).not.toMatch(/flex-wrap:\s*wrap/)
  })

  it("the group's buttons keep one line", () => {
    expect(declarations(css, '.action-group .button')['white-space']).toBe('nowrap')
  })

  it('styles.css sizes the minimum for the widest real group ("All Cooked" with its icon + "Adjust" + ⋮): 18rem', () => {
    expect(readStylesCss()).toMatch(/--action-group-min-inline-size:\s*18rem/)
    expect(readStylesCss()).not.toMatch(/--action-group-inline-size\s*:/)
  })
  // The real layout (a flex row: not 0 px wide, no overflow, groups aligned) is checked in headless Chrome by
  // scripts/test/ds-layout_test.sh: jsdom has no layout.
})
