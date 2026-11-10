import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ErrorState, IconButton, PageHeader } from '../../../ui'
import { ExportPicker } from '../components/ExportPicker'
import { useExportPicker } from '../hooks/useExportPicker'
import { importStrings as s } from '../strings'
import '../import.css'

/** Route /recipes/export: the ExportPicker fed by useExportPicker, with loading and error states. */
export function ExportScreen(): ReactNode {
  const navigate = useNavigate()
  const p = useExportPicker()
  return (
    <section className="import-screen">
      <PageHeader title={s.exportTitle} leading={<IconButton icon="back" label={s.back} onClick={() => navigate('/recipes')} />} />
      {p.isLoading ? <p>{s.loading}</p> : null}
      {p.error ? <ErrorState message={p.error.message} /> : null}
      {!p.isLoading && !p.error ? (
        <ExportPicker recipes={p.recipes} selected={p.selected} onToggle={p.toggle} onSelectAll={p.selectAll} onClear={p.clear} href={p.href} />
      ) : null}
    </section>
  )
}
