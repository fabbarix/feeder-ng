// B9-14 section of the dev Gallery (route /_gallery): "Sheets and dialogs", the props B9-14 added. A sheet's `context` line, its
// footer `submit` bound to the body's form, `confirmDismiss` (the "Discard changes?" question while dirty), a Dialog's `context`,
// and FormActions with the ⋮ (`more`) and the destructive row. Its own block, so other packages add their own groups beside it.
import { useState, type ReactNode } from 'react'
import { BottomSheet } from './BottomSheet'
import { Button, PRIMARY_SCOPE_ATTR } from './Button'
import { Dialog } from './Dialog'
import { FormActions } from './FormActions'
import { TextField } from './fields/TextField'
import type { MenuEntry } from './Menu'

const noop = () => {}

function Cell({ caption, children }: { caption: string; children: ReactNode }) {
  return (
    <div className="gallery__cell" {...{ [PRIMARY_SCOPE_ATTR]: '' }}>
      {children}
      <p className="gallery__caption">{caption}</p>
    </div>
  )
}

/** A form sheet: context line, Cancel and the footer submit, and "Discard changes?" once a field was edited. */
function FormSheetDemo() {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('Chiara')
  const dirty = name !== 'Chiara'
  const close = () => {
    setOpen(false)
    setName('Chiara')
  }
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Open form sheet
      </Button>
      <BottomSheet
        open={open}
        onClose={close}
        onCancel={close}
        context="Mon 16 Nov · Dinner"
        title="Edit Member"
        confirmDismiss={dirty}
        submit={{ label: 'Save', form: 'gallery-sheet-form' }}
      >
        <form
          id="gallery-sheet-form"
          onSubmit={(e) => {
            e.preventDefault()
            close()
          }}
        >
          <TextField label="Name" value={name} onChange={setName} required />
        </form>
      </BottomSheet>
    </>
  )
}

/** One line of body: the sheet is as tall as its content (no floor), Close in the header. */
function OneLineSheetDemo() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Open one-line sheet
      </Button>
      <BottomSheet open={open} onClose={() => setOpen(false)} title="Clear the Shopping List?" footer={<Button onClick={() => setOpen(false)}>Clear</Button>}>
        <p>Ticked items go to the Pantry.</p>
      </BottomSheet>
    </>
  )
}

const MORE: MenuEntry[] = [
  { id: 'dates', label: 'Change dates', onSelect: noop },
  { id: 'remove', label: 'Remove Meal Slot', tone: 'danger', onSelect: noop },
]

/** A sheet whose footer is FormActions: the ⋮ (with the danger item), Cancel and Save on one row. */
function FormActionsSheetDemo() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Open sheet with ⋮
      </Button>
      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        closeButton={false}
        title="Edit Meal Slot"
        footer={
          <FormActions
            more={MORE}
            moreLabel="More for Dinner"
            tertiary={
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
            }
            primary={<Button onClick={() => setOpen(false)}>Save</Button>}
          />
        }
      >
        <p>Dinner, every day at 19:00.</p>
      </BottomSheet>
    </>
  )
}

function ContextDialogDemo() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Open dialog with context
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        context="Tue 17 Nov · Dinner"
        title="Mark as Not cooked?"
        onCancel={() => setOpen(false)}
        actions={<Button onClick={() => setOpen(false)}>Not cooked</Button>}
      >
        <p>The Recipe goes back to the plan for another day.</p>
      </Dialog>
    </>
  )
}

/** The B9-14 group: "Sheets and dialogs". */
export function SheetGalleryGroup(): ReactNode {
  return (
    <section className="gallery__group">
      <h3>Sheets and dialogs</h3>
      <div className="gallery__cells">
        <Cell caption="context, submit, confirmDismiss">
          <FormSheetDemo />
        </Cell>
        <Cell caption="one line: as tall as its content">
          <OneLineSheetDemo />
        </Cell>
        <Cell caption="footer FormActions with more">
          <FormActionsSheetDemo />
        </Cell>
        <Cell caption="Dialog context">
          <ContextDialogDemo />
        </Cell>
        <Cell caption="FormActions: more, destructive row, secondary, primary">
          <FormActions
            more={MORE}
            moreLabel="More for Dinner"
            destructive={<Button variant="danger-secondary">Remove Meal Slot</Button>}
            secondary={<Button variant="secondary">Cancel</Button>}
            primary={<Button>Save</Button>}
          />
        </Cell>
      </div>
    </section>
  )
}
