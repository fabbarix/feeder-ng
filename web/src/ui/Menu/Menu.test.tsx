// R2-1 (G-01): ui/Menu. A popover anchored to its IconButton from 768 px, a BottomSheet below; the keyboard rules of the avatar menu.
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { stubViewportWidth } from '../lib/viewport.test-helper'
import { Menu, type MenuEntry, type MenuProps } from './Menu'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const items = (over: { onArchive?: () => void; onDelete?: () => void } = {}): MenuEntry[] => [
  { id: 'archive', label: 'Archive', icon: 'archive', onSelect: over.onArchive },
  { id: 'delete', label: 'Delete', icon: 'delete', tone: 'danger', onSelect: over.onDelete },
]

const view = (props: Partial<MenuProps> = {}) =>
  render(
    <MemoryRouter>
      <button type="button">Outside</button>
      <Menu label="More actions" items={items()} {...props} />
    </MemoryRouter>,
  )
const trigger = () => screen.getByRole('button', { name: 'More actions' })
const open = async () => {
  await userEvent.click(trigger())
  return screen.getByRole('menu', { name: 'More actions' })
}

describe('Menu: trigger', () => {
  it('is an IconButton named by label, a menu popup, closed at first', () => {
    view()
    expect(trigger()).toHaveAttribute('aria-haspopup', 'menu')
    expect(trigger()).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('menu')).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
  })
  it('opens on click and reports aria-expanded', async () => {
    view()
    await open()
    expect(trigger()).toHaveAttribute('aria-expanded', 'true')
  })
  it('shows the "more" glyph by default and takes another icon', () => {
    const more = render(<Menu label="A" items={items()} />).container.querySelector('svg')!.innerHTML
    const other = render(<Menu label="B" icon="settings" items={items()} />).container.querySelector('svg')!.innerHTML
    expect(more).not.toBe('')
    expect(other).not.toBe(more)
  })
})

describe('Menu: popover from 768 px', () => {
  it('lists menuitems, with a glyph each, and no dialog', async () => {
    view()
    const menu = await open()
    const entries = within(menu).getAllByRole('menuitem')
    expect(entries.map((e) => e.textContent)).toEqual(['Archive', 'Delete'])
    for (const e of entries) expect(e.querySelector('svg')).not.toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
  })
  it('moves focus to the first item on open', async () => {
    view()
    await open()
    expect(screen.getByRole('menuitem', { name: 'Archive' })).toHaveFocus()
  })
  it('marks a danger item (data-tone="danger")', async () => {
    view()
    await open()
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toHaveAttribute('data-tone', 'danger')
    expect(screen.getByRole('menuitem', { name: 'Archive' })).not.toHaveAttribute('data-tone')
  })
  it('runs onSelect once, closes, and returns focus to the trigger', async () => {
    const onArchive = vi.fn()
    view({ items: items({ onArchive }) })
    await open()
    await userEvent.click(screen.getByRole('menuitem', { name: 'Archive' }))
    expect(onArchive).toHaveBeenCalledOnce()
    expect(screen.queryByRole('menu')).toBeNull()
    await waitFor(() => expect(trigger()).toHaveFocus())
  })
  it('renders a link item as a menuitem link with its href', async () => {
    view({ items: [{ id: 'import', label: 'Import', href: '/recipes/import' }] })
    await open()
    const link = screen.getByRole('menuitem', { name: 'Import' })
    expect(link.tagName).toBe('A')
    expect(link).toHaveAttribute('href', '/recipes/import')
  })
  it('renders a checkable item as a menuitemcheckbox with aria-checked, and selecting it reports', async () => {
    const onSelect = vi.fn()
    view({ items: [{ id: 'archived', label: 'Show archived', checked: true, onSelect }] })
    await open()
    const box = screen.getByRole('menuitemcheckbox', { name: 'Show archived' })
    expect(box).toHaveAttribute('aria-checked', 'true')
    await userEvent.click(box)
    expect(onSelect).toHaveBeenCalledOnce()
  })
  it('a disabled item is aria-disabled and does not run', async () => {
    const onSelect = vi.fn()
    view({ items: [{ id: 'a', label: 'Copy', disabled: true, onSelect }, { id: 'b', label: 'Other' }] })
    await open()
    const item = screen.getByRole('menuitem', { name: 'Copy' })
    expect(item).toHaveAttribute('aria-disabled', 'true')
    await userEvent.click(item)
    expect(onSelect).not.toHaveBeenCalled()
  })
  it('the checked tick is the last child of the item and carries the menu__check class', async () => {
    view({ items: [{ id: 'archived', label: 'Show archived', icon: 'archive', checked: true }, { id: 'x', label: 'Plain', checked: false }] })
    await open()
    const on = screen.getByRole('menuitemcheckbox', { name: 'Show archived' })
    const tick = on.querySelector('.menu__check')
    expect(tick).not.toBeNull()
    expect(tick?.tagName.toLowerCase()).toBe('svg')
    expect(on.lastElementChild).toBe(tick)
    expect(screen.getByRole('menuitemcheckbox', { name: 'Plain' }).querySelector('.menu__check')).toBeNull()
  })
  it('draws a separator entry as role=separator', async () => {
    view({ items: [{ id: 'a', label: 'One' }, { separator: true }, { id: 'b', label: 'Two' }] })
    await open()
    expect(screen.getByRole('separator')).toBeInTheDocument()
    expect(screen.getAllByRole('menuitem')).toHaveLength(2)
  })
})

describe('Menu: keyboard (the rules of the avatar menu)', () => {
  const abc = (): MenuEntry[] => [
    { id: 'a', label: 'Alpha' },
    { id: 'b', label: 'Bravo', disabled: true },
    { id: 'c', label: 'Charlie' },
  ]
  it('ArrowDown and ArrowUp move between items, wrap around and skip disabled ones', async () => {
    view({ items: abc() })
    await open()
    expect(screen.getByRole('menuitem', { name: 'Alpha' })).toHaveFocus()
    await userEvent.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: 'Charlie' })).toHaveFocus()
    await userEvent.keyboard('{ArrowDown}')
    expect(screen.getByRole('menuitem', { name: 'Alpha' })).toHaveFocus()
    await userEvent.keyboard('{ArrowUp}')
    expect(screen.getByRole('menuitem', { name: 'Charlie' })).toHaveFocus()
  })
  it('Home and End go to the first and the last item', async () => {
    view({ items: abc() })
    await open()
    await userEvent.keyboard('{End}')
    expect(screen.getByRole('menuitem', { name: 'Charlie' })).toHaveFocus()
    await userEvent.keyboard('{Home}')
    expect(screen.getByRole('menuitem', { name: 'Alpha' })).toHaveFocus()
  })
  it('Escape closes the menu and returns focus to the trigger', async () => {
    view()
    await open()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).toBeNull()
    expect(trigger()).toHaveFocus()
    expect(trigger()).toHaveAttribute('aria-expanded', 'false')
  })
  it('Tab closes the menu and returns focus to the trigger instead of falling to the page', async () => {
    view()
    await open()
    await userEvent.tab()
    expect(screen.queryByRole('menu')).toBeNull()
    expect(trigger()).toHaveFocus()
  })
  it('Enter on the focused item selects it', async () => {
    const onDelete = vi.fn()
    view({ items: items({ onDelete }) })
    await open()
    await userEvent.keyboard('{ArrowDown}{Enter}')
    expect(onDelete).toHaveBeenCalledOnce()
  })
})

describe('Menu: closing', () => {
  it('a click outside closes it', async () => {
    view()
    await open()
    await userEvent.click(screen.getByRole('button', { name: 'Outside' }))
    expect(screen.queryByRole('menu')).toBeNull()
  })
  it('a second click on the trigger closes it', async () => {
    view()
    await open()
    await userEvent.click(trigger())
    expect(screen.queryByRole('menu')).toBeNull()
  })
})

describe('Menu: placement of the popover (inside the viewport at 768 and 1024)', () => {
  const rect = (left: number, top: number, width: number, height: number) =>
    ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON() {} }) as DOMRect
  const place = (trigger: DOMRect, menu = { w: 240, h: 120 }, viewport = { w: 1024, h: 800 }) => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: viewport.w })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: viewport.h })
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.getAttribute('role') === 'menu') return rect(0, 0, menu.w, menu.h)
      if (this.getAttribute('aria-haspopup') === 'menu') return trigger
      return rect(0, 0, 0, 0)
    })
  }
  const px = (v: string) => Number.parseFloat(v)

  it('is position: fixed from the trigger rect and sits below it when it fits', async () => {
    place(rect(900, 100, 40, 40))
    view()
    const menu = await open()
    expect(menu).toHaveAttribute('data-placement', 'below')
    expect(menu.style.position).toBe('fixed')
    expect(px(menu.style.top)).toBeGreaterThanOrEqual(140)
    expect(px(menu.style.top) + 120).toBeLessThanOrEqual(800)
  })
  it('flips above the trigger when it does not fit below', async () => {
    place(rect(900, 700, 40, 40))
    view()
    const menu = await open()
    expect(menu).toHaveAttribute('data-placement', 'above')
    expect(px(menu.style.top) + 120).toBeLessThanOrEqual(700)
    expect(px(menu.style.top)).toBeGreaterThanOrEqual(8)
  })
  it('stays inside the viewport horizontally: near the right edge and near the left edge', async () => {
    place(rect(980, 100, 40, 40))
    const right = view()
    let menu = await open()
    expect(px(menu.style.left)).toBeGreaterThanOrEqual(8)
    expect(px(menu.style.left) + 240).toBeLessThanOrEqual(1024 - 8)
    right.unmount()
    place(rect(4, 100, 40, 40))
    view()
    menu = await open()
    expect(px(menu.style.left)).toBeGreaterThanOrEqual(8)
    expect(px(menu.style.left) + 240).toBeLessThanOrEqual(1024 - 8)
  })
})

describe('Menu: the popover follows its trigger', () => {
  const rect = (left: number, top: number, width: number, height: number) =>
    ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON() {} }) as DOMRect
  const setup = () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 })
    const t = { current: rect(900, 100, 40, 40) }
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.getAttribute('role') === 'menu') return rect(0, 0, 240, 120)
      if (this.getAttribute('aria-haspopup') === 'menu') return t.current
      return rect(0, 0, 0, 0)
    })
    return t
  }
  it('repositions when the page scrolls', async () => {
    const t = setup()
    view()
    const menu = await open()
    const before = Number.parseFloat(menu.style.top)
    t.current = rect(900, 40, 40, 40)
    window.dispatchEvent(new Event('scroll'))
    await waitFor(() => expect(Number.parseFloat(menu.style.top)).toBeLessThan(before))
    expect(Number.parseFloat(menu.style.top)).toBeGreaterThanOrEqual(80)
  })
  it('repositions when the window is resized', async () => {
    const t = setup()
    view()
    const menu = await open()
    const before = Number.parseFloat(menu.style.left)
    t.current = rect(500, 100, 40, 40)
    window.dispatchEvent(new Event('resize'))
    await waitFor(() => expect(Number.parseFloat(menu.style.left)).toBeLessThan(before))
  })
  it('stops listening once closed', async () => {
    setup()
    const remove = vi.spyOn(window, 'removeEventListener')
    view()
    await open()
    await userEvent.click(trigger())
    expect(remove.mock.calls.map((c) => c[0])).toEqual(expect.arrayContaining(['scroll', 'resize']))
  })
})

describe('Menu: a sheet below 768 px', () => {
  it('honours tone danger, disabled and separators', async () => {
    stubViewportWidth(390)
    const onSelect = vi.fn()
    view({
      items: [
        { id: 'a', label: 'Archive', onSelect },
        { separator: true },
        { id: 'd', label: 'Delete', tone: 'danger', onSelect },
        { id: 'c', label: 'Copy', disabled: true, onSelect },
      ],
    })
    await userEvent.click(trigger())
    const sheet = screen.getByRole('dialog')
    expect(within(sheet).getByRole('separator')).toBeInTheDocument()
    expect(within(sheet).getByRole('button', { name: 'Delete' }).closest('li')).toHaveAttribute('data-tone', 'danger')
    expect(within(sheet).queryByRole('button', { name: 'Copy' })).toBeNull()
    const copy = within(sheet).getByText('Copy').closest('li')!
    expect(copy).toHaveAttribute('data-disabled', 'true')
    await userEvent.click(within(sheet).getByText('Copy'))
    expect(onSelect).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
  it('a disabled checkable entry is a disabled Switch', async () => {
    stubViewportWidth(390)
    view({ items: [{ id: 's', label: 'Show archived', checked: false, disabled: true }] })
    await userEvent.click(trigger())
    expect(screen.getByRole('switch', { name: 'Show archived' })).toBeDisabled()
  })
  it('opens a BottomSheet titled by `title` (default label), not a popover', async () => {
    stubViewportWidth(390)
    view({ title: 'More' })
    await userEvent.click(trigger())
    expect(screen.getByRole('dialog', { name: 'More' })).toBeInTheDocument()
    expect(screen.queryByRole('menu')).toBeNull()
  })
  it('falls back to the label as the sheet title', async () => {
    stubViewportWidth(390)
    view()
    await userEvent.click(trigger())
    expect(screen.getByRole('dialog', { name: 'More actions' })).toBeInTheDocument()
  })
  it('lists the same entries as rows; choosing one runs onSelect and closes the sheet', async () => {
    stubViewportWidth(390)
    const onDelete = vi.fn()
    view({ items: items({ onDelete }) })
    await userEvent.click(trigger())
    const sheet = screen.getByRole('dialog')
    expect(within(sheet).getByRole('button', { name: 'Archive' })).toBeInTheDocument()
    await userEvent.click(within(sheet).getByRole('button', { name: 'Delete' }))
    expect(onDelete).toHaveBeenCalledOnce()
    expect(screen.queryByRole('dialog')).toBeNull()
  })
  it('a link item is a link row; a checkable item is a row with a Switch showing its state', async () => {
    stubViewportWidth(390)
    view({ items: [{ id: 'i', label: 'Import', href: '/recipes/import' }, { id: 's', label: 'Show archived', checked: true }] })
    await userEvent.click(trigger())
    expect(screen.getByRole('link', { name: /Import/ })).toHaveAttribute('href', '/recipes/import')
    expect(screen.getByRole('switch', { name: 'Show archived' })).toBeChecked()
  })
  it('switches presentation with the viewport: 768 is a popover, 767 a sheet', async () => {
    stubViewportWidth(768)
    const wide = view()
    await userEvent.click(trigger())
    expect(screen.getByRole('menu')).toBeInTheDocument()
    wide.unmount()
    stubViewportWidth(767)
    view()
    await userEvent.click(trigger())
    expect(screen.queryByRole('menu')).toBeNull()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})
