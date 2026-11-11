import { Button, Tile } from '../../../ui'
import { errorText } from '../../products/lib/productForm'
import { useSaveHere } from '../hooks/useSaveHere'
import { strings } from '../strings'
import type { ShopLocation } from '../types'
import { LocationStatus } from './LocationStatus'

export interface ShopLocationTileProps {
  location: ShopLocation | null | undefined
  onSave: (location: ShopLocation) => Promise<void>
}

/** The Shop Location tile: saved or not, and "Save my current location" for any User standing in the Shop. */
export function ShopLocationTile({ location, onSave }: ShopLocationTileProps) {
  const here = useSaveHere(onSave)
  return (
    <Tile as="section" span="full" aria-label={strings.locationTitle}>
      <h2 className="pg__tile-title">{strings.locationTitle}</h2>
      <p className="pg__muted">{location ? strings.locationSaved : strings.locationNone}</p>
      {here.status !== 'idle' ? <LocationStatus status={here.status} position={here.position} failure={here.failure} onRetry={here.saveHere} /> : null}
      {here.error ? (
        <p role="alert" className="pg__error">
          {errorText(here.error)}
        </p>
      ) : null}
      <Button variant="tertiary" onClick={here.saveHere} loading={here.saving || here.status === 'locating'}>
        {strings.saveLocationHere}
      </Button>
    </Tile>
  )
}
