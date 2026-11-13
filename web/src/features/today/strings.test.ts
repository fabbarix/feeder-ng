import { describe, expect, it } from 'vitest'
import { todayStrings } from './strings'

describe('todayStrings', () => {
  it('says Planned Meals, never a bare "meals", in the empty state', () => {
    expect(todayStrings.emptyHint).toBe(
      'No Planned Meals to cook, no Leftovers waiting, nothing about to spoil. Put your feet up or plan something tasty.',
    )
  })

  // DS-TODAY
  it('names the metric strip and its metrics with Glossary words, and has no loading copy', () => {
    expect(todayStrings.metricsLabel).toBe('At a glance')
    expect(todayStrings.leftoversMetric).toBe('Leftovers to use')
    expect(todayStrings.linesMetric).toBe('Lines to get')
    expect(todayStrings.streakLabel).toBe('zero-waste streak')
    expect(todayStrings).not.toHaveProperty('loading')
  })
})
