import { BentoGrid, Button, LoadState } from '../../../ui'
import { SkeletonBlock, SkeletonGroup, SkeletonTile } from '../../../ui/Skeleton'
import { DateAttendancePanel } from '../components/DateAttendancePanel'
import { MealSlotCards } from '../components/MealSlotCards'
import { MealSlotEditor } from '../components/MealSlotEditor'
import { RemovedMealSlots } from '../components/RemovedMealSlots'
import { SettingsHeader } from '../components/SettingsHeader'
import { SettingsLoadGate } from '../components/SettingsLoadGate'
import { useMealSlotsPage } from '../hooks/useMealSlotsPage'
import { settingsStrings } from '../strings'
import '../settings.css'

/** /settings/meal-slots: one Bento card per Meal Slot name, then the removed Meal Slots that kept Cooked history. An Admin adds and
 *  edits from the cards; a plain User sees them read-only except "Change a date", which opens the one-date Attendance of the card's
 *  next run. B9-20: skeleton cards while loading, the LoadState offline with nothing loaded, an alert with Try again on a failure. */
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
      {page.state === 'offlineUnknown' ? (
        <LoadState title={settingsStrings.slot.offlineTitle} text={settingsStrings.offline.text} />
      ) : (
        <SettingsLoadGate state={page.state} onRetry={page.refetch} errorMessage={settingsStrings.slot.loadError}>
          {ready ? (
            <div className="ms-page">
              <MealSlotCards
                cards={page.cards}
                dateRows={page.dateRows}
                members={page.members.members}
                canEdit={page.isAdmin}
                addDisabled={page.members.isPending}
                onEdit={page.open}
                onEditCard={page.editCard}
                onFix={page.open}
                onChangeDate={page.changeDateOf}
                onAddOn={page.addOn}
              />
              <RemovedMealSlots groups={page.removed} canRestore={page.isAdmin} busyKey={page.busyKey} onPutBack={(row) => void page.putBack(row)} />
            </div>
          ) : (
            <MealSlotsSkeleton />
          )}
        </SettingsLoadGate>
      )}
      <MealSlotEditor
        open={editor !== null}
        slot={editor?.item}
        members={page.members.members}
        defaultWeekdays={editor?.defaultWeekdays}
        initialWeekdays={editor?.initialWeekdays}
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

/** B9-20 (RES-02): the cards while they first load, in their final shape (name and time, the 7-day strip, the foot). */
function MealSlotsSkeleton() {
  return (
    <SkeletonGroup label={settingsStrings.loading}>
      <BentoGrid min="wide">
        {[0, 1].map((i) => (
          <SkeletonTile key={i} className="ms-card-skeleton">
            <SkeletonBlock variant="title" />
            <SkeletonBlock variant="meta" />
            <SkeletonBlock variant="row" />
            <SkeletonBlock variant="line" />
          </SkeletonTile>
        ))}
      </BentoGrid>
    </SkeletonGroup>
  )
}
