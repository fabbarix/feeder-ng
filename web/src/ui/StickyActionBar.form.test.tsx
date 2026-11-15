// R2-1 (L-03): the editor's actions line up with its 840 px form column, so StickyActionBar gets column="form".
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Button } from './Button'
import { FormActions } from './FormActions'
import { StickyActionBar } from './StickyActionBar'
import { declarations, readUiCss } from './test-utils'

describe('StickyActionBar column="form"', () => {
  it('reports data-column="form"', () => {
    const { container } = render(
      <StickyActionBar column="form">
        <FormActions primary={<Button>Save</Button>} />
      </StickyActionBar>,
    )
    expect(container.querySelector('.sticky-action-bar')).toHaveAttribute('data-column', 'form')
  })
  it('SHORT-08: caps the box (not its inner row) at the editor column (840 px) and keeps it centred', () => {
    const css = readUiCss('StickyActionBar.css')
    const box = declarations(css, ".sticky-action-bar[data-column='form']")
    expect(box['max-inline-size']).toBe('840px')
    expect(box['margin-inline']).toBe('auto')
  })
})
