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
          {/* TODO(release team): link "deploy guide" once they define where the deploy docs are served (docs/dev/deploy.md is not served by the app; the old /docs/deploy target was dead). */}
          {raStrings.deployGuide}.
        </span>
      </p>
    </Tile>
  )
}
