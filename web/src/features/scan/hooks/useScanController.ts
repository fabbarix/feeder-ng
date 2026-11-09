// Everything the Scan screen needs, composed from the smaller hooks: the Shop's offline bundle (cached in IndexedDB),
// the camera, the detector, the scanner loop, the offline queue and sync, the flow, the live Shopping List and the
// feedback. The screen only renders this view model. Stubs until implemented.
import type { RefObject } from 'react'
import type { ShoppingList } from '../../shop/types'
import type { IngredientChoice } from '../lib/unknownForm'
import type { SyncNotice } from '../lib/notices'
import type { CameraStatus } from './useCamera'
import type { ScanFlow } from './useScanFlow'
import type { UnitSystem } from '../../../lib/units'

export interface ScanControllerOptions {
  mode: 'shop' | 'stocktake'
  /** required in shop mode */
  shop: { id: number; name: string } | null
}

export interface ScanController {
  /** loading the bundle; error when it is neither online nor cached */
  status: 'loading' | 'ready' | 'error'
  error: string | null
  camera: {
    status: CameraStatus
    videoRef: RefObject<HTMLVideoElement | null>
    torchSupported: boolean
    torchOn: boolean
    toggleTorch: () => void
  }
  muted: boolean
  toggleMute: () => void
  /** false on iOS: the beep is the only confirmation */
  canVibrate: boolean
  flow: ScanFlow
  /** the live Shopping List of the Shop (shop mode); undefined in Stock-take */
  list: ShoppingList | undefined
  online: boolean
  pendingCount: number
  notices: SyncNotice[]
  dismissNotice: (clientUuid: string) => void
  ingredients: IngredientChoice[]
  currency: string
  system: UnitSystem
}

export function useScanController(options: ScanControllerOptions): ScanController {
  void options
  throw new Error('not implemented')
}
