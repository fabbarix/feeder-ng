// WP4 section of the dev Gallery (route /_gallery): overlays, selects, fields and status surfaces. Each example sits in its own cell.
import { useState, type ReactNode } from 'react'
import { BottomSheet } from './BottomSheet'
import { Button, PRIMARY_SCOPE_ATTR } from './Button'
import { Checkbox } from './fields/Checkbox'
import { ColorSwatches } from './fields/ColorSwatches'
import { DateField } from './fields/DateField'
import { FileDrop } from './fields/FileDrop'
import { NumberField } from './fields/NumberField'
import { RadioCards } from './fields/RadioCards'
import { SearchField } from './fields/SearchField'
import { Segmented } from './fields/Segmented'
import { Slider } from './fields/Slider'
import { Switch } from './fields/Switch'
import { TextArea } from './fields/TextArea'
import { TextField } from './fields/TextField'
import { TimeField } from './fields/TimeField'
import { ConfirmProvider, useConfirm } from './ConfirmDialog'
import { Dialog } from './Dialog'
import { ErrorState } from './ErrorState'
import { OfflineBanner } from './OfflineBanner'
import { MultiSelect, Select } from './Select/Select'
import { RecipeSelect } from './Select/RecipeSelect'
import { Skeleton } from './Skeleton'
import { Stepper } from './Stepper'
import { ToastProvider, useToast } from './Toast'
import { GALLERY_ACCENT, GALLERY_SWATCHES } from './galleryData'
import './Gallery.css'

const noop = () => {}
const FRUIT = [
  { value: 'apple', label: 'Apple' },
  { value: 'banana', label: 'Banana', meta: 'Yellow' },
  { value: 'blueberry', label: 'Blueberry' },
]

function Cell({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <div className="gallery__cell" {...{ [PRIMARY_SCOPE_ATTR]: '' }}>
      {children}
      <p className="gallery__caption">{caption}</p>
    </div>
  )
}

function Group({ name, children }: { name: string; children: ReactNode }) {
  return (
    <section className="gallery__group">
      <h3>{name}</h3>
      <div className="gallery__cells">{children}</div>
    </section>
  )
}

function DialogDemo() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Open dialog
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Delete Chicken tikka traybake?"
        icon="delete"
        tone="danger"
        dismissOnBackdrop={false}
        actions={
          <>
            <Button variant="tertiary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => setOpen(false)}>
              Delete
            </Button>
          </>
        }
      >
        <p>It is removed from future Planned Meals. Archive keeps it for history.</p>
      </Dialog>
    </>
  )
}

function ConfirmDemo() {
  const { choose } = useConfirm()
  const [result, setResult] = useState('')
  return (
    <>
      <Button
        variant="secondary"
        onClick={async () => setResult(await choose({ title: 'Delete Chicken tikka traybake?', body: 'It is removed from future Planned Meals.', confirmLabel: 'Delete', alternateLabel: 'Archive instead', tone: 'danger' }))}
      >
        Ask to delete
      </Button>
      {result ? <p>Answer: {result}</p> : null}
    </>
  )
}

function SheetDemo() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Open sheet
      </Button>
      <BottomSheet open={open} onClose={() => setOpen(false)} title="Unknown barcode" footer={<Button onClick={() => setOpen(false)}>Add Product</Button>}>
        <p>Scan the product again, or add it now.</p>
      </BottomSheet>
    </>
  )
}

function ToastDemo() {
  const toast = useToast()
  return (
    <div className="gallery__stack">
      <Button variant="secondary" onClick={() => toast.show('Saved to the plan', { status: 'success' })}>
        Success toast
      </Button>
      <Button variant="secondary" onClick={() => toast.show('Removed', { actionLabel: 'Undo', onAction: noop })}>
        Toast with action
      </Button>
      <Button variant="secondary" onClick={() => toast.show('Could not save', { status: 'error' })}>
        Error toast
      </Button>
    </div>
  )
}

function StepperDemo() {
  const [value, setValue] = useState(4)
  return <Stepper label="portions" value={value} min={1} max={12} onChange={setValue} />
}

function SelectDemo() {
  const [fruit, setFruit] = useState<string | null>(null)
  const [fruits, setFruits] = useState<string[]>([])
  return (
    <div className="gallery__stack">
      <Select label="Fruit" placeholder="Choose a fruit" options={FRUIT} value={fruit} onChange={setFruit} />
      <MultiSelect label="Fruits" options={FRUIT} values={fruits} onChange={setFruits} />
    </div>
  )
}

function RecipeSelectDemo() {
  const [id, setId] = useState<number | null>(null)
  return (
    <RecipeSelect
      label="Recipe"
      value={id}
      onChange={setId}
      recipes={[
        { id: 1, name: 'Chickpea curry', tags: ['vegetarian', 'curry'], totalMinutes: 35, lastCookedAt: '2026-11-02' },
        { id: 2, name: 'Beef stew', tags: ['winter'], totalMinutes: 120, lastCookedAt: null },
      ]}
    />
  )
}

function FieldsDemo() {
  const [text, setText] = useState('Chickpea curry')
  const [notes, setNotes] = useState('')
  const [number, setNumber] = useState<number | null>(4)
  const [time, setTime] = useState('19:30')
  const [date, setDate] = useState('2026-11-10')
  const [checked, setChecked] = useState(true)
  const [on, setOn] = useState(false)
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('system')
  const [units, setUnits] = useState<'metric' | 'imperial'>('metric')
  const [planner, setPlanner] = useState(1)
  const [colour, setColour] = useState(GALLERY_ACCENT)
  const [search, setSearch] = useState('')
  const [file, setFile] = useState('')
  return (
    <div className="gallery__stack">
      <TextField label="Name" value={text} onChange={setText} helper="As on the invite" />
      <TextArea label="Notes" value={notes} onChange={setNotes} rows={2} />
      <NumberField label="Portions" value={number} onChange={setNumber} min={1} max={28} unit="people" />
      <TimeField label="Start time" value={time} onChange={setTime} minuteStep={5} />
      <DateField label="Best before" value={date} onChange={setDate} today="2026-11-10" />
      <Checkbox label="Pin this Meal" description="Keeps it through regeneration" checked={checked} onChange={setChecked} />
      <Switch label="Notify me" checked={on} onChange={setOn} />
      <Segmented label="Theme" options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }, { value: 'system', label: 'System' }]} value={theme} onChange={setTheme} />
      <RadioCards label="Units" options={[{ value: 'metric', title: 'Metric', description: 'grams, millilitres' }, { value: 'imperial', title: 'Imperial', description: 'ounces, cups' }]} value={units} onChange={setUnits} />
      <Slider label="Planner Style" min={0} max={2} step={1} value={planner} onChange={setPlanner} stops={[{ value: 0, label: 'Familiar' }, { value: 1, label: 'Balanced' }, { value: 2, label: 'Adventurous' }]} />
      <ColorSwatches label="Accent" swatches={GALLERY_SWATCHES} value={colour} onChange={setColour} allowCustom />
      <SearchField label="Search Recipes" value={search} onChange={setSearch} />
      <FileDrop label="Recipe file" accept=".json" fileName={file} onFiles={(files) => setFile(files[0]?.name ?? '')} />
    </div>
  )
}

function StatusDemo() {
  return (
    <div className="gallery__stack">
      <OfflineBanner offline savedAt={new Date(2026, 10, 10, 14, 2)} pendingScans={3} />
      <Skeleton variant="row" count={2} delayMs={0} />
      <ErrorState message="The plan could not be loaded." onRetry={noop} />
    </div>
  )
}

/** The WP4 groups for one colour scheme; the providers they need are local to the section. */
export function OverlayGalleryGroups(): ReactNode {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <Group name="Dialog">
          <Cell caption="danger">
            <DialogDemo />
          </Cell>
        </Group>
        <Group name="ConfirmDialog">
          <Cell caption="useConfirm (choose)">
            <ConfirmDemo />
          </Cell>
        </Group>
        <Group name="BottomSheet">
          <Cell caption="footer">
            <SheetDemo />
          </Cell>
        </Group>
        <Group name="Toast">
          <Cell caption="statuses">
            <ToastDemo />
          </Cell>
        </Group>
        <Group name="Stepper">
          <Cell caption="bounded">
            <StepperDemo />
          </Cell>
        </Group>
        <Group name="Select">
          <Cell caption="single and multi">
            <SelectDemo />
          </Cell>
          <Cell caption="RecipeSelect">
            <div className="gallery__stack">
              <RecipeSelectDemo />
            </div>
          </Cell>
        </Group>
        <Group name="Fields">
          <Cell caption="the shared form fields">
            <FieldsDemo />
          </Cell>
        </Group>
        <Group name="Status">
          <Cell caption="offline, loading, error">
            <StatusDemo />
          </Cell>
        </Group>
      </ConfirmProvider>
    </ToastProvider>
  )
}
