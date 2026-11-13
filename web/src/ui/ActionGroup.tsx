import { Button } from './Button'
import { Menu, type MenuItem } from './Menu'
import type { IconName } from './icons'
import './ActionGroup.css'

/** One button of the group: the primary (filled) or the secondary. */
export interface ActionGroupButton {
  label: string
  icon?: IconName
  disabled?: boolean
  onClick: () => void
}

export interface ActionGroupProps {
  /** Names the group and its ⋮ Menu ("More for <label>"): the row or tile it belongs to, e.g. "Thu Dinner". */
  label: string
  /** The one filled action of the group. */
  primary?: ActionGroupButton
  /** The one outlined action of the group. */
  secondary?: ActionGroupButton
  /** Everything else (rare or destructive actions), in the ⋮ Menu. */
  more?: MenuItem[]
}

/**
 * The actions of a row or tile (docs/design/system.md 5): at most one primary, one secondary and a ⋮ Menu. It sits at the end
 * of its row when the host is wide; on a narrow host it takes its own line as equal tracks and never wraps raggedly.
 */
export function ActionGroup({ label, primary, secondary, more }: ActionGroupProps) {
  const hasMore = Boolean(more && more.length > 0)
  return (
    <div className="action-group-host">
      <div className="action-group" role="group" aria-label={label} data-more={hasMore ? 'true' : undefined}>
        {primary ? (
          <Button variant="primary" size="md" icon={primary.icon} disabled={primary.disabled} onClick={primary.onClick}>
            {primary.label}
          </Button>
        ) : null}
        {secondary ? (
          <Button variant="secondary" size="md" icon={secondary.icon} disabled={secondary.disabled} onClick={secondary.onClick}>
            {secondary.label}
          </Button>
        ) : null}
        {hasMore ? <Menu label={`More for ${label}`} items={more!} /> : null}
      </div>
    </div>
  )
}
