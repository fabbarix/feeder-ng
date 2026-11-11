import { Icon, Tile } from '../../../ui'
import { raStrings } from '../strings'
import '../recipe-assistant.css'

/** The server has no FEEDER_SECRET_KEY: says who sets it and where to read more. Announced; everything else is unavailable. */
export function SecretKeyMissingTile() {
  return (
    <Tile variant="status" status="spoil" span="full" role="status">
      <p className="ra__line">
        <Icon name="warning" size={20} />
        <span>
          {raStrings.secretKeyBefore}
          {/* TODO(WP-F): link "deploy guide" to its page in the app once it exists (the old /docs/deploy target was dead). */}
          {raStrings.deployGuide}.
        </span>
      </p>
    </Tile>
  )
}
