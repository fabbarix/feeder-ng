import { BackLink, PageHeader } from '../../../ui'

/** The title row of a Settings sub-page: its h1 and a way back to the Settings index. */
export function SettingsHeader({ title }: { title: string }) {
  return <PageHeader title={title} leading={<BackLink to="/settings" label="Settings" />} />
}
