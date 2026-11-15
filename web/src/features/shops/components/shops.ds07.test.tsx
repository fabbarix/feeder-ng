// B9-09 (DS-07; B9-DRIFT-W1 items 5 and 7): the Shops components use the type primitives, not the .pg__* classes. A class that sets a size
// and no line-height drifts off the body role; the primitives carry their own line.
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { strings } from '../strings'
import { ShopLocationTile } from './ShopLocationTile'
import { WeightRuleEditor } from './WeightRuleEditor'
import { WeightRuleList } from './WeightRuleList'

const noPg = (root: Element) => root.querySelectorAll('[class*="pg__"], .pg')

describe('Shops components without .pg__* (DS-07)', () => {
  it('the Shop Location tile titles itself with a SectionTitle (h2.section-title) and says its status in Muted (p.muted)', () => {
    const { container } = render(<ShopLocationTile location={null} onSave={vi.fn()} />)
    const title = screen.getByRole('heading', { level: 2, name: strings.locationTitle })
    expect(title).toHaveClass('section-title')
    expect(title).not.toHaveClass('pg__tile-title')
    const status = screen.getByText(strings.locationNone)
    expect(status.tagName).toBe('P')
    expect(status).toHaveClass('muted')
    expect(noPg(container)).toHaveLength(0)
  })

  // B9-30 (ruling 6, SHORT-02): the subheads keep the SectionTitle look but are no longer h3 headings, so a screen reader hears each
  // name once, as the group's name (WeightRuleEditor.b9-30.test.tsx pins the rest).
  it('the weight rule editor\'s "Item code" and "Value" subheads look like a SectionTitle, are visible and not aria-hidden, and name their groups', () => {
    const { container } = render(<WeightRuleEditor currency="USD" onSave={vi.fn()} onCancel={vi.fn()} />)
    for (const name of [strings.itemCodeGroup, strings.valueGroup]) {
      const label = screen.getByText(name)
      expect(label).toHaveClass('section-title')
      expect(label).not.toHaveAttribute('aria-hidden')
      expect(screen.getByRole('group', { name })).toHaveAttribute('aria-labelledby', label.id)
    }
    expect(container.querySelectorAll('.pg__subhead, .pg__stack, .pg__group')).toHaveLength(0)
  })

  it('an empty weight rule list says so in Muted, laid out by a Stack (class stack), with no .pg__*', () => {
    const { container } = render(<WeightRuleList rules={[]} currency="USD" isAdmin onEdit={vi.fn()} onDelete={vi.fn()} onAdd={vi.fn()} />)
    const empty = screen.getByText(strings.noWeightRules)
    expect(empty).toHaveClass('muted')
    expect(container.querySelector('.stack')).not.toBeNull()
    expect(noPg(container)).toHaveLength(0)
  })
})
