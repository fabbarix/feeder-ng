import { Tile, useMediaQuery } from '../../../ui'
import { DateAttendancePanel } from '../components/DateAttendancePanel'
import { MealSlotGrid } from '../components/MealSlotGrid'
import { MealSlotEditor } from '../components/MealSlotEditor'
import { MealSlotWeek } from '../components/MealSlotWeek'
import { SettingsHeader } from '../components/SettingsHeader'
import { useMealSlotsPage } from '../hooks/useMealSlotsPage'
import { settingsStrings } from '../strings'
import '../settings.css'

/** /settings/meal-slots: the week (Monday first). An Admin adds and edits slots; a tap on a chip opens the slot sheet
 *  (Admin) or the one-date Attendance (plain User). */
export function MealSlotsPage() {
  const page = useMealSlotsPage()
  const Overview = useMediaQuery('(min-width: 1024px)') ? MealSlotGrid : MealSlotWeek
  const overview = { slots: page.slots.slots, members: page.members.members, canEdit: page.isAdmin, addDisabled: page.members.isPending, onAdd: page.addOn, onOpen: page.open }
  const { editor, dateEditor, attendance } = page
  return (
    <div className="settings">
      <SettingsHeader title={settingsStrings.mealSlots} />
      <Tile as="section" span="full" aria-label={settingsStrings.mealSlots}>
        {page.slots.isPending ? (
          <p role="status">{settingsStrings.loading}</p>
        ) : (
          <Overview {...overview} />
        )}
      </Tile>
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
