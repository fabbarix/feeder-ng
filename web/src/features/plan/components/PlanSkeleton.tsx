import type { CSSProperties } from 'react'
import { BentoGrid } from '../../../ui'
import { SkeletonBlock, SkeletonGroup, SkeletonTile } from '../../../ui/Skeleton'
import { usePlanGrid } from '../hooks/usePlanGrid'
import '../plan.css'
import './PlanSkeleton.css'

/**
 * B9-20 (RES-02): the week while it first loads, in its final shape: day Tiles of a title and three Meal Slots, the last
 * with two Courses (a typical day; measured against the loaded plan at 375 and 1440 px).
 * w4d review (CLS): the tiles sit in PlanGrid's own measured container and placement (the same columns and spans for the week's
 * 7 days), so the day tiles that replace them land where they were and nothing moves.
 */
export function PlanSkeleton({ label, days = 7 }: { label: string; days?: number }) {
  const { ref, columns, spans } = usePlanGrid(days)
  return (
    <SkeletonGroup label={label}>
      <div className="plan-grid" ref={ref} data-columns={columns}>
        <BentoGrid min="day">
          {Array.from({ length: days }, (_, i) => (
            <div key={i} className="plan-day-skeleton__cell" style={{ gridColumn: `span ${spans[i]}` } as CSSProperties}>
              <SkeletonTile className="plan-day-skeleton">
                <SkeletonBlock variant="title" />
                {[1, 1, 2].map((courses, slot) => (
                  <span key={slot} className="plan-day-skeleton__meal">
                    <SkeletonBlock variant="meta" />
                    {Array.from({ length: courses }, (_, c) => (
                      <SkeletonBlock key={c} variant="row" />
                    ))}
                  </span>
                ))}
              </SkeletonTile>
            </div>
          ))}
        </BentoGrid>
      </div>
    </SkeletonGroup>
  )
}
