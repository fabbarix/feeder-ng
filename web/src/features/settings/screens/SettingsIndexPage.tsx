import { ListGroup, ListRow, PageHeader } from '../../../ui'
import { useMe } from '../../../app/useMe'
import { AccessBadge, useAccessBadge } from '../../access'
import { settingsGroups } from '../lib/settingsSections'
import { settingsStrings } from '../strings'
import '../settings.css'

/** /settings: the Settings index. Rows (icon, title, one line of meta, chevron) grouped as Catalogue, Household and You;
 *  each row opens its own sub-page. No forms here. */
export function SettingsIndexPage() {
  const isAdmin = Boolean(useMe().data?.isAdmin)
  const waiting = useAccessBadge()
  const groups = settingsGroups(isAdmin)
  return (
    <div className="settings">
      <PageHeader title={settingsStrings.index.title} />
      {groups.map((group) => (
        <section key={group.id} className="settings__group">
          {/* The Overline look on a real h2: the group titles stay headings for screen-reader navigation (Overline renders only p or span). */}
          <h2 className="overline">{group.title}</h2>
          <ListGroup label={group.title}>
            {group.sections.map((s) => (
              <ListRow key={s.id} title={s.title} meta={s.meta} metaLines={2} icon={s.icon} chevron href={s.path} aria-label={s.id === 'accessRequests' && waiting > 0 ? settingsStrings.index.rowWithCount(s.title, waiting) : s.title} trailing={s.id === 'accessRequests' ? <AccessBadge count={waiting} /> : undefined} />
            ))}
          </ListGroup>
        </section>
      ))}
    </div>
  )
}
