import { Button } from '../../../ui'
import { DateAttendancePanel } from '../components/DateAttendancePanel'
import { MealSlotCards } from '../components/MealSlotCards'
import { MealSlotEditor } from '../components/MealSlotEditor'
import { SettingsHeader } from '../components/SettingsHeader'
import { useMealSlotsPage } from '../hooks/useMealSlotsPage'
import { settingsStrings } from '../strings'
import '../settings.css'

/** /settings/meal-slots: one Bento card per Meal Slot name. An Admin adds and edits from the cards; a plain User sees them read-only
 *  except "Change a date", which opens the one-date Attendance of the card's next run. */
export function MealSlotsPage() {
  const page = useMealSlotsPage()
  const { editor, dateEditor, attendance } = page
  const ready = page.loaded
  const addButton = page.isAdmin ? (
    <Button variant="primary" icon="add" disabled={page.members.isPending} onClick={page.add}>
      {settingsStrings.slot.add}
    </Button>
  ) : undefined
  return (
    <div className="settings">
      <SettingsHeader title={settingsStrings.mealSlots} actions={addButton} />
      {ready ? (
        <MealSlotCards
          cards={page.cards}
          dateRows={page.dateRows}
          members={page.members.members}
          canEdit={page.isAdmin}
          addDisabled={page.members.isPending}
          onEdit={page.open}
          onFix={page.open}
          onChangeDate={page.changeDateOf}
          onAddOn={page.addOn}
        />
      ) : (
        <p role="status">{settingsStrings.loading}</p>
      )}
      <MealSlotEditor
        open={editor !== null}
        slot={editor?.item}
        members={page.members.members}
        defaultWeekdays={editor?.defaultWeekdays}
        defaultName={editor?.defaultName}
        saving={page.slots.saving}
        error={page.error}
        onSave={page.save}
        slots={page.slots.slots}
        onApply={page.apply}
        courses={page.courses}
        onPreview={page.preview}
        onDelete={page.remove}
        onChangeDate={editor?.item ? page.changeDate : undefined}
        onClose={page.closeEditor}
      />
      {dateEditor ? (
        <DateAttendancePanel
          open
          slot={dateEditor.slot}
          date={dateEditor.date}
          attendance={attendance.attendance}
          members={page.members.members}
          saving={attendance.saving}
          onChangeDate={page.dateChange}
          onSave={page.saveDate}
          onReset={page.resetDate}
          onClose={page.closeDate}
        />
      ) : null}
    </div>
  )
}
