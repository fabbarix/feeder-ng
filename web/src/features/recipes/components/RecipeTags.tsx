import { useRef, useState, type ReactNode } from 'react'
import { Chip } from '../../../ui'
import { useFittingChips } from '../../../ui/lib/useFittingChips'
import { measureHeroChipLine } from '../lib/heroChipLine'
import { visibleTags } from '../lib/tags'
import { recipeStrings } from '../strings'
import '../recipes-list.css'

export interface RecipeTagsProps {
  tags: readonly string[]
  /** Tag spelling => colour id (undefined renders a neutral chip). */
  colourOf?: (name: string) => string | undefined
  /** Show only this many, then a "+N" chip. All when absent. Not with `fitted`. */
  limit?: number
  /** Makes each chip a button; absent = plain chips. */
  onOpen?: (name: string) => void
  /** RX-04: the hero line's plain chips before the Tags (Archived, Courses, Whole meal, Ready Meal), in one list named "Courses and Tags". Never collapsed. */
  lead?: readonly string[]
  /** RX-04: fit the line to its width; "+N" is a button that opens the whole line in place. */
  fitted?: boolean
}

/**
 * TG-RW: a list named "Tags" of Tag chips in their colours; shared by the Recipe tile and the Recipe detail. Nothing for no Tags.
 * RX-04 (`fitted`): the Recipe detail hero's one chip line, the lead chips first, then the Tags that fit and a "+N" button.
 */
export function RecipeTags(props: RecipeTagsProps): ReactNode {
  if (props.fitted) return <HeroChipLine {...props} />
  const { tags, colourOf, limit, onOpen } = props
  if (tags.length === 0) return null
  const { shown, more } = limit === undefined ? { shown: [...tags], more: 0 } : visibleTags(tags, limit)
  return (
    <ul className="recipe-tags" aria-label={recipeStrings.tagsLabel}>
      {shown.map((name, i) => (
        <li key={`${i}-${name}`}>
          <TagChip name={name} colour={colourOf?.(name)} onOpen={onOpen} />
        </li>
      ))}
      {more > 0 ? (
        <li>
          <span role="img" aria-label={recipeStrings.moreTags(more)}>
            <Chip kind="tag">{`+${more}`}</Chip>
          </span>
        </li>
      ) : null}
    </ul>
  )
}

function TagChip({ name, colour, onOpen }: { name: string; colour?: string; onOpen?: (name: string) => void }): ReactNode {
  return onOpen ? (
    <Chip kind="tag" tagColour={colour} onClick={() => onOpen(name)}>
      {name}
    </Chip>
  ) : (
    <Chip kind="tag" tagColour={colour}>
      {name}
    </Chip>
  )
}

/**
 * The hero line (RX-04, ruling 6): the lead chips never collapse (they wrap to a second line when they alone are too wide); only the Tags
 * collapse into "+N", a button named "Show all 8 Tags" that opens the whole line in place and then reads "Show fewer" (the same button,
 * so focus stays on it). While some Tags are hidden, an inert copy holds every Tag chip at its natural width for the fit.
 */
function HeroChipLine({ tags, colourOf, onOpen, lead = [] }: RecipeTagsProps): ReactNode {
  const line = useRef<HTMLUListElement>(null)
  const [expanded, setExpanded] = useState(false)
  const { visible, hidden } = useFittingChips(line, tags.length, measureHeroChipLine)
  if (tags.length === 0 && lead.length === 0) return null
  const t = recipeStrings.heroChips
  const shown = expanded ? tags : tags.slice(0, visible)
  return (
    <ul ref={line} className="recipe-tags" aria-label={t.label} data-fitted="true" data-expanded={expanded ? 'true' : undefined}>
      {lead.map((name, i) => (
        <li key={`lead-${i}-${name}`} className="recipe-tags__lead">
          <Chip kind="tag">{name}</Chip>
        </li>
      ))}
      {shown.map((name, i) => (
        <li key={`tag-${i}-${name}`} className="recipe-tags__tag">
          <TagChip name={name} colour={colourOf?.(name)} onOpen={onOpen} />
        </li>
      ))}
      {hidden > 0 ? (
        <li key="more" className="recipe-tags__more-item">
          <button
            type="button"
            className="chip recipe-tags__more"
            data-kind="tag"
            aria-expanded={expanded}
            aria-label={expanded ? t.showFewer : t.showAll(tags.length)}
            onClick={() => setExpanded((v) => !v)}
          >
            <span className="chip__label">{expanded ? t.fewer : `+${hidden}`}</span>
          </button>
        </li>
      ) : null}
      {hidden > 0 ? (
        <li className="recipe-tags__measure" aria-hidden="true" inert>
          {tags.map((name, i) => (
            <span key={`${i}-${name}`} className="recipe-tags__measure-tag">
              <Chip kind="tag" tagColour={colourOf?.(name)}>
                {name}
              </Chip>
            </span>
          ))}
          <span className="recipe-tags__measure-more">
            <span className="chip" data-kind="tag">
              <span className="chip__label">{`+${tags.length}`}</span>
            </span>
          </span>
        </li>
      ) : null}
    </ul>
  )
}
