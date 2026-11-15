import { BentoGrid } from '../../../ui'
import { SkeletonBlock, SkeletonGroup, SkeletonTile } from '../../../ui/Skeleton'

/** B9-20 (RES-02): the Recipes list while it first loads, in its final shape: RecipeTiles (photo, name, meta, two chip rows). */
export function RecipesSkeleton({ label, count = 6 }: { label: string; count?: number }) {
  return (
    <SkeletonGroup label={label}>
      <BentoGrid min="card">
        {Array.from({ length: count }, (_, i) => (
          <SkeletonTile key={i} media className="recipe-tile-skeleton">
            <SkeletonBlock variant="title" />
            <SkeletonBlock variant="meta" />
            <SkeletonBlock variant="line" />
            <SkeletonBlock variant="line" />
          </SkeletonTile>
        ))}
      </BentoGrid>
    </SkeletonGroup>
  )
}
