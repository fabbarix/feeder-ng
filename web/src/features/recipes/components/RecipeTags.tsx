import type { ReactNode } from 'react'

export interface RecipeTagsProps {
  tags: readonly string[]
  /** Tag spelling => colour id (undefined renders a neutral chip). */
  colourOf?: (name: string) => string | undefined
  /** Show only this many, then a "+N" chip. All when absent. */
  limit?: number
  /** Makes each chip a button; absent = plain chips. */
  onOpen?: (name: string) => void
}

/** TG-RW: a list named "Tags" of Tag chips in their colours; shared by the Recipe tile and the Recipe detail. Nothing for no Tags. */
export function RecipeTags(props: RecipeTagsProps): ReactNode {
  void props
  return null // stub: TG-RW Developer
}
