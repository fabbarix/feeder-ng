import { useEffect, useRef, useState, type ReactElement } from 'react'
import { BottomSheet, Button, Icon, TextField, TimeField } from '../../../ui'
import { FormError } from '../../../ui/fields/FormError'
import { useMealSlotQuickStart } from '../hooks/useMealSlotQuickStart'
import { rowLabel, rowNameField, type QuickStartSlot } from '../lib/quickStart'
import { settingsStrings } from '../strings'
import type { Member } from '../types'
import { MemberAvatar } from './MemberAvatar'
import '../settings.css'
import './MealSlotQuickStartSheet.css'

export interface MealSlotQuickStartSheetProps {
  open: boolean
  /** Who will be at the table (everyone attends every new Meal Slot). */
  members: Pick<Member, 'id' | 'name' | 'colour' | 'avatar' | 'photo'>[]
  saving?: boolean
  /** The server's refusal: the sheet's one error. */
  error?: string
  onCreate: (slots: QuickStartSlot[]) => void | Promise<void>
  /** The Meal Slots page with the Add editor on every weekday. */
  onSetUpByHand: () => void
  onClose: () => void
}

const text = settingsStrings.slot.quickStart

/**
 * B9-53 (TB-06, step 3): "When do you eat?" over Today. Toggle rows (role checkbox) for Breakfast 07:30, Lunch 13:00 and Dinner 19:30, Lunch
 * and Dinner on, each with an outlined time button that opens its time field; "Add another Meal Slot"; who is at the table; footer "Set up by
 * hand" and "Create N Meal Slots", which sends one batch, every weekday, in time order. The circular Close, no Cancel.
 */
export function MealSlotQuickStartSheet({ open, members, saving = false, error, onCreate, onSetUpByHand, onClose }: MealSlotQuickStartSheetProps): ReactElement {
  const quick = useMealSlotQuickStart(open)
  const listRef = useRef<HTMLUListElement>(null)
  const [focusRow, setFocusRow] = useState<string | null>(null)
  useEffect(() => {
    if (focusRow === null) return
    listRef.current?.querySelector<HTMLInputElement>(`[data-row="${focusRow}"] input[type="text"]`)?.focus()
    setFocusRow(null)
  }, [focusRow])
  const count = quick.slots.length
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={text.title}
      footer={
        <>
          <Button variant="secondary" onClick={onSetUpByHand}>
            {text.byHand}
          </Button>
          <Button loading={saving} disabled={count === 0} onClick={() => void onCreate(quick.slots)}>
            {text.create(count)}
          </Button>
        </>
      }
    >
      <p className="quick-start__lead">{text.lead}</p>
      <ul ref={listRef} className="quick-start__rows">
        {quick.rows.map((row) => {
          const name = rowLabel(quick.rows, row)
          const editing = quick.editingTime === row.key
          return (
            <li key={row.key} className="quick-start__row" data-on={row.on ? 'true' : 'false'} data-row={row.key}>
              <div className="quick-start__line">
                <button type="button" role="checkbox" aria-checked={row.on} className="quick-start__toggle" onClick={() => quick.toggle(row.key)}>
                  <span className="quick-start__box" aria-hidden="true">
                    {row.on ? <Icon name="tick" size={16} /> : null}
                  </span>
                  <span className="quick-start__name">{name}</span>
                </button>
                <Button
                  variant="secondary"
                  className="quick-start__time"
                  aria-label={text.time(name, row.time)}
                  aria-expanded={editing}
                  onClick={() => quick.toggleTime(row.key)}
                >
                  {row.time}
                </Button>
              </div>
              {row.custom ? (
                <TextField size="md" label={rowNameField(quick.rows, row)} value={row.name} onChange={(v) => quick.setName(row.key, v)} />
              ) : null}
              {editing ? <TimeField size="sm" label={text.timeField(name)} value={row.time} minuteStep={5} onChange={(v) => quick.setTime(row.key, v)} /> : null}
            </li>
          )
        })}
      </ul>
      <Button variant="secondary" icon="add" className="quick-start__add" onClick={() => setFocusRow(quick.addRow())}>
        {text.addAnother}
      </Button>
      {members.length > 0 ? (
        <div className="quick-start__who">
          <span className="quick-start__avatars" aria-hidden="true">
            {members.map((m) => (
              <MemberAvatar key={m.id} name={m.name} colour={m.colour} avatar={m.avatar} photo={m.photo} size="sm" />
            ))}
          </span>
          <p className="quick-start__table">{text.atTheTable(members.map((m) => m.name))}</p>
        </div>
      ) : null}
      <FormError>{error}</FormError>
    </BottomSheet>
  )
}
