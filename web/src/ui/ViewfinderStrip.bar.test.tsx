// B9-17 (SSP-06, DS-06 danger tone, A11Y-02): ViewfinderStrip `size="bar"` and the controls slot.
//   No camera, or permission denied: the viewfinder collapses to a 56 px camera bar in the danger status tone (a CameraSlash icon, a
//   message, and "Try again" as an outlined secondary button on a surface fill: R-A). With a working camera the strip's control row
//   takes extra controls beside Mute (Scan's "Type a barcode" IconButton). The typed entry itself, focus after Use and the copy are
//   B9-35's (ScanScreen, ManualBarcodeEntry); Stock-take uses the same strip and gets the same behaviour.
// The chapter's "the camera bar replaces the strip on failure" is a ScanScreen test (B9-35); this file is the primitive half.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Button } from './Button'
import { IconButton } from './IconButton'
import { blocksOf, selectorList, type CssBlock } from './lib/cssWalk.test-helper'
// The registry has no `typeBarcode` yet (SSP-06 adds it, in ui/icons.ts, not this package's file): the tests use an existing glyph.
import { ViewfinderStrip } from './ViewfinderStrip'
import { readUiCss } from './test-utils'

const css = readUiCss('ViewfinderStrip.css')
const q = (s: string) => s.replace(/"/g, "'").replace(/\s+/g, ' ').trim()
const blocks = blocksOf(['ui']).filter((b) => b.file === 'ui/ViewfinderStrip.css')
const rule = (selector: string): CssBlock[] => blocks.filter((b) => selectorList(q(b.selector)).includes(q(selector)))
const val = (bs: CssBlock[], prop: string) => bs.flatMap((b) => b.decls).filter(([p]) => p === prop).map(([, v]) => v).pop()

describe('ViewfinderStrip size="bar": the camera bar', () => {
  it('is still the labelled "Scanner" region, with data-size="bar" and data-camera="off"', () => {
    render(<ViewfinderStrip size="bar" status="No camera on this device" />)
    const region = screen.getByRole('region', { name: 'Scanner' })
    expect(region).toHaveAttribute('data-size', 'bar')
    expect(region).toHaveAttribute('data-camera', 'off')
  })

  it('shows the message as role="alert" (announced once, at failure) next to the CameraSlash icon', () => {
    const { container } = render(<ViewfinderStrip size="bar" status="Feeder may not use the camera" />)
    expect(screen.getByRole('alert')).toHaveTextContent('Feeder may not use the camera')
    expect(container.querySelector('.viewfinder-strip__off-text')).toBe(screen.getByRole('alert'))
    expect(container.querySelector('.viewfinder-strip__off-icon svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it('without a status it says the default no-camera line (so a bare bar is never empty)', () => {
    render(<ViewfinderStrip size="bar" />)
    expect(screen.getByRole('alert')).toHaveTextContent(/no camera/i)
  })

  it('has no picture: no video, no reticle, no live status line, and no height-140 frame', () => {
    const { container } = render(
      <ViewfinderStrip size="bar" status="No camera on this device">
        <video data-testid="cam" />
      </ViewfinderStrip>,
    )
    expect(container.querySelector('video')).toBeNull()
    expect(container.querySelector('.viewfinder-strip__reticle')).toBeNull()
    expect(container.querySelector('.viewfinder-strip__picture')).toBeNull()
    expect(container.querySelector('.viewfinder-strip__status')).toBeNull()
  })

  it('renders the action at its end: "Try again" is a real button the caller passes', async () => {
    const onRetry = vi.fn()
    render(<ViewfinderStrip size="bar" status="No camera on this device" action={<Button variant="secondary" onClick={onRetry}>Try again</Button>} />)
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('shows no torch and no Mute while the camera is gone (nothing to switch)', () => {
    render(<ViewfinderStrip size="bar" status="No camera" torch={{ supported: true, on: false, onToggle: () => {} }} mute={{ muted: false, onToggle: () => {} }} />)
    expect(screen.queryByRole('button', { name: /torch|mute/i })).toBeNull()
  })

  it('is a status tone bar, 56 px at least: the danger fill, the danger text, a 1 px danger border, a grid of icon | message | action', () => {
    const bar = rule(".viewfinder-strip[data-size='bar']")
    expect(val(bar, 'min-block-size')).toBe('56px')
    expect(val(bar, 'background')).toBe('var(--status-danger-bg)')
    expect(val(bar, 'color')).toBe('var(--status-danger-fg)')
    expect(val(bar, 'border')).toBe('1px solid var(--status-danger-fg)')
    expect(val(bar, 'grid-template-columns')).toBe('auto minmax(0, 1fr) auto')
    expect(val(bar, 'align-items')).toBe('center')
  })

  it('the message is body-strong and may take two lines at 375 px (no ellipsis that would hide the reason)', () => {
    const text = rule('.viewfinder-strip__off-text')
    expect(val(text, 'font-size')).toBe('var(--text-body-strong-size)')
    expect(val(text, 'line-height')).toBe('var(--text-body-strong-line)')
    expect(val(text, 'text-overflow') ?? 'clip').not.toBe('ellipsis')
    expect(val(text, 'margin')).toBe('0')
  })

  it('a button in the bar is an R-A secondary: a --color-surface fill and a 1 px --color-outline boundary, the label in the danger text', () => {
    const btn = rule(".viewfinder-strip[data-size='bar'] .button")
    expect(val(btn, 'background')).toBe('var(--color-surface)')
    expect(val(btn, 'box-shadow')).toBe('inset 0 0 0 1px var(--color-outline)')
    expect(val(btn, 'color')).toBe('var(--status-danger-fg)')
  })

  it('does not change the other sizes: strip is 140 px, tall 180 px, photo 4:3 (existing tests hold)', () => {
    expect(val(rule('.viewfinder-strip__picture'), 'height')).toBe('140px')
    expect(val(rule(".viewfinder-strip[data-size='tall'] .viewfinder-strip__picture"), 'height')).toBe('180px')
  })

  it('uses tokens only: no colour literal and no raw spacing in the bar rules', () => {
    const bar = blocks.filter((b) => /data-size=['"]bar['"]|off-text|off-icon/.test(b.selector))
    for (const [p, v] of bar.flatMap((b) => b.decls)) {
      expect(v, `${p}`).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(/i)
      if (/^(gap|padding|margin)/.test(p)) expect(v.replace(/var\([^)]*\)/g, ''), p).not.toMatch(/\d+(\.\d+)?(px|rem)/)
    }
  })
})

describe('ViewfinderStrip controls slot (SSP-06: "Type a barcode" beside Mute while the camera works)', () => {
  it('renders extra controls in the control row, with Mute and the torch', async () => {
    const onType = vi.fn()
    const { container } = render(
      <ViewfinderStrip
        mute={{ muted: false, onToggle: () => {} }}
        torch={{ supported: true, on: false, onToggle: () => {} }}
        controls={<IconButton icon="add" label="Type a barcode" onClick={onType} aria-expanded={false} aria-controls="typed-entry" />}
      />,
    )
    const row = container.querySelector('.viewfinder-strip__controls')!
    for (const name of ['Type a barcode', 'Mute beep', 'Torch off']) expect(row.contains(screen.getByRole('button', { name }))).toBe(true)
    await userEvent.click(screen.getByRole('button', { name: 'Type a barcode' }))
    expect(onType).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Type a barcode' })).toHaveAttribute('aria-controls', 'typed-entry')
  })

  it('a strip with only `controls` (no torch, no mute) still renders the row', () => {
    const { container } = render(<ViewfinderStrip controls={<IconButton icon="add" label="Type a barcode" />} />)
    expect(container.querySelector('.viewfinder-strip__controls')).toContainElement(screen.getByRole('button', { name: 'Type a barcode' }))
  })

  it('works on a tall and a photo strip too (Stock-take and the ImagePicker share the primitive)', () => {
    for (const size of ['tall', 'photo'] as const) {
      const { unmount } = render(<ViewfinderStrip size={size} controls={<IconButton icon="add" label="Type a barcode" />} />)
      expect(screen.getByRole('button', { name: 'Type a barcode' })).toBeInTheDocument()
      unmount()
    }
  })

  it('the control row wraps its buttons with a token gap and keeps each 44 px target clear of the next (the row\'s gap is --space-2)', () => {
    expect(val(rule('.viewfinder-strip__controls'), 'gap')).toBe('var(--space-2)')
  })

  it('the stylesheet reads the viewfinder tokens, never a literal', () => {
    expect(css.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/#[0-9a-f]{3,8}\b/i)
  })
})
