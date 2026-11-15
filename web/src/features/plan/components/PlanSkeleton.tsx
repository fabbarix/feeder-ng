import { BentoGrid } from '../../../ui'
import { SkeletonBlock, SkeletonGroup, SkeletonTile } from '../../../ui/Skeleton'
import './PlanSkeleton.css'

/**
 * B9-20 (RES-02): the week while it first loads, in its final shape: day Tiles of a title and three Meal Slots, the last
 * with two Courses (a typical day; measured against the loaded plan at 375 and 1440 px).
 */
export function PlanSkeleton({ label, days = 3 }: { label: string; days?: number }) {
  return (
    <SkeletonGroup label={label}>
      <BentoGrid min="day">
        {Array.from({ length: days }, (_, i) => (
          <SkeletonTile key={i} className="plan-day-skeleton">
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
        ))}
      </BentoGrid>
    </SkeletonGroup>
  )
}
