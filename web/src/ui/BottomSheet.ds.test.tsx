// B9-14 / SHORT-02 tests-and-guard: the contract of a sheet footer. At most two TEXT buttons (the ⋮ is an icon button and does not
// count), and never a tertiary (bare text) button. Every non-primary action is a real button with a boundary (R-A).
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { BottomSheet } from './BottomSheet'
import { Button } from './Button'
import { FormActions } from './FormActions'

const footerOf = () => document.querySelector('.sheet__footer') as HTMLElement
const textButtons = (el: HTMLElement) => [...el.querySelectorAll('button')].filter((b) => !b.classList.contains('icon-button') && !b.classList.contains('close-button'))

describe('BottomSheet footer contract (SHORT-02)', () => {
  it('Cancel + submit: two text buttons, none tertiary', () => {
    render(
      <BottomSheet open onClose={() => {}} onCancel={() => {}} submit={{ label: 'Save', form: 'f' }} title="T">
        <form id="f" />
      </BottomSheet>,
    )
    expect(textButtons(footerOf())).toHaveLength(2)
    expect(footerOf().querySelector('[data-variant="tertiary"]')).toBeNull()
  })
  it('⋮ + outlined secondary + primary: two text buttons and the icon button', () => {
    render(
      <MemoryRouter>
        <BottomSheet
          open
          onClose={() => {}}
          title="T"
          footer={<FormActions more={[{ id: 'x', label: 'Not cooked' }]} moreLabel="More for Salad" secondary={<Button variant="secondary">No Leftover</Button>} primary={<Button>Mark as Cooked</Button>} />}
        >
          body
        </BottomSheet>
      </MemoryRouter>,
    )
    expect(textButtons(footerOf())).toHaveLength(2)
    expect(footerOf().querySelectorAll('.icon-button')).toHaveLength(1)
    expect(footerOf().querySelector('[data-variant="tertiary"]')).toBeNull()
    for (const b of textButtons(footerOf()).filter((x) => x.getAttribute('data-variant') !== 'primary')) {
      expect(b.getAttribute('data-variant')).toMatch(/^(secondary|danger-secondary)$/)
    }
  })
})
