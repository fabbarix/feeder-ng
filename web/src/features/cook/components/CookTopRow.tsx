import type { ReactNode } from 'react'
import { Button } from '../../../ui'
import { cookStrings } from '../strings'
import { VoiceToggle } from './VoiceToggle'

export interface CookTopRowProps {
  /** Kept for callers; the Step count lives in the Step tile's overline since B9-40 (PC-03), so the row shows no count. */
  number?: number
  of?: number
  /** B9-40 (PC-03): opens the Ingredients list; the Ingredients button is drawn only with it. */
  onIngredients?: () => void
  speechSupported: boolean
  voiceOn: boolean
  onVoiceChange: (on: boolean) => void
  onExit: () => void
}

/**
 * The top row of Cook Mode (PC-03): a secondary "Exit" Button with the X icon, then at the row's end Ingredients (a secondary
 * Button, icon-only below 37.5 em; its name stays "Ingredients") and the circular voice `VoiceToggle`. DOM order is Exit,
 * Ingredients, Voice; short landscape (SHORT-01) places them in its grid through `.cook-ingredients` and `.cook-voice`.
 * Renders only.
 */
export function CookTopRow({ onIngredients, speechSupported, voiceOn, onVoiceChange, onExit }: CookTopRowProps): ReactNode {
  return (
    <div className="cook-top">
      <Button variant="secondary" size="md" icon="exit" className="cook-exit" onClick={onExit}>
        {cookStrings.exit}
      </Button>
      {onIngredients ? (
        <Button variant="secondary" size="md" icon="ingredients" className="cook-ingredients" aria-label={cookStrings.ingredients} onClick={onIngredients}>
          <span className="cook-ingredients__label">{cookStrings.ingredients}</span>
        </Button>
      ) : null}
      <VoiceToggle className="cook-voice" supported={speechSupported} enabled={voiceOn} onChange={onVoiceChange} />
    </div>
  )
}
