// WP-E: the chips above an adopted review (ai-recipe-import.md section 5.2).
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ReadNote } from './ReadNote'

describe('ReadNote', () => {
  it('says which model read the recipe', () => {
    render(<ReadNote note={{ modelName: 'Claude Haiku 5.5', structuredData: false }} />)
    expect(screen.getByText('Read by Claude Haiku 5.5')).toBeInTheDocument()
    expect(screen.queryByText(/recipe data was used as a hint/)).toBeNull()
  })
  it('for a page with recipe data, says it was used as a hint', () => {
    render(<ReadNote note={{ modelName: 'Claude Haiku 5.5', structuredData: true }} />)
    expect(screen.getByText("The page's recipe data was used as a hint")).toBeInTheDocument()
  })
  it('without a model name it still says it was read by the Recipe Assistant', () => {
    render(<ReadNote note={{ structuredData: false }} />)
    expect(screen.getByText('Read by the Recipe Assistant')).toBeInTheDocument()
  })
})
