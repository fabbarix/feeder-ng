import { ListGroup, ListRow, PageHeader } from '../../../ui'
import { useMe } from '../../../app/useMe'
import { settingsGroups } from '../lib/settingsSections'
import { settingsStrings } from '../strings'
import '../settings.css'

/** /settings: the Settings index. Rows (icon, title, one line of meta, chevron) grouped as Household, You and Admin;
 *  each row opens its own sub-page. No forms here. */
export function SettingsIndexPage() {
  const isAdmin = Boolean(useMe().data?.isAdmin)
  const groups = settingsGroups(isAdmin)
  return (
    <div className="settings">
      <PageHeader title={settingsStrings.index.title} />
      {groups.map((group) => (
        <section key={group.id} className="settings__group">
          <h2 className="settings__overline">{group.title}</h2>
          <ListGroup label={group.title}>
            {group.sections.map((s) => (
              <ListRow key={s.id} title={s.title} meta={s.meta} icon={s.icon} chevron href={s.path} aria-label={s.title} />
            ))}
          </ListGroup>
        </section>
      ))}
    </div>
  )
}
