// CSS contracts of the WP4 primitives (read as text; jsdom has no layout). Component CSS lives next to the component.
import { describe, expect, it } from 'vitest'
import bottomSheet from './BottomSheet.css?raw'
import dialog from './Dialog.css?raw'
import skeleton from './Skeleton.css?raw'
import toast from './Toast.css?raw'

describe('Dialog.css', () => {
  it('paints the scrim on ::backdrop and uses motion/radius tokens', () => {
    expect(dialog).toMatch(/::backdrop\s*{[^}]*var\(--scrim\)/)
    expect(dialog).toMatch(/var\(--dur-3\)/)
    expect(dialog).toMatch(/min\(\s*400px\s*,\s*100vw\s*-\s*32px\s*\)/)
  })
  it('reduces motion to an opacity fade', () => {
    expect(dialog).toMatch(/prefers-reduced-motion:\s*reduce/)
  })
})

describe('BottomSheet.css', () => {
  it('caps the height at 85dvh, scrolls the body, and becomes a centred dialog from 768px', () => {
    expect(bottomSheet).toMatch(/max-height:\s*85dvh/)
    expect(bottomSheet).toMatch(/overflow-y:\s*auto/)
    expect(bottomSheet).toMatch(/@media\s*\(min-width:\s*768px\)/)
    expect(bottomSheet).toMatch(/::backdrop/)
  })
  it('never draws a focus ring on the container', () => {
    expect(bottomSheet).not.toMatch(/\.sheet:focus(-visible)?\s*{[^}]*outline:\s*(?!none|0)/)
  })
})

describe('Toast.css', () => {
  it('sits above the nav at 98px plus the safe area and is at most 420px wide', () => {
    expect(toast).toMatch(/98px/)
    expect(toast).toMatch(/env\(safe-area-inset-bottom/)
    expect(toast).toMatch(/max-width:\s*420px/)
  })
})

describe('Skeleton.css', () => {
  it('shimmers for 1.2s and stops with reduced motion', () => {
    expect(skeleton).toMatch(/1\.2s/)
    expect(skeleton).toMatch(/prefers-reduced-motion:\s*reduce[\s\S]*animation:\s*none/)
  })
})
