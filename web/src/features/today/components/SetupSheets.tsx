// B9-53 (TB-06): the sheets the first-run checklist opens over Today: the Member sheet (settings' MemberEditor in its first-run form), the
// Meal Slot quick start, and the two pickers of step 1 (the crafted TimeZoneSelect and CurrencySelect in a sheet). Loaded on demand
// (SetupSheets.lazy.ts), so the settings forms stay out of the entry chunk Today is in.
import { useState, type ReactElement } from 'react'
import { useMe } from '../../../app/useMe'
import { BottomSheet, Button, CurrencySelect, TimeZoneSelect } from '../../../ui'
import { MealSlotQuickStartSheet } from '../../settings/components/MealSlotQuickStartSheet'
import { MemberEditor } from '../../settings/components/MemberEditor'
import { useAllowlist } from '../../settings/hooks/useAllowlist'
import { useMembers } from '../../settings/hooks/useMembers'
import type { SetupSheet, UseSetupChecklist } from '../hooks/useSetupChecklist'
import { todayStrings as s } from '../strings'

export type SetupSheetsProps = Pick<UseSetupChecklist, 'closeSheet' | 'memberCaption' | 'sheets' | 'pickZone' | 'setUpByHand'> & { sheet: SetupSheet }

export function SetupSheets({ sheet, closeSheet, memberCaption, sheets, pickZone, setUpByHand }: SetupSheetsProps): ReactElement {
  const me = useMe().data
  const members = useMembers()
  const users = useAllowlist(Boolean(me?.isAdmin))
  return (
    <>
      <MemberEditor
        open={sheet === 'member'}
        users={users.users}
        members={members.members}
        currentUserId={me?.id}
        saving={sheets.memberSaving}
        error={sheets.memberError}
        onSave={(input, userId) => sheets.saveMember(input, userId, false)}
        onClose={closeSheet}
        firstRun={{ caption: memberCaption, onSaveAndAddAnother: (input, userId) => sheets.saveMember(input, userId, true) }}
      />
      <MealSlotQuickStartSheet
        open={sheet === 'mealSlots'}
        members={members.members}
        saving={sheets.slotsSaving}
        error={sheets.slotsError}
        onCreate={sheets.createMealSlots}
        onSetUpByHand={setUpByHand}
        onClose={closeSheet}
      />
      {sheet === 'timeZone' || sheet === 'currency' ? (
        <ZonePicker kind={sheet} initial={sheets.zoneChoice[sheet]} onPick={(v) => pickZone(sheet, v)} onClose={closeSheet} />
      ) : null}
    </>
  )
}

/** Step 1's Change: the crafted Select in a sheet; "Use this …" puts the pick in the row, Close keeps the detected value. */
function ZonePicker({ kind, initial, onPick, onClose }: { kind: 'timeZone' | 'currency'; initial: string; onPick: (value: string) => void; onClose: () => void }) {
  const [value, setValue] = useState(initial)
  const zone = kind === 'timeZone'
  return (
    <BottomSheet
      open
      onClose={onClose}
      title={zone ? s.setupPicker.timeZoneTitle : s.setupPicker.currencyTitle}
      footer={
        <Button
          onClick={() => {
            onPick(value)
            onClose()
          }}
        >
          {zone ? s.setupPicker.useTimeZone : s.setupPicker.useCurrency}
        </Button>
      }
    >
      <p className="setup-picker__lead">{zone ? s.setupPicker.timeZoneLead : s.setupPicker.currencyLead}</p>
      {zone ? (
        <TimeZoneSelect size="lg" value={value} onChange={setValue} />
      ) : (
        <CurrencySelect size="lg" value={value} onChange={setValue} />
      )}
    </BottomSheet>
  )
}
