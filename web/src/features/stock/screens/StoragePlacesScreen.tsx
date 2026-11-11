import { useState, type ReactElement } from 'react'
import { useBreadcrumbs } from '../../../app/useBreadcrumbs'
import { Button, EmptyState, ListGroup, ListPage, ListRow, PageHeader, useConfirm, useToast } from '../../../ui'
import { StoragePlaceSheet } from '../components/StoragePlaceSheet'
import { useStoragePlaces } from '../hooks/useStoragePlaces'
import { stockStrings as strings } from '../strings'
import type { StoragePlace } from '../types'

const KIND_ICON = { pantry: 'stock', fridge: 'fridge', freezer: 'freezer' } as const

/** /settings/storage-places: every Storage Place (kind icon, "Pantry · Default"), and any User adds, edits or deletes one. */
export function StoragePlacesScreen(): ReactElement {
  const breadcrumbs = useBreadcrumbs()
  const places = useStoragePlaces()
  const dialogs = useConfirm()
  const toast = useToast()
  const [editing, setEditing] = useState<StoragePlace | 'new' | null>(null)

  const remove = async (place: StoragePlace) => {
    const answer = await dialogs.choose({ title: strings.places.deleteTitle(place.name), body: strings.places.deleteBody, confirmLabel: strings.places.delete, tone: 'danger' })
    if (answer !== 'confirm') return
    setEditing(null)
    try {
      await places.remove(place.id)
    } catch {
      toast.show(strings.actionFailed, { status: 'error' })
    }
  }

  return (
    <ListPage header={<PageHeader title={strings.places.title} breadcrumbs={breadcrumbs} />}>
      <p className="pg__muted">{strings.places.intro}</p>
      {places.isLoading ? (
        <p role="status">{strings.loading}</p>
      ) : places.places.length === 0 ? (
        <EmptyState icon="stock" title={strings.places.empty} description={strings.noPlacesHint} />
      ) : (
        <ListGroup label={strings.places.title}>
          {places.places.map((p) => (
            <ListRow
              key={p.id}
              title={p.name}
              icon={KIND_ICON[p.kind]}
              meta={p.default ? `${strings.kinds[p.kind]} · ${strings.places.defaultMeta}` : strings.kinds[p.kind]}
              chevron
              onActivate={() => setEditing(p)}
            />
          ))}
        </ListGroup>
      )}
      <Button variant="tertiary" icon="add" onClick={() => setEditing('new')}>
        {strings.places.add}
      </Button>
      <StoragePlaceSheet
        editing={editing}
        onClose={() => setEditing(null)}
        onSave={async (input) => {
          if (editing === 'new') await places.create(input)
          else if (editing) await places.update(editing.id, input)
          setEditing(null)
        }}
        onDelete={editing && editing !== 'new' ? () => void remove(editing) : undefined}
      />
    </ListPage>
  )
}
