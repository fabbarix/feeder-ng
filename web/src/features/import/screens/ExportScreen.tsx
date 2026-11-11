import type { ReactNode } from 'react'
import { useBreadcrumbs } from '../../../app/useBreadcrumbs'
import { ErrorState, PageHeader, Skeleton } from '../../../ui'
import { ExportPicker } from '../components/ExportPicker'
import { useExportPicker } from '../hooks/useExportPicker'
import { importStrings as s } from '../strings'
import '../import.css'

/** Route /recipes/export: the ExportPicker fed by useExportPicker, with loading and error states. */
export function ExportScreen(): ReactNode {
  const p = useExportPicker()
  return (
    <section className="import-screen">
      <PageHeader title={s.exportTitle} breadcrumbs={useBreadcrumbs()} />
      {p.isLoading ? <Skeleton variant="row" count={5} /> : null}
      {p.error ? <ErrorState message={p.error.message} /> : null}
      {!p.isLoading && !p.error ? (
        <ExportPicker recipes={p.recipes} selected={p.selected} onToggle={p.toggle} onSelectAll={p.selectAll} onClear={p.clear} href={p.href} />
      ) : null}
    </section>
  )
}
