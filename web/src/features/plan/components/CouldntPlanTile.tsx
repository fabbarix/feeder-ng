import type { ReactNode } from 'react'
import { Button, Icon } from '../../../ui'
import type { NoticeGroup } from '../hooks/useCouldntPlanNotice'
import { planStrings as s } from '../strings'
import '../plan.css'

export interface CouldntCauseRowProps {
  group: NoticeGroup
  onFix: () => void
}

/**
 * B9-32 (PC-07): one compact row of the Couldn't plan tile, a group named by its title: the cause icon (info, or warn for
 * a rule conflict), "7 Desserts", the cause in one sentence, and one fix button. Below 22 rem of tile width the fix drops
 * under the text (plan.css).
 */
export function CouldntCauseRow({ group, onFix }: CouldntCauseRowProps): ReactNode {
  return (
    <div className="couldnt-cause" role="group" aria-label={group.title} data-tone={group.tone} data-cause={group.cause}>
      <span className="couldnt-cause__icon">
        <Icon name={group.icon} size={24} />
      </span>
      <div className="couldnt-cause__text">
        <p className="couldnt-cause__title">{group.title}</p>
        <p className="couldnt-cause__meta">{group.canFix ? group.meta : `${group.meta} ${s.couldntAskAdmin}`}</p>
      </div>
      {group.canFix ? (
        <Button variant="secondary" size="sm" onClick={onFix}>
          {group.fix.label}
        </Button>
      ) : null}
    </div>
  )
}
