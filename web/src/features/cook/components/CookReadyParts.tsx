// B9-45 (PC-05): the Ingredients list as Cook Mode places it while cooking: in the rail from 64 em ("Ingredients", under the timers)
// and in a sheet below that (the Ingredients button). Composition only; hooks/useCookReady holds the state.
import type { ReactNode } from 'react'
import type { CookReady } from '../hooks/useCookReady'
import { cookStrings } from '../strings'
import { IngredientsSheet } from './IngredientsSheet'
import { ReadyList } from './ReadyList'

/** The rail's Ingredients section (the rail's aside is then "Timers and Ingredients"). */
export function RailIngredients({ ready }: { ready: CookReady }): ReactNode {
  return (
    <section className="cook-rail__ingredients get-ready" aria-label={cookStrings.ingredients}>
      <h2 className="cook-timers__heading">{cookStrings.ingredients}</h2>
      <p className="get-ready__meta">{ready.list.meta}</p>
      <ReadyList sections={ready.list.sections} ticked={ready.ticks.ticked} onToggle={ready.ticks.toggle} />
    </section>
  )
}

export function CookIngredientsSheet({ ready }: { ready: CookReady }): ReactNode {
  return (
    <IngredientsSheet
      open={ready.sheetOpen}
      onClose={ready.closeSheet}
      context={ready.list.context}
      meta={ready.list.meta}
      sections={ready.list.sections}
      ticked={ready.ticks.ticked}
      onToggle={ready.ticks.toggle}
    />
  )
}
