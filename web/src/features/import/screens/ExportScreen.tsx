import type { ReactNode } from 'react'
import { Tile } from '../../../ui'
import { ExportPicker } from '../components/ExportPicker'
import { useExportPicker } from '../hooks/useExportPicker'
import { importStrings as s } from '../strings'

/** Route /recipes/export: ExportPicker fed by useExportPicker, with loading and error states. */
export function ExportScreen(): ReactNode {
  const p = useExportPicker()
  return (
    <main>
      <h1>{s.exportTitle}</h1>
      {p.isLoading ? <p>{s.loading}</p> : null}
      {p.error ? <Tile tone="spoil" role="alert" as="section"><p>{p.error.message}</p></Tile> : null}
      {!p.isLoading && !p.error ? (
        <ExportPicker
          recipes={p.recipes}
          selected={p.selected}
          onToggle={p.toggle}
          onSelectAll={p.selectAll}
          onClear={p.clear}
          href={p.href}
        />
      ) : null}
    </main>
  )
}
