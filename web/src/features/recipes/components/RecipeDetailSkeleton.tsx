import { BentoGrid } from '../../../ui'
import { SkeletonBlock, SkeletonGroup, SkeletonTile } from '../../../ui/Skeleton'
import './RecipeDetailSkeleton.css'

const lines = (n: number, variant: 'line' | 'row' = 'line') => Array.from({ length: n }, (_, i) => <SkeletonBlock key={i} variant={variant} />)

/**
 * B9-20 (RES-02): a Recipe while it first loads, in its final shape (the detail's own layout classes): the hero photo with
 * its chip rows, the two metric Tiles and Ingredients on the side; Steps and preferences in the main column.
 */
export function RecipeDetailSkeleton({ label }: { label: string }) {
  return (
    <SkeletonGroup label={label} className="recipe-detail-skeleton">
      <div className="recipe-detail__layout">
        <div className="recipe-detail__aside">
          <SkeletonTile media className="recipe-detail__hero recipe-detail-skeleton__hero">
            {lines(3)}
          </SkeletonTile>
          <BentoGrid min="card">
            <SkeletonTile className="recipe-detail-skeleton__metric">
              <SkeletonBlock variant="line" />
            </SkeletonTile>
            <SkeletonTile className="recipe-detail-skeleton__metric">
              <SkeletonBlock variant="line" />
            </SkeletonTile>
          </BentoGrid>
          <SkeletonTile>
            <SkeletonBlock variant="title" />
            {lines(5)}
          </SkeletonTile>
        </div>
        <div className="recipe-detail__main">
          <SkeletonTile>
            <SkeletonBlock variant="title" />
            {lines(3)}
            <SkeletonBlock variant="meta" />
          </SkeletonTile>
          <SkeletonTile>
            <SkeletonBlock variant="title" />
            {lines(4, 'row')}
          </SkeletonTile>
        </div>
      </div>
    </SkeletonGroup>
  )
}

/** The header's Edit and More, reserved while the Recipe loads, so the title row keeps its height. */
RecipeDetailSkeleton.Actions = function RecipeDetailSkeletonActions() {
  return (
    <>
      <SkeletonBlock variant="circle" />
      <SkeletonBlock variant="circle" />
    </>
  )
}
