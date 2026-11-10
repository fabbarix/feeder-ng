// R2-F (F-01): every field primitive takes size (xs/sm/md/lg/full) and renders it as data-size on its outer frame;
// the CSS contract for the sizes is in fieldSize.css.test.ts. Defaults: TextField, Select, DateField md; NumberField, TimeField sm;
// TextArea and SearchField full.
import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { describe, expect, it } from 'vitest'
import { Select } from '../Select/Select'
import { DateField } from './DateField'
import { FieldFrame, useFieldIds } from './FieldFrame'
import type { FieldSize } from './Field'
import { NumberField } from './NumberField'
import { SearchField } from './SearchField'
import { TextArea } from './TextArea'
import { TextField } from './TextField'
import { TimeField } from './TimeField'

const SIZES: FieldSize[] = ['xs', 'sm', 'md', 'lg', 'full']
const noop = () => {}

function Frame({ size }: { size?: FieldSize }) {
  const ids = useFieldIds()
  return (
    <FieldFrame ids={ids} label="Thing" size={size}>
      <span />
    </FieldFrame>
  )
}

const CASES: { name: string; make: (size?: FieldSize) => ReactElement; fallback: FieldSize | null }[] = [
  { name: 'FieldFrame', make: (size) => <Frame size={size} />, fallback: null },
  { name: 'TextField', make: (size) => <TextField label="Name" value="" onChange={noop} size={size} />, fallback: 'md' },
  { name: 'TextArea', make: (size) => <TextArea label="Note" value="" onChange={noop} size={size} />, fallback: 'full' },
  { name: 'NumberField', make: (size) => <NumberField label="Yield" value={4} onChange={noop} size={size} />, fallback: 'sm' },
  {
    name: 'Select',
    make: (size) => <Select label="Fruit" options={[{ value: 'a', label: 'Apple' }]} value={null} onChange={noop} size={size} />,
    fallback: 'md',
  },
  { name: 'DateField', make: (size) => <DateField label="Day" value="" onChange={noop} size={size} />, fallback: 'md' },
  { name: 'TimeField', make: (size) => <TimeField label="From" value="19:30" onChange={noop} size={size} />, fallback: 'sm' },
  { name: 'SearchField', make: (size) => <SearchField label="Search" value="" onChange={noop} size={size} />, fallback: 'full' },
]

const frameOf = (container: HTMLElement) => container.firstElementChild as HTMLElement

describe('field size prop (F-01)', () => {
  for (const { name, make, fallback } of CASES) {
    describe(name, () => {
      it.each(SIZES)('size="%s" is data-size on the outer frame', (size) => {
        const { container } = render(make(size))
        expect(frameOf(container)).toHaveAttribute('data-size', size)
      })

      if (fallback) {
        it(`defaults to ${fallback}`, () => {
          const { container } = render(make())
          expect(frameOf(container)).toHaveAttribute('data-size', fallback)
        })
      } else {
        it('without size sets no data-size (the frame stays its own width)', () => {
          const { container } = render(make())
          expect(frameOf(container)).not.toHaveAttribute('data-size')
        })
      }
    })
  }

  it('the size prop never leaks to the DOM as an attribute of the input (no <input size="xs">)', () => {
    const { container } = render(<TextField label="Name" value="" onChange={noop} size="xs" />)
    expect(container.querySelector('input')).not.toHaveAttribute('size')
  })
})
