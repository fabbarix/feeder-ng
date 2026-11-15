import { useId, useState, type ReactNode } from 'react'
import { Icon, ListGroup, ListRow, Tile } from '../../../ui'
import { displayName } from '../../ingredients/lib/names'
import { exactMatches, ingredientQuestionCount, openPromptFor, orderIngredientRows, orphanPrompts } from '../lib/reviewSummary'
import { importStrings as s } from '../strings'
import type { BaseUnit, IngredientMatch, Plan, UnitPrompt } from '../types'
import { IngredientMatchRow } from './IngredientMatchRow'

export interface IngredientMatchListProps {
  plan: Plan
  onUseExisting: (key: string, ingredientId: number) => void
  onCreate: (key: string, opts?: { name?: string; baseUnit?: BaseUnit }) => void
  onAnswerConversion: (key: string, unit: string, toBase: number) => void
}

const t = s.reviewRows

/** A unit question whose Ingredient has no row of its own gets a row named after the Ingredient. */
function promptRow(p: UnitPrompt): IngredientMatch {
  return { name: p.ingredient, key: p.key, status: 'exact', suggestions: [], resolved: true, usedBy: p.usedBy }
}

/**
 * B9-28 (RX-12): the "Ingredients" tile of Import Review. One R-E row per Ingredient, the questions first, then the rest by name; the exact
 * matches close the list in one row ("5 match your Ingredients") that opens to their rows.
 */
export function IngredientMatchList({ plan, onUseExisting, onCreate, onAnswerConversion }: IngredientMatchListProps): ReactNode {
  const headingId = useId()
  const [showExact, setShowExact] = useState(false)
  const exact = exactMatches(plan)
  const row = (m: IngredientMatch, prompt = openPromptFor(plan, m.key)) => (
    <IngredientMatchRow
      key={m.key}
      match={m}
      prompt={prompt}
      onUseExisting={(id) => onUseExisting(m.key, id)}
      onCreate={(opts) => onCreate(m.key, opts)}
      onAnswerConversion={(unit, toBase) => onAnswerConversion(m.key, unit, toBase)}
    />
  )
  return (
    <Tile as="section" className="ingredient-matches" aria-labelledby={headingId}>
      <div className="import-tile-head">
        <h2 id={headingId}>{s.ingredientsTitle}</h2>
        <span className="import-tile-head__meta">{t.ingredientsMeta(plan.ingredients.length, ingredientQuestionCount(plan))}</span>
      </div>
      <ListGroup label={t.ingredientsList}>
        {orderIngredientRows(plan).map((m) => row(m))}
        {orphanPrompts(plan).map((p) => row(promptRow(p), p))}
        {exact.length > 0 ? (
          <ListRow
            title={t.exactMatches(exact.length)}
            meta={exact.map((m) => displayName(m.name)).join(', ')}
            leading={
              <span className="ingredient-matches__exact-icon">
                <Icon name="success" size={24} />
              </span>
            }
            trailing={
              <span className="import-caret" aria-hidden="true">
                <Icon name="chevron" size={20} />
              </span>
            }
            expanded={showExact}
            onToggle={() => setShowExact((on) => !on)}
            panel={
              <ul className="ingredient-matches__exact" aria-label={t.exactMatches(exact.length)}>
                {exact.map((m) => row(m))}
              </ul>
            }
            data-row="exact"
          />
        ) : null}
      </ListGroup>
    </Tile>
  )
}
