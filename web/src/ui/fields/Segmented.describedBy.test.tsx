// SegmentedOption.describedBy: the id of the element that says why one option is disabled (aria-describedby of that radio).
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Segmented } from './Segmented'

describe('Segmented option describedBy', () => {
  it('sets aria-describedby on that option only', () => {
    render(
      <>
        <Segmented
          label="Read from"
          value="url"
          onChange={() => undefined}
          options={[
            { value: 'url', label: 'Web page' },
            { value: 'photo', label: 'Photo', disabled: true, describedBy: 'why-photo' },
          ]}
        />
        <p id="why-photo">This model can&apos;t read photos.</p>
      </>,
    )
    expect(screen.getByRole('radio', { name: 'Photo' })).toHaveAttribute('aria-describedby', 'why-photo')
    expect(screen.getByRole('radio', { name: 'Photo' })).toHaveAccessibleDescription("This model can't read photos.")
    expect(screen.getByRole('radio', { name: 'Web page' })).not.toHaveAttribute('aria-describedby')
  })
})
