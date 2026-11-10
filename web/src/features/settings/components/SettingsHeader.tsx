import { Link } from 'react-router-dom'
import { PageHeader } from '../../../ui'
import { settingsStrings } from '../strings'

/** The title row of a Settings sub-page: its h1 and a way back to the Settings index. */
export function SettingsHeader({ title }: { title: string }) {
  return <PageHeader title={title} leading={<Link to="/settings">{settingsStrings.backToSettings}</Link>} />
}
