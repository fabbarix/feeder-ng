import type { ReactNode } from 'react'
import type { ReadAvailability } from '../lib/readAvailability'
import type { UseRecipeRead } from '../hooks/useRecipeRead'

export interface ReadRecipeStepProps {
  read: UseRecipeRead
  availability: ReadAvailability & { retry?: () => void }
}

/**
 * Step 1 of the import: "Read a recipe" (docs/dev/design/ra-e-import.md section 6). A Tile with the Segmented input choice
 * (Web page, Text, Photo), its panel, the Read button, the progress while a read runs, the error tile after a failure,
 * and the disabled reason when the feature is off. Renders and wires; the work is in useRecipeRead and lib/. TODO(ra-e developer).
 */
export function ReadRecipeStep(props: ReadRecipeStepProps): ReactNode {
  void props
  return null
}
