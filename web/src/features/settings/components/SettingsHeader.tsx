import { useBreadcrumbs } from '../../../app/useBreadcrumbs'
import type { ReactNode } from 'react'
import { PageHeader } from '../../../ui'

/** The title row of a Settings sub-page: its h1 and its Breadcrumbs trail (Settings > title), with optional right-aligned `actions` (one primary Button). */
export function SettingsHeader({ title, actions }: { title: string; actions?: ReactNode }) {
  return <PageHeader title={title} breadcrumbs={useBreadcrumbs()} actions={actions} />
}
