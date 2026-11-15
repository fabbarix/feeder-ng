// B9-14 / PC `context` prop: `context?: string` on BottomSheet and Dialog, a muted `meta` line ABOVE the title ("Mon 16 Nov · Dinner"),
// one line (ellipsis), weight 600, not inside the title. The dialog's accessible name is the context line plus the title.
// Classes: .sheet__context (BottomSheet), .dialog__context (Dialog).
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BottomSheet } from './BottomSheet'
import { Dialog } from './Dialog'
import { declarations, readUiCss } from './test-utils'

describe('context (PC-10)', () => {
  it('BottomSheet: the line is before the title, outside the h2, and part of the dialog name', () => {
    render(
      <BottomSheet open onClose={() => {}} title="Who's eating" context="Mon 16 Nov · Dinner">
        body
      </BottomSheet>,
    )
    const ctx = screen.getByText('Mon 16 Nov · Dinner')
    expect(ctx).toHaveClass('sheet__context')
    const title = screen.getByRole('heading', { level: 2, name: "Who's eating" })
    expect(title).not.toContainElement(ctx)
    expect(ctx.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByRole('dialog')).toHaveAccessibleName("Mon 16 Nov · Dinner Who's eating")
  })
  it('BottomSheet without context renders no line and is named by the title alone', () => {
    render(
      <BottomSheet open onClose={() => {}} title="T">
        body
      </BottomSheet>,
    )
    expect(document.querySelector('.sheet__context')).toBeNull()
    expect(screen.getByRole('dialog')).toHaveAccessibleName('T')
  })
  it('Dialog: the same line and name', () => {
    render(
      <Dialog open onClose={() => {}} title="Time for Tue 17 Dinner" context="Tue 17 · Dinner">
        text
      </Dialog>,
    )
    expect(screen.getByText('Tue 17 · Dinner')).toHaveClass('dialog__context')
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Tue 17 · Dinner Time for Tue 17 Dinner')
  })
  // B9-55 (follow-up): the context wraps to at most two lines, so a long Recipe name does not hide the count (was one cut line).
  it('the line is muted meta text on at most two lines, then an ellipsis (BottomSheet.css, Dialog.css)', () => {
    for (const [file, sel] of [['BottomSheet.css', '.sheet__context'], ['Dialog.css', '.dialog__context']] as const) {
      const d = declarations(readUiCss(file), sel)
      expect(d['color'], file).toBe('var(--color-muted)')
      expect(d['font-size'], file).toBe('var(--text-meta-size)')
      expect(d['line-height'], file).toBe('var(--text-meta-line)')
      expect(d['font-weight'], file).toBe('600')
      expect(d['white-space'], file).toBeUndefined()
      expect(d['-webkit-line-clamp'], file).toBe('2')
      expect(d['overflow'], file).toBe('hidden')
    }
  })
})
