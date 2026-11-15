// B9-14 / DS-01: a portalled sheet or dialog leaves the subtree it was mounted in; a scheme that subtree sets (the Gallery's dark
// panel) still reaches it, and nothing is copied from the document's own scheme.
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BottomSheet } from './BottomSheet'
import { Dialog } from './Dialog'

describe('a portalled sheet keeps the scheme of where it was mounted', () => {
  it('BottomSheet inside a data-scheme="dark" section is dark', () => {
    render(
      <section data-scheme="dark">
        <BottomSheet open onClose={() => {}} title="T">
          body
        </BottomSheet>
      </section>,
    )
    expect(screen.getByRole('dialog')).toHaveAttribute('data-scheme', 'dark')
  })
  it('Dialog inside a data-scheme="light" section is light', () => {
    render(
      <section data-scheme="light">
        <Dialog open onClose={() => {}} title="Sure?">
          text
        </Dialog>
      </section>,
    )
    expect(screen.getByRole('dialog')).toHaveAttribute('data-scheme', 'light')
  })
  it('without a scheme on the way the dialog sets none (the document scheme reaches it)', () => {
    document.documentElement.dataset['scheme'] = 'dark'
    render(
      <BottomSheet open onClose={() => {}} title="T">
        body
      </BottomSheet>,
    )
    expect(screen.getByRole('dialog')).not.toHaveAttribute('data-scheme')
    delete document.documentElement.dataset['scheme']
  })
})
