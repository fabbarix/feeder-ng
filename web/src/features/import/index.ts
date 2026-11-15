import type { FeatureModule } from '../../app/features'
import { appPhotoStore } from './lib/photoStoreIdb'
import { stopWriters } from './lib/photoStore'
import { lazyScreen } from '../../app/lazyScreen'

// Reached from the Recipes screen (RecipeFileActions); no nav item of its own.
const feature: FeatureModule = {
  routes: [
    { path: '/recipes/import', element: lazyScreen(() => import('./screens/ImportScreen'), 'ImportScreen') },
    { path: '/recipes/export', element: lazyScreen(() => import('./screens/ExportScreen'), 'ExportScreen') },
  ],
}

export const routes = feature.routes

/** Empties the photos kept on the device for a photo read (AppRoot calls it on sign-out). In-flight writes of a mounted read stop first. */
export async function forgetStoredPhotos(): Promise<void> {
  await stopWriters()
  await appPhotoStore().clear()
}
