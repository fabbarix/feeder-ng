// B9-19 (SHORT-04, SHORT-06): `sticky?: boolean`: a bar with nothing to do (both buttons disabled) ends the form instead of floating.
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Button } from './Button'
import { FormActions } from './FormActions'
import { StickyActionBar } from './StickyActionBar'

const bar = (props: Partial<React.ComponentProps<typeof StickyActionBar>> = {}) => (
  <StickyActionBar {...props}>
    <FormActions primary={<Button>Save</Button>} />
  </StickyActionBar>
)

describe('StickyActionBar sticky prop', () => {
  it('floats by default: data-sticky="true"', () => {
    const { container } = render(bar())
    expect(container.querySelector('.sticky-action-bar')).toHaveAttribute('data-sticky', 'true')
  })

  it('sticky={false} sets data-sticky="false" (the stylesheet makes it static)', () => {
    const { container, rerender } = render(bar({ sticky: false }))
    expect(container.querySelector('.sticky-action-bar')).toHaveAttribute('data-sticky', 'false')
    rerender(bar({ sticky: true }))
    expect(container.querySelector('.sticky-action-bar')).toHaveAttribute('data-sticky', 'true')
  })

  it('a non-floating bar keeps its group role, label and content', () => {
    const { getByRole } = render(bar({ sticky: false, label: 'Recipe actions' }))
    expect(getByRole('group', { name: 'Recipe actions' })).toContainElement(getByRole('button', { name: 'Save' }))
  })
})
