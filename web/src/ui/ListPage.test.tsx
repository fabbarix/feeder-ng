// IH: ListPage puts the header, the search, the filters and the list in separate slots, in that order.
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ListPage } from './ListPage'

describe('ListPage', () => {
  it('renders .list-page with header, search, filters and list slots in order', () => {
    const { container } = render(
      <ListPage header={<h1>Ingredients</h1>} search={<input aria-label="Search" />} filters={<button>All</button>}>
        <ul><li>Flour</li></ul>
      </ListPage>,
    )
    const root = container.querySelector('.list-page')!
    expect(root).not.toBeNull()
    const slots = Array.from(root.children).map((c) => c.className)
    expect(slots).toEqual(['list-page__header', 'list-page__search', 'list-page__filters', 'list-page__list'])
    expect(root.querySelector('.list-page__header')).toContainElement(screen.getByRole('heading', { name: 'Ingredients' }))
    expect(root.querySelector('.list-page__list')).toHaveTextContent('Flour')
  })

  it('renders no wrapper for a slot that is not given', () => {
    const { container } = render(<ListPage header={<h1>Shops</h1>}><p>body</p></ListPage>)
    expect(container.querySelector('.list-page__search')).toBeNull()
    expect(container.querySelector('.list-page__filters')).toBeNull()
    expect(container.querySelector('.list-page__list')).toHaveTextContent('body')
  })
})
