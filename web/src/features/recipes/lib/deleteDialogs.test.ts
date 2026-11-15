// SAFE-05 and ruling 3 (main session): the Delete dialogs say what will happen before anything is asked of the server.
import { describe, expect, it } from 'vitest'
import { blockedDialog, deleteDialog } from './deleteDialogs'

describe('deleteDialog', () => {
  it('is the danger dialog with three choices and says it cannot be undone', () => {
    expect(deleteDialog('Roast tray')).toEqual({
      title: 'Delete Roast tray?',
      body: 'Nobody has planned it yet.',
      note: "Nothing else changes. This can't be undone.",
      tone: 'danger',
      confirmLabel: 'Delete',
      alternateLabel: 'Archive instead',
    })
  })
})

describe('blockedDialog', () => {
  it('planned before: why, what Archive does, and Archive as the only action', () => {
    const d = blockedDialog('Roast tray', 'planned')
    expect(d).toEqual({
      title: "Roast tray can't be deleted",
      body: 'It was planned before, so Feeder keeps it in the history of what was Cooked.',
      note: 'Archive takes it out of the Recipes list, the pickers and the plan. You can unarchive it later.',
      confirmLabel: 'Archive',
    })
    expect(d.tone ?? 'default').toBe('default')
    expect(d.alternateLabel).toBeUndefined()
  })
  it('a Base recipe in use: "It is used in N Recipes." and the Recipes as rows, an archived one marked', () => {
    const d = blockedDialog('Béchamel', 'in_use', [{ id: 1, name: 'Lasagne' }, { id: 2, name: 'Moussaka', archived: true }])
    expect(d.title).toBe("Béchamel can't be deleted")
    expect(d.body).toBe('It is used in 2 Recipes.')
    expect(d.groups).toEqual([{ label: 'Recipes', rows: [{ key: 'Lasagne', state: undefined }, { key: 'Moussaka', state: 'Archived' }] }])
    expect(d.note).toBeUndefined()
    expect(d.confirmLabel).toBe('Archive')
    expect(d.alternateLabel).toBeUndefined()
  })
  it('one Recipe is singular', () => {
    expect(blockedDialog('Béchamel', 'in_use', [{ id: 1, name: 'Lasagne' }]).body).toBe('It is used in 1 Recipe.')
  })
  it('lists up to 5 Recipes, then "and N more"', () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ id: i + 1, name: `Recipe ${i + 1}` }))
    const d = blockedDialog('Béchamel', 'in_use', many)
    expect(d.body).toBe('It is used in 8 Recipes.')
    expect(d.groups![0]!.rows.map((r) => r.key)).toEqual(['Recipe 1', 'Recipe 2', 'Recipe 3', 'Recipe 4', 'Recipe 5'])
    expect(d.note).toBe('and 3 more')
  })
})
