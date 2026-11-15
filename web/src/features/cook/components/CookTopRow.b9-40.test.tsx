// B9-40 (PC-03, SHORT-01): the top row is Exit, then Ingredients and Voice at the end, all outlined; Ingredients is icon-only on a phone.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CookTopRow } from './CookTopRow'

const base = { number: 2, of: 5, speechSupported: true, voiceOn: false, onVoiceChange: () => {}, onExit: () => {} }

describe('CookTopRow (PC-03)', () => {
  it('is Exit, Ingredients, Voice commands, in that DOM order (the landscape grid only moves them)', () => {
    const { container } = render(<CookTopRow {...base} onIngredients={() => {}} />)
    const names = [...container.querySelectorAll('button')].map((b) => b.getAttribute('aria-label') ?? b.textContent)
    expect(names).toEqual(['Exit', 'Ingredients', 'Voice commands'])
  })

  it('Ingredients opens the Ingredients list through onIngredients, and is named "Ingredients" whatever the width', async () => {
    const onIngredients = vi.fn()
    render(<CookTopRow {...base} onIngredients={onIngredients} />)
    await userEvent.click(screen.getByRole('button', { name: 'Ingredients' }))
    expect(onIngredients).toHaveBeenCalledTimes(1)
  })

  it('has the .cook-ingredients and .cook-voice hooks the landscape grid places, and the text of Ingredients is its own span (CSS hides it on a phone)', () => {
    const { container } = render(<CookTopRow {...base} onIngredients={() => {}} />)
    expect(container.querySelector('.cook-ingredients')).not.toBeNull()
    expect(container.querySelector('.cook-ingredients .cook-ingredients__label')).toHaveTextContent('Ingredients')
    expect(container.querySelector('.cook-voice')).not.toBeNull()
  })

  it('shows no Ingredients button without a handler (the Get ready sheet is another package\'s; nothing dead is drawn)', () => {
    render(<CookTopRow {...base} />)
    expect(screen.queryByRole('button', { name: 'Ingredients' })).not.toBeInTheDocument()
  })

  it('the voice switch is a circular icon button; Exit is a secondary Button with the exit icon', () => {
    render(<CookTopRow {...base} onIngredients={() => {}} />)
    expect(screen.getByRole('button', { name: 'Voice commands' })).toHaveAttribute('data-shape', 'circle')
    expect(screen.getByRole('button', { name: 'Ingredients' })).toHaveAttribute('data-variant', 'secondary')
    expect(screen.getByRole('button', { name: 'Exit' })).toHaveAttribute('data-variant', 'secondary')
  })
})
