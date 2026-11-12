import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useBreadcrumbs } from '../../../app/useBreadcrumbs'
import { BentoGrid, EmptyState, ErrorState, PageHeader } from '../../../ui'
import { CouldntPlanExclusionSummary } from '../components/CouldntPlanExclusionSummary'
import { CouldntPlanExclusionTile } from '../components/CouldntPlanExclusionTile'
import { useCouldntExclusions } from '../hooks/useCouldntExclusions'
import { useExplanationExpansion } from '../hooks/useExplanationExpansion'
import { planStrings as s } from '../strings'
import '../plan.css'

/**
 * Route /plan/couldnt-plan/excluded (rx-pt.md section 4): the Exclusions that left each Course empty, one Tile per
 * explanation, each with the links to change it. Open to every User. Composition only: data and grouping are in the hooks and lib.
 */
export function CouldntPlanExclusionsScreen(): ReactNode {
  const breadcrumbs = useBreadcrumbs()
  const { hash } = useLocation()
  const exclusions = useCouldntExclusions()
  const expansion = useExplanationExpansion(exclusions.groups, hash)
  const header = <PageHeader title={s.couldntExclusions.title} breadcrumbs={breadcrumbs} />

  if (exclusions.failed) {
    return (
      <div className="plan">
        {header}
        <ErrorState message={s.couldntExclusions.failed} onRetry={() => void exclusions.refetch()} retryLabel={s.couldntExclusions.tryAgain} />
      </div>
    )
  }
  if (exclusions.isLoading) {
    return (
      <div className="plan">
        {header}
        <p className="plan__muted">{s.couldntExclusions.loading}</p>
      </div>
    )
  }
  if (exclusions.groups.length === 0 || exclusions.headline === null) {
    return (
      <div className="plan">
        {header}
        <EmptyState
          title={s.couldntExclusions.emptyTitle}
          action={
            <Link className="button" data-variant="tertiary" data-size="sm" to="/plan">
              {s.couldntExclusions.openPlan}
            </Link>
          }
        />
      </div>
    )
  }
  return (
    <div className="plan plan-exclusions">
      {header}
      <BentoGrid>
        <CouldntPlanExclusionSummary headline={exclusions.headline} />
        {exclusions.groups.map((group) => (
          <CouldntPlanExclusionTile
            key={group.key}
            group={group}
            expanded={expansion.isOpen(group.key)}
            onToggle={() => expansion.toggle(group.key)}
            focusId={expansion.targetId}
          />
        ))}
      </BentoGrid>
    </div>
  )
}
