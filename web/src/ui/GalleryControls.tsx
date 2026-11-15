// B9-16 section of the dev Gallery (route /_gallery): the controls of A11Y-05, A11Y-06, A11Y-09, SAFE-04, SET-07, PC-08 and RX-08.
// The ruled Search field and Segmented track on every surface, the selected and pressed states, every Stepper size, IconSet,
// Disclosure, FormError and field errors, the growing TextArea, DateField with a range and DurationField. Each example in its own cell.
import { useState, type ReactNode } from 'react'
import { PRIMARY_SCOPE_ATTR } from './Button'
import { ChoiceChip } from './ChoiceChip'
import { Disclosure } from './Disclosure'
import { IconButton } from './IconButton'
import { IconSet } from './IconSet'
import { Stepper } from './Stepper'
import { Tile } from './Tile'
import type { TileStatus, TileVariant } from './Tile'
import { DateField } from './fields/DateField'
import { DurationField } from './fields/DurationField'
import { FieldRow } from './fields/FieldRow'
import { FormError } from './fields/FormError'
import { NumberField } from './fields/NumberField'
import { RadioCards } from './fields/RadioCards'
import { SearchField } from './fields/SearchField'
import { Segmented } from './fields/Segmented'
import { TextArea } from './fields/TextArea'
import { TextField } from './fields/TextField'
import { formatMinutes } from '../lib/time'
import './Gallery.css'

const noop = () => {}

function WideCell({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <div className="gallery__cell gallery__cell--wide" {...{ [PRIMARY_SCOPE_ATTR]: '' }}>
      {children}
      <p className="gallery__caption">{caption}</p>
    </div>
  )
}

function Cell({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <div className="gallery__cell" {...{ [PRIMARY_SCOPE_ATTR]: '' }}>
      {children}
      <p className="gallery__caption">{caption}</p>
    </div>
  )
}

const KINDS = [
  { value: 'cook', label: 'Cook' },
  { value: 'prep', label: 'Prep' },
  { value: 'advance', label: 'Advance' },
] as const
type Kind = (typeof KINDS)[number]['value']

function RuledPair({ name }: { name: string }) {
  const [kind, setKind] = useState<Kind>('prep')
  const [query, setQuery] = useState('')
  return (
    <div className="gallery__controls-stack">
      <SearchField label={`Search (${name})`} value={query} onChange={setQuery} placeholder="Search Recipes" />
      <Segmented label={`Step kind (${name})`} options={[...KINDS]} value={kind} onChange={setKind} />
      <Segmented label={`Compact (${name})`} options={[...KINDS]} value={kind} onChange={setKind} compact />
    </div>
  )
}

const SURFACES: { name: string; variant?: TileVariant; status?: TileStatus }[] = [
  { name: 'surface tile', variant: 'surface' },
  { name: 'Step card, surface-2', variant: 'action' },
  { name: 'soft tile', variant: 'soft' },
  { name: 'danger tile', variant: 'status', status: 'danger' },
  { name: 'spoil tile', variant: 'status', status: 'spoil' },
  { name: 'info tile', variant: 'status', status: 'info' },
]

function SelectedSet({ name }: { name: string }) {
  const [chips, setChips] = useState<Record<string, boolean>>({ Quick: true, Family: false })
  const [pinned, setPinned] = useState(true)
  return (
    <div className="gallery__controls-row">
      {Object.entries(chips).map(([chip, on]) => (
        <ChoiceChip key={chip} pressed={on} onClick={() => setChips((c) => ({ ...c, [chip]: !c[chip] }))}>
          {chip}
        </ChoiceChip>
      ))}
      <IconButton icon="pin" label={`Pin (${name})`} pressed={pinned} onClick={() => setPinned((p) => !p)} />
      <IconButton icon="pin" label={`Pin, not pressed (${name})`} pressed={false} onClick={noop} />
    </div>
  )
}

function SurfacesGroup() {
  return (
    <>
      <WideCell caption="Page: ruled Search, Segmented (full width with the Check, compact without)">
        <RuledPair name="page" />
      </WideCell>
      <WideCell caption="Page: pressed ChoiceChip and IconButton">
        <SelectedSet name="page" />
      </WideCell>
      {SURFACES.map((s) => (
        <WideCell key={s.name} caption={`On a ${s.name}: ruled controls and selected states`}>
          <Tile variant={s.variant} status={s.status}>
            <div className="gallery__controls-stack">
              <RuledPair name={s.name} />
              <SelectedSet name={s.name} />
            </div>
          </Tile>
        </WideCell>
      ))}
      <Cell caption="Segmented in an 18 rem field: no Check, nothing wraps">
        <div className="gallery__narrow">
          <Segmented label="Narrow" options={[...KINDS]} value="advance" onChange={noop} />
        </div>
      </Cell>
    </>
  )
}

function RadioCardsDemo() {
  const [v, setV] = useState<'week' | 'day'>('week')
  return (
    <RadioCards
      label="Plan"
      options={[
        { value: 'week', title: 'The whole week', description: 'Seven days from Monday' },
        { value: 'day', title: 'One day', description: 'Only the day you pick' },
      ]}
      value={v}
      onChange={setV}
    />
  )
}

function StepperDemo({ size }: { size: 'md' | 'sm' | 'xs' | 'lg' }) {
  const [n, setN] = useState(size === 'lg' ? 240 : 2)
  return size === 'lg' ? (
    <Stepper label="Reheat time" value={n} onChange={setN} min={0} step={30} size="lg" format={(s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`} decreaseLabel="Remove 30 seconds" increaseLabel="Add 30 seconds" />
  ) : (
    <Stepper label="Batches" value={n} onChange={setN} min={1} size={size} unit={size === 'xs' ? 'jars' : undefined} />
  )
}

function DisclosureDemo({ invalid, defaultOpen, id }: { invalid?: boolean; defaultOpen?: boolean; id: string }) {
  return (
    <Disclosure id={id} title="Planning" summary="Main · quick, family · Cool-down 5 days" defaultOpen={defaultOpen} invalid={invalid} level={4}>
      <NumberField label="Cool-down" value={invalid ? null : 5} onChange={noop} size="xs" unit="days" error={invalid ? 'Enter the days before this Recipe comes back.' : undefined} />
    </Disclosure>
  )
}

function GrowingTextArea() {
  const [text, setText] = useState('Brown the onions slowly.\nAdd the garlic for the last minute.')
  return <TextArea label="Step" value={text} onChange={setText} helper="It grows as you type, up to 12 lines, with no grip." />
}

function DurationDemo({ label, initial, units }: { label: string; initial: number | null; units?: ('min' | 'h' | 'd')[] }) {
  const [m, setM] = useState<number | null>(initial)
  return (
    <div className="gallery__controls-stack">
      <DurationField label={label} value={m} onChange={setM} units={units} />
      <p className="gallery__caption">Stored: {m === null ? 'empty' : `${m} min (${formatMinutes(m)})`}</p>
    </div>
  )
}

function RangeDemo() {
  const [end, setEnd] = useState('2026-11-20')
  return <DateField label="Away until" value={end} onChange={setEnd} rangeStart="2026-11-14" today="2026-11-12" />
}

/** The "Controls" group (B9-16): one block, so a reviewer finds every control of the package in one place. */
export function ControlsGalleryGroup() {
  return (
    <section className="gallery__group" data-gallery-group="controls">
      <h3>Controls</h3>
      <div className="gallery__cells">
        <SurfacesGroup />
        <WideCell caption="RadioCards: the checked card has the selected fill and ring">
          <RadioCardsDemo />
        </WideCell>
        {(['md', 'sm', 'xs', 'lg'] as const).map((size) => (
          <WideCell key={size} caption={`Stepper ${size}${size === 'lg' ? ' (56 px buttons, value formatted)' : ''}`}>
            <StepperDemo size={size} />
          </WideCell>
        ))}
        <WideCell caption="Field stepper: 36 px buttons in the 48 px frame">
          <NumberField label="Servings" value={4} onChange={noop} size="xs" />
        </WideCell>
        <Cell caption="IconSet of three">
          <IconSet label="Actions for Soup">
            <IconButton icon="moveUp" label="Move Soup up" onClick={noop} />
            <IconButton icon="moveDown" label="Move Soup down" onClick={noop} />
            <IconButton icon="remove" label="Remove Soup" onClick={noop} />
          </IconSet>
        </Cell>
        <Cell caption="IconSet of four, compact">
          <IconSet label="Actions for Pasta">
            <IconButton icon="more" label="More for Pasta" size="compact" onClick={noop} />
            <IconButton icon="pin" label="Pin Pasta" size="compact" pressed onClick={noop} />
            <IconButton icon="moveUp" label="Move Pasta up" size="compact" onClick={noop} />
            <IconButton icon="remove" label="Remove Pasta" size="compact" onClick={noop} />
          </IconSet>
        </Cell>
        <WideCell caption="Disclosure closed">
          <DisclosureDemo id="gallery-disclosure-closed" />
        </WideCell>
        <WideCell caption="Disclosure open">
          <DisclosureDemo id="gallery-disclosure-open" defaultOpen />
        </WideCell>
        <WideCell caption="Disclosure opened by an error inside">
          <DisclosureDemo id="gallery-disclosure-invalid" invalid />
        </WideCell>
        <WideCell caption="FormError: the form's one live error">
          <FormError>Could not save the Household settings. Check your connection and try again.</FormError>
        </WideCell>
        <WideCell caption="A field with an error: the error takes the field's track, up to 60 ch">
          <TextField label="Currency" value="EURO" onChange={noop} size="xs" error="Enter a three-letter currency code, such as EUR." />
        </WideCell>
        <WideCell caption="FieldRow with an error: the invalid field grows to its error">
          <FieldRow>
            <NumberField label="Yield" value={4} onChange={noop} size="xs" />
            <NumberField label="Cool-down" value={null} onChange={noop} size="xs" unit="days" error="Enter the days before it comes back." />
          </FieldRow>
        </WideCell>
        <WideCell caption="TextArea grows (type to see it), no grip">
          <GrowingTextArea />
        </WideCell>
        <WideCell caption="DateField with a range (14 to 20 November)">
          <RangeDemo />
        </WideCell>
        <WideCell caption="DurationField: a Duration in min or h">
          <DurationDemo label="Duration" initial={90} />
        </WideCell>
        <WideCell caption="DurationField: a Lead time in min, h or d (the unit converts, the minutes stay)">
          <DurationDemo label="Lead time" initial={1440} units={['min', 'h', 'd']} />
        </WideCell>
      </div>
    </section>
  )
}
