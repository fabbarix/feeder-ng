import { Button, Muted, SectionTitle, Tile } from '../../../ui'
import { FormError } from '../../../ui/fields/FormError'
import { errorText } from '../../products/lib/productForm'
import { useSaveHere } from '../hooks/useSaveHere'
import { strings } from '../strings'
import type { ShopLocation } from '../types'
import { LocationStatus } from './LocationStatus'

export interface ShopLocationTileProps {
  location: ShopLocation | null | undefined
  onSave: (location: ShopLocation) => Promise<void>
}

/** The Shop Location tile, full width and short (no half-width orphan beside the full-width tiles): saved or not, and "Save my current location" for any User standing in the Shop. */
export function ShopLocationTile({ location, onSave }: ShopLocationTileProps) {
  const here = useSaveHere(onSave)
  return (
    <Tile as="section" span="full" aria-label={strings.locationTitle}>
      <SectionTitle>{strings.locationTitle}</SectionTitle>
      <Muted>{location ? strings.locationSaved : strings.locationNone}</Muted>
      {here.status !== 'idle' ? <LocationStatus status={here.status} position={here.position} failure={here.failure} onRetry={here.saveHere} /> : null}
      <FormError>{here.error ? errorText(here.error) : null}</FormError>
      <Button variant="secondary" onClick={here.saveHere} loading={here.saving || here.status === 'locating'}>
        {strings.saveLocationHere}
      </Button>
    </Tile>
  )
}
