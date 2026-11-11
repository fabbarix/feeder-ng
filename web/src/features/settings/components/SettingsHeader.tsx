import { useBreadcrumbs } from '../../../app/useBreadcrumbs'
import { PageHeader } from '../../../ui'

/** The title row of a Settings sub-page: its h1 and its Breadcrumbs trail (Settings > title). */
export function SettingsHeader({ title }: { title: string }) {
  return <PageHeader title={title} breadcrumbs={useBreadcrumbs()} />
}
