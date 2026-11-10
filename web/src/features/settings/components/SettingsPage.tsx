import { BentoGrid, Tile } from '../../../ui'
import { NotificationSettingsLink } from '../../notifications'
import { PlanningSettingsLink } from '../../plan'
import { ShopsSettingsLink } from '../../shops'
import { useSettingsPage } from '../hooks/useSettingsPage'
import { settingsStrings } from '../strings'
import { AllowlistPanel } from './AllowlistPanel'
import { DateAttendancePanel } from './DateAttendancePanel'
import { HouseholdSettingsForm } from './HouseholdSettingsForm'
import { MealSlotEditor } from './MealSlotEditor'
import { MealSlotList } from './MealSlotList'
import { MemberEditor } from './MemberEditor'
import { MemberList } from './MemberList'
import { PreferencesForm } from './PreferencesForm'
import '../settings.css'

/** The /settings screen: heading "Settings" and a BentoGrid of tiles titled Household, Members, Meal Slots,
 *  Allowlist (Admins only) and Your preferences. Data comes from the settings hooks. */
export function SettingsPage() {
  const page = useSettingsPage()
  const { household, members, slots, preferences, isAdmin } = page

  return (
    <div className="settings">
      <h1 className="settings__title">{settingsStrings.title}</h1>
      <BentoGrid columns={2}>
        <Tile size="full" as="section">
          <h2 className="settings__tile-title">{settingsStrings.household}</h2>
          {household.settings ? (
            <HouseholdSettingsForm
              key={JSON.stringify(household.settings)}
              value={household.settings}
              canEdit={isAdmin}
              saving={household.saving}
              suggestedTimeZone={page.suggestedTimeZone}
              onSave={page.saveHousehold}
            />
          ) : (
            <p>{household.isError ? settingsStrings.loadError : settingsStrings.loading}</p>
          )}
        </Tile>

        <Tile size="full" as="section">
          <h2 className="settings__tile-title">{settingsStrings.members}</h2>
          <MemberList
            members={members.members}
            canEdit={isAdmin}
            linkedUserNames={page.linkedUserNames}
            onAdd={page.member.add}
            onEdit={page.member.edit}
          />
        </Tile>

        <Tile size="full" as="section">
          <h2 className="settings__tile-title">{settingsStrings.mealSlots}</h2>
          <MealSlotList
            slots={slots.slots}
            members={members.members}
            canEdit={isAdmin}
            onAdd={page.slot.add}
            onEdit={page.slot.edit}
            onEditDate={page.date.open}
          />
        </Tile>

        {isAdmin ? (
          <Tile size="full" as="section">
            <h2 className="settings__tile-title">{settingsStrings.allowlist}</h2>
            <AllowlistPanel
              users={page.allowlist.users}
              currentUserId={page.currentUserId}
              error={page.allowlistActions.error}
              onAdd={page.allowlistActions.add}
              onSetAdmin={page.allowlistActions.setAdmin}
              onRemove={page.allowlistActions.remove}
            />
          </Tile>
        ) : null}

        <ShopsSettingsLink />
        <PlanningSettingsLink />
        <NotificationSettingsLink />

        <Tile size="full" as="section">
          <h2 className="settings__tile-title">{settingsStrings.preferences}</h2>
          <PreferencesForm
            key={JSON.stringify(preferences.preferences)}
            value={preferences.preferences}
            saving={preferences.saving}
            onSave={page.savePreferences}
          />
        </Tile>
      </BentoGrid>

      <MemberEditor
        open={page.member.editor !== null}
        member={page.member.editor?.item}
        users={page.allowlist.users}
        saving={members.saving}
        error={page.member.error}
        onSave={page.member.save}
        onDelete={page.member.remove}
        onClose={page.member.close}
      />
      <MealSlotEditor
        open={page.slot.editor !== null}
        slot={page.slot.editor?.item}
        members={members.members}
        saving={slots.saving}
        error={page.slot.error}
        onSave={page.slot.save}
        onDelete={page.slot.remove}
        onClose={page.slot.close}
      />
      {page.date.editor ? (
        <DateAttendancePanel
          open
          slot={page.date.editor.slot}
          date={page.date.editor.date}
          attendance={page.attendance.attendance}
          members={members.members}
          saving={page.attendance.saving}
          onChangeDate={page.date.changeDate}
          onSave={page.date.save}
          onReset={page.date.reset}
          onClose={page.date.close}
        />
      ) : null}
    </div>
  )
}
