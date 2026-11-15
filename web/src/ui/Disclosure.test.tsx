// RX-02 (B9-16): `ui/Disclosure`, a section Tile whose heading is the toggle. A closed one says what it holds in its summary line. It
// opens itself when a field inside has an error (the `invalid` prop, the DISCLOSURE_OPEN_EVENT that focusFirstInvalid sends, or the
// imperative `open()`), when the hash names it, or when the person left it open before on this device (`persistKey`, try/catch guarded).
// Only WHICH sections are open is remembered, never the field values.
import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Disclosure, DISCLOSURE_OPEN_EVENT, type DisclosureHandle } from './Disclosure'
import { declarations, readUiCss } from './test-utils'

const KEY = 'feeder.recipeEditor.open'
const toggle = (name: RegExp | string = /Planning/) => screen.getByRole('button', { name })

beforeEach(() => {
  window.localStorage.clear()
  window.location.hash = ''
})
afterEach(() => vi.restoreAllMocks())

describe('Disclosure markup', () => {
  it('is a surface Tile section named by its heading, whose button is the toggle', () => {
    const { container } = render(
      <Disclosure id="planning" title="Planning" summary="Main · quick, family">
        <p>Body</p>
      </Disclosure>,
    )
    const section = container.querySelector('section')!
    expect(section).toHaveClass('tile', 'disclosure')
    expect(section).toHaveAttribute('data-variant', 'surface')
    expect(section).toHaveAttribute('data-disclosure')
    expect(section).toHaveAttribute('id', 'planning')
    const heading = screen.getByRole('heading', { level: 2 })
    expect(section).toHaveAttribute('aria-labelledby', heading.id)
    expect(heading.querySelector('button')).toBe(toggle())
  })

  it('the heading level is a prop (default 2)', () => {
    render(
      <Disclosure id="x" title="Planning" level={3}>
        <p>Body</p>
      </Disclosure>,
    )
    expect(screen.getByRole('heading', { level: 3 })).toBeInTheDocument()
  })

  it('the button holds the title, the one-line summary and a caret that is hidden from assistive technology', () => {
    render(
      <Disclosure id="planning" title="Planning" summary="Main · quick, family">
        <p>Body</p>
      </Disclosure>,
    )
    const button = toggle()
    expect(button.querySelector('.disclosure__title')).toHaveTextContent('Planning')
    expect(button.querySelector('.disclosure__summary')).toHaveTextContent('Main · quick, family')
    const caret = button.querySelector('.disclosure__caret')!
    expect(caret.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    expect(button).toHaveAccessibleName(/^Planning\s*Main · quick, family$/)
  })

  it('has no summary line without a summary', () => {
    const { container } = render(
      <Disclosure id="x" title="Planning">
        <p>Body</p>
      </Disclosure>,
    )
    expect(container.querySelector('.disclosure__summary')).toBeNull()
  })

  it('is closed at first: aria-expanded false, aria-controls points at a hidden body that still holds its fields', () => {
    render(
      <Disclosure id="planning" title="Planning">
        <label>
          Cool-down <input defaultValue="5" />
        </label>
      </Disclosure>,
    )
    const button = toggle()
    expect(button).toHaveAttribute('aria-expanded', 'false')
    const body = document.getElementById(button.getAttribute('aria-controls')!)!
    expect(body).toHaveClass('disclosure__body')
    expect(body).toHaveAttribute('hidden')
    // the fields stay mounted, so a draft survives the toggle and focusFirstInvalid can find an invalid one
    expect(body.querySelector('input')).not.toBeNull()
  })

  it('defaultOpen starts it open', () => {
    render(
      <Disclosure id="planning" title="Planning" defaultOpen>
        <p>Body</p>
      </Disclosure>,
    )
    expect(toggle()).toHaveAttribute('aria-expanded', 'true')
    expect(document.getElementById(toggle().getAttribute('aria-controls')!)).not.toHaveAttribute('hidden')
  })
})

describe('Disclosure toggling', () => {
  it('a click opens and closes it, and reports the change', async () => {
    const onOpenChange = vi.fn()
    render(
      <Disclosure id="planning" title="Planning" onOpenChange={onOpenChange}>
        <p>Body</p>
      </Disclosure>,
    )
    await userEvent.click(toggle())
    expect(toggle()).toHaveAttribute('aria-expanded', 'true')
    expect(onOpenChange).toHaveBeenLastCalledWith(true)
    await userEvent.click(toggle())
    expect(toggle()).toHaveAttribute('aria-expanded', 'false')
    expect(onOpenChange).toHaveBeenLastCalledWith(false)
  })

  it('Enter and Space toggle it (a real button)', async () => {
    render(
      <Disclosure id="planning" title="Planning">
        <p>Body</p>
      </Disclosure>,
    )
    toggle().focus()
    await userEvent.keyboard('{Enter}')
    expect(toggle()).toHaveAttribute('aria-expanded', 'true')
    await userEvent.keyboard(' ')
    expect(toggle()).toHaveAttribute('aria-expanded', 'false')
  })

  it('the imperative open() opens it', () => {
    const ref = createRef<DisclosureHandle>()
    render(
      <Disclosure id="planning" title="Planning" ref={ref}>
        <p>Body</p>
      </Disclosure>,
    )
    act(() => ref.current!.open())
    expect(toggle()).toHaveAttribute('aria-expanded', 'true')
    act(() => ref.current!.open())
    expect(toggle()).toHaveAttribute('aria-expanded', 'true') // open() never closes
  })
})

describe('Disclosure opens itself', () => {
  it('when `invalid` becomes true (a field inside has an error), and does not close when it goes back to false', () => {
    const { rerender } = render(
      <Disclosure id="planning" title="Planning" invalid={false}>
        <p>Body</p>
      </Disclosure>,
    )
    expect(toggle()).toHaveAttribute('aria-expanded', 'false')
    rerender(
      <Disclosure id="planning" title="Planning" invalid>
        <p>Body</p>
      </Disclosure>,
    )
    expect(toggle()).toHaveAttribute('aria-expanded', 'true')
    rerender(
      <Disclosure id="planning" title="Planning" invalid={false}>
        <p>Body</p>
      </Disclosure>,
    )
    expect(toggle()).toHaveAttribute('aria-expanded', 'true')
  })

  it('when the DISCLOSURE_OPEN_EVENT arrives on its section, synchronously (focusFirstInvalid focuses right after)', () => {
    const { container } = render(
      <Disclosure id="planning" title="Planning">
        <input aria-label="Cool-down" />
      </Disclosure>,
    )
    expect(DISCLOSURE_OPEN_EVENT).toBe('feeder:disclosure-open')
    act(() => {
      container.querySelector('[data-disclosure]')!.dispatchEvent(new CustomEvent(DISCLOSURE_OPEN_EVENT))
    })
    expect(toggle()).toHaveAttribute('aria-expanded', 'true')
  })

  it('when the hash names it, at mount and on a later hashchange', () => {
    window.location.hash = '#planning'
    const { unmount } = render(
      <>
        <Disclosure id="planning" title="Planning">
          <p>Body</p>
        </Disclosure>
        <Disclosure id="about" title="About">
          <p>Body</p>
        </Disclosure>
      </>,
    )
    expect(toggle()).toHaveAttribute('aria-expanded', 'true')
    expect(toggle(/About/)).toHaveAttribute('aria-expanded', 'false')
    act(() => {
      window.location.hash = '#about'
      fireEvent(window, new HashChangeEvent('hashchange'))
    })
    expect(toggle(/About/)).toHaveAttribute('aria-expanded', 'true')
    unmount()
  })
})

describe('Disclosure remembers which sections are open on this device (persistKey)', () => {
  it('writes the ids of the open sections when the person toggles one', async () => {
    render(
      <>
        <Disclosure id="about" title="About" persistKey={KEY}>
          <p>Body</p>
        </Disclosure>
        <Disclosure id="planning" title="Planning" persistKey={KEY}>
          <p>Body</p>
        </Disclosure>
      </>,
    )
    await userEvent.click(toggle(/About/))
    await userEvent.click(toggle(/Planning/))
    expect(JSON.parse(window.localStorage.getItem(KEY)!).sort()).toEqual(['about', 'planning'])
    await userEvent.click(toggle(/About/))
    expect(JSON.parse(window.localStorage.getItem(KEY)!)).toEqual(['planning'])
  })

  it('opens the sections it finds in storage', () => {
    window.localStorage.setItem(KEY, JSON.stringify(['planning']))
    render(
      <>
        <Disclosure id="about" title="About" persistKey={KEY}>
          <p>Body</p>
        </Disclosure>
        <Disclosure id="planning" title="Planning" persistKey={KEY}>
          <p>Body</p>
        </Disclosure>
      </>,
    )
    expect(toggle(/Planning/)).toHaveAttribute('aria-expanded', 'true')
    expect(toggle(/About/)).toHaveAttribute('aria-expanded', 'false')
  })

  it('an error opens it for now but is not remembered', () => {
    const { rerender } = render(
      <Disclosure id="planning" title="Planning" persistKey={KEY}>
        <p>Body</p>
      </Disclosure>,
    )
    rerender(
      <Disclosure id="planning" title="Planning" persistKey={KEY} invalid>
        <p>Body</p>
      </Disclosure>,
    )
    expect(toggle()).toHaveAttribute('aria-expanded', 'true')
    expect(window.localStorage.getItem(KEY)).toBeNull()
  })

  it('survives a localStorage that throws on read and on write', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    render(
      <Disclosure id="planning" title="Planning" persistKey={KEY}>
        <p>Body</p>
      </Disclosure>,
    )
    expect(toggle()).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(toggle())
    expect(toggle()).toHaveAttribute('aria-expanded', 'true')
  })

  it('ignores a stored value that is not a list of ids', () => {
    window.localStorage.setItem(KEY, '{"planning":true}')
    render(
      <Disclosure id="planning" title="Planning" persistKey={KEY}>
        <p>Body</p>
      </Disclosure>,
    )
    expect(toggle()).toHaveAttribute('aria-expanded', 'false')
  })

  it('without persistKey nothing is stored', async () => {
    render(
      <Disclosure id="planning" title="Planning">
        <p>Body</p>
      </Disclosure>,
    )
    await userEvent.click(toggle())
    expect(window.localStorage.length).toBe(0)
  })
})

describe('Disclosure.css', () => {
  const css = readUiCss('Disclosure.css')
  const norm = (s: string) => s.replace(/\s+/g, ' ')

  it('the heading is the toggle: a full-width 44 px button with no chrome of its own', () => {
    const d = declarations(css, '.disclosure__button')
    expect(d['inline-size']).toBe('100%')
    expect(d['min-block-size']).toBe('44px')
    expect(d['border']).toBe('0')
    expect(d['display']).toBe('flex')
    expect(d['justify-content']).toBe('space-between')
  })

  it('the title is title-3 and the summary is one meta line with an ellipsis', () => {
    expect(declarations(css, '.disclosure__title')['font-size']).toBe('var(--text-title-3-size)')
    const s = declarations(css, '.disclosure__summary')
    expect(s['font-size']).toBe('var(--text-meta-size)')
    expect(s['color']).toBe('var(--color-muted)')
    expect(s['white-space']).toBe('nowrap')
    expect(s['text-overflow']).toBe('ellipsis')
    expect(s['overflow']).toBe('hidden')
  })

  it('the caret is a 40 px circular outline on the surface fill (R-B)', () => {
    const d = declarations(css, '.disclosure__caret')
    expect(d['inline-size']).toBe('40px')
    expect(d['block-size']).toBe('40px')
    expect(d['border-radius']).toMatch(/50%|999|var\(--radius-pill\)/)
    expect(d['background']).toBe('var(--color-surface)')
    expect(d['box-shadow']).toBe('inset 0 0 0 1px var(--color-outline)')
    expect(d['flex']).toBe('none')
  })

  it('the caret turns when open, and not under reduced motion', () => {
    expect(norm(css)).toMatch(/\.disclosure__button\[aria-expanded='true'\] \.disclosure__caret > svg\s*\{[^}]*transform:\s*rotate\(180deg\)/)
    expect(norm(css)).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{[^@]*\.disclosure__caret[^{]*\{[^}]*(transform:\s*none|transition:\s*none)/)
  })

  it('the hidden body is not displayed even though it is a grid', () => {
    expect(declarations(css, '.disclosure__body[hidden]')['display']).toBe('none')
    expect(declarations(css, '.disclosure__body')['display']).toBe('grid')
  })

  it('the heading ring is the outer ring, kept inside the tile padding (the tile pads 16 px, so the button is not a nested scope)', () => {
    expect(norm(css)).not.toMatch(/disclosure__button:focus-visible\s*\{[^}]*outline:\s*none/)
  })
})
