import { useId, useRef, useState, type ReactNode } from 'react'
import { Button, Icon } from '../../../ui'
import { useIsClamped } from '../../../ui/useIsClamped'
import { sourceLine, type SourceLine } from '../lib/sourceLine'
import { recipeStrings } from '../strings'
import type { RecipeSource } from '../types'

export interface RecipeAboutProps {
  description: string
  source: RecipeSource
}

/**
 * RX-05: the lede of Recipe detail, under the PageHeader and not in a Tile: the description (clamped; "Show more" only when the clamp
 * cuts it) and, on the same wrapping row, the Source line. Nothing at all when the Recipe has neither.
 */
export function RecipeAbout({ description, source }: RecipeAboutProps): ReactNode {
  const text = description.trim()
  const line = sourceLine(source)
  const textRef = useRef<HTMLParagraphElement>(null)
  const textId = useId()
  const [expanded, setExpanded] = useState(false)
  const clamped = useIsClamped(textRef, [text, expanded])
  if (!text && !line) return null
  const t = recipeStrings.about
  // Once open, the text fits its box and no longer reads as clamped: the button stays, so it can close again.
  const showToggle = text !== '' && (clamped || expanded)
  return (
    <div className="recipe-about">
      {text ? (
        <p ref={textRef} id={textId} className="recipe-about__text" data-expanded={expanded ? 'true' : 'false'}>
          {text}
        </p>
      ) : null}
      {showToggle || line ? (
        <div className="recipe-about__row">
          {showToggle ? (
            <Button variant="secondary" size="sm" aria-expanded={expanded} aria-controls={textId} onClick={() => setExpanded((v) => !v)}>
              {expanded ? t.showLess : t.showMore}
            </Button>
          ) : null}
          {line ? <SourceText line={line} /> : null}
        </div>
      ) : null}
    </div>
  )
}

/**
 * "Source: Nonna Lucia · example.test ↗": the attribution, then the host as a link that opens in a new tab. An address that is not
 * http(s) is plain text in the same place (ruling 4): never a link, never run. The words are text of one element, so they read as one line.
 */
function SourceText({ line }: { line: SourceLine }): ReactNode {
  const t = recipeStrings.about
  const sep = line.attribution && (line.link || line.address) ? ' · ' : null
  return (
    <p className="recipe-source">
      <Icon name="link" size={16} />
      <span>
        {`${t.source} `}
        {line.attribution}
        {sep}
        {line.link ? (
          <a className="text-link" href={line.link.href} target="_blank" rel="noopener noreferrer" aria-label={t.sourceLink(line.link.host)}>
            {line.link.host}
            <Icon name="external" size={14} />
          </a>
        ) : line.address ? (
          <span className="recipe-source__url">{line.address}</span>
        ) : null}
      </span>
    </p>
  )
}
