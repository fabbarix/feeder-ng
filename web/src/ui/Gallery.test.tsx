import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Gallery } from './Gallery'

const SECTIONS = [
  'Button',
  'IconButton',
  'Chip',
  'WhyChip',
  'Tile',
  'BentoGrid',
  'PageHeader',
  'ListRow',
  'ListPage',
  'RecipeThumb',
  'ProgressTile',
  'TimerTile',
  'EmptyState',
  'WeekdayPicker',
  'MemberPill',
] as const

describe('Gallery (dev catalogue)', () => {
  it('renders without console errors or the single-primary warning', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    render(<Gallery />)
    expect(err).not.toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalled()
    err.mockRestore()
    warn.mockRestore()
  })

  it.each(['light', 'dark'] as const)('has a %s section with one heading per primitive', (scheme) => {
    const { container } = render(<Gallery />)
    const section = container.querySelector<HTMLElement>(`[data-scheme="${scheme}"]`)!
    expect(section).not.toBeNull()
    for (const name of SECTIONS) {
      expect(within(section).getByRole('heading', { level: 3, name })).toBeInTheDocument()
    }
  })

  it('shows every Button variant and size in each scheme', () => {
    const { container } = render(<Gallery />)
    for (const scheme of ['light', 'dark']) {
      const section = container.querySelector<HTMLElement>(`[data-scheme="${scheme}"]`)!
      for (const v of ['primary', 'secondary', 'accent-secondary', 'tertiary', 'danger', 'danger-tertiary']) {
        expect(section.querySelector(`button[data-variant="${v}"]`), `${scheme} ${v}`).not.toBeNull()
      }
      for (const size of ['sm', 'md', 'lg', 'xl']) expect(section.querySelector(`button[data-size="${size}"]`)).not.toBeNull()
      expect(section.querySelector('button[disabled]')).not.toBeNull()
      expect(section.querySelector('button[aria-busy="true"]')).not.toBeNull()
    }
  })

  it('shows every Chip kind, every status and both filter states', () => {
    const { container } = render(<Gallery />)
    const section = container.querySelector<HTMLElement>('[data-scheme="light"]')!
    for (const k of ['why', 'state', 'status', 'tag', 'filter', 'count']) expect(section.querySelector(`.chip[data-kind="${k}"]`), k).not.toBeNull()
    for (const s of ['leftover', 'spoil', 'danger', 'success', 'pinned']) expect(section.querySelector(`.chip[data-status="${s}"]`), s).not.toBeNull()
    expect(section.querySelector('.chip[aria-pressed="true"]')).not.toBeNull()
    expect(section.querySelector('.chip[aria-pressed="false"]')).not.toBeNull()
  })

  it('shows every Tile variant, status and a stretched tile', () => {
    const { container } = render(<Gallery />)
    const section = container.querySelector<HTMLElement>('[data-scheme="light"]')!
    for (const v of ['surface', 'hero', 'soft', 'status', 'media', 'action']) expect(section.querySelector(`.tile[data-variant="${v}"]`), v).not.toBeNull()
    for (const s of ['leftover', 'spoil', 'danger', 'success', 'pinned']) expect(section.querySelector(`.tile[data-status="${s}"]`), s).not.toBeNull()
    expect(section.querySelector('.tile__stretch')).not.toBeNull()
  })

  it('WeekdayPicker shows a selection and an error; MemberPill shows initials, an emoji and a long name', () => {
    const { container } = render(<Gallery />)
    const section = container.querySelector<HTMLElement>('[data-scheme="light"]')!
    expect(within(section).getAllByRole('group', { name: 'Apply to' })[0]!.querySelector('[aria-pressed="true"]')).not.toBeNull()
    expect(section.querySelector('.weekday-picker [role="alert"]')).not.toBeNull()
    expect(section.querySelectorAll('.member-pill').length).toBeGreaterThanOrEqual(3)
    expect(within(section).getByText('Lucia')).toBeInTheDocument()
  })

  it('shows every timer state', () => {
    const { container } = render(<Gallery />)
    const section = container.querySelector<HTMLElement>('[data-scheme="dark"]')!
    for (const s of ['running', 'paused', 'finished', 'overdue']) expect(section.querySelector(`[role="timer"][data-state="${s}"]`), s).not.toBeNull()
  })

  it('is only wired into the app in dev builds', async () => {
    const nodeFs = 'node:fs'
    const { readFileSync } = (await import(/* @vite-ignore */ nodeFs)) as { readFileSync: (p: string, e: string) => string }
    const cwd = (globalThis as unknown as { process: { cwd: () => string } }).process.cwd()
    const main = readFileSync(`${cwd}/src/main.tsx`, 'utf8')
    expect(main).toMatch(/import\.meta\.env\.DEV/)
    expect(main).toMatch(/Gallery/)
    expect(screen).toBeDefined()
  })

  it('the Switch example no longer mentions the removed secondary colour feature', () => {
    render(<Gallery />)
    expect(screen.queryByText(/secondary colour/i)).toBeNull()
    expect(screen.getAllByRole('switch', { name: 'Notify me' }).length).toBeGreaterThan(0)
  })
})
