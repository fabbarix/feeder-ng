import { createElement } from 'react'
import type { FeatureModule } from '../../app/features'
import { ExportScreen } from './screens/ExportScreen'
import { ImportScreen } from './screens/ImportScreen'
import { appPhotoStore } from './lib/photoStoreIdb'
import { stopWriters } from './lib/photoStore'

// Reached from the Recipes screen (RecipeFileActions); no nav item of its own.
const feature: FeatureModule = {
  routes: [
    { path: '/recipes/import', element: createElement(ImportScreen) },
    { path: '/recipes/export', element: createElement(ExportScreen) },
  ],
}

export const routes = feature.routes

/** Empties the photos kept on the device for a photo read (AppRoot calls it on sign-out). In-flight writes of a mounted read stop first. */
export async function forgetStoredPhotos(): Promise<void> {
  await stopWriters()
  await appPhotoStore().clear()
}
