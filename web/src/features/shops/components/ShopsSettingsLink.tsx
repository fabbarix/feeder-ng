import { Link } from 'react-router-dom'
import { Tile } from '../../../ui'
import { strings } from '../strings'
import '../../products/products.css'

/** A Tile linking to /settings/shops, to be embedded in the Settings page (integration point for the household feature). */
export function ShopsSettingsLink() {
  return (
    <Tile as="section" size="full" aria-label={strings.shopsTitle}>
      <h2 className="pg__tile-title">
        <Link to="/settings/shops">{strings.shopsTitle}</Link>
      </h2>
      <p className="pg__muted">{strings.settingsLinkHint}</p>
    </Tile>
  )
}
