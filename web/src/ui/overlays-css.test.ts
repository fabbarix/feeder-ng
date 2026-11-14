// CSS contracts of the WP4 primitives (read as text; jsdom has no layout). Component CSS lives next to the component.
import { describe, expect, it } from 'vitest'
import { readUiCss } from './test-utils'

// ?raw imports of CSS are blanked by vitest, so the files are read through test-utils (same text, same assertions).
const bottomSheet = readUiCss('BottomSheet.css')
const dialog = readUiCss('Dialog.css')
const skeleton = readUiCss('Skeleton.css')
const toast = readUiCss('Toast.css')

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

describe('scroll lock behind a modal', () => {
  it('Dialog.css locks the page scroll while any modal <dialog> (Dialog, BottomSheet) is open', () => {
    expect(dialog).toMatch(/html:has\(\s*dialog:modal\s*\)\s*{[^}]*overflow:\s*hidden/)
  })
})

describe('BottomSheet.css', () => {
  it('leaves room in the scrolling body for a focused field\'s ring at its side edges (beta.7 H9 follow-up)', () => {
    const body = /\.sheet__body\s*{([^}]*)}/.exec(bottomSheet)?.[1] ?? ''
    expect(body).toMatch(/margin-inline:\s*calc\(-1 \* var\(--space-2\)\)/)
    expect(body).toMatch(/padding-inline:\s*var\(--space-2\)/)
  })
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
  it('sits above the bottom bar (var(--nav-top), no hard-coded 98px) with a minimum gap, and is at most 420px wide', () => {
    const code = toast.replace(/\/\*[\s\S]*?\*\//g, '')
    const bottom = /\.toast-region\s*\{[^}]*?bottom:\s*([^;]+);/.exec(code)?.[1] ?? ''
    expect(bottom).not.toMatch(/98px/)
    expect(bottom).toMatch(/var\(--nav-top/)
    expect(bottom).not.toMatch(/--nav-clearance/)
    // --nav-top is 0 from 1024 up, so a gap must be added on top of it.
    expect(bottom).toMatch(/\+\s*(var\(--space-\d+\)|\d+px)|max\(/)
    expect(code).toMatch(/max-width:\s*420px/)
  })
})

describe('Skeleton.css', () => {
  it('shimmers for 1.2s and stops with reduced motion', () => {
    expect(skeleton).toMatch(/1\.2s/)
    expect(skeleton).toMatch(/prefers-reduced-motion:\s*reduce[\s\S]*animation:\s*none/)
  })
})
