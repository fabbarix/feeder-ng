// B9-40 (PC-03, PC-16 items 1 to 3): the pure Step-text helpers. nbspUnits keeps "220 °C" together, stepTextSize picks the type size by
// length, stepOverline carries the Step count and hours, shortTimerLabel names a timer in the held line.
import { describe, expect, it } from 'vitest'
import { cookStrings } from '../strings'
import { formatStepDuration, nbspUnits, shortTimerLabel, stepOverline, stepTextSize } from './steps'

const NB = ' '

describe('nbspUnits (PC-16 item 1: "220 °C" never breaks between the number and the unit)', () => {
  it('joins the number to a temperature unit', () => {
    expect(nbspUnits('Pre-heat the oven to 220 °C.')).toBe(`Pre-heat the oven to 220${NB}°C.`)
    expect(nbspUnits('Heat to 350 °F')).toBe(`Heat to 350${NB}°F`)
  })
  it('joins the number to a weight, volume, spoon or time unit', () => {
    expect(nbspUnits('Add 250 g flour and 1.5 kg sugar')).toBe(`Add 250${NB}g flour and 1.5${NB}kg sugar`)
    expect(nbspUnits('Pour in 200 ml milk, 2 tbsp oil and 1 tsp salt')).toBe(`Pour in 200${NB}ml milk, 2${NB}tbsp oil and 1${NB}tsp salt`)
    expect(nbspUnits('Bake for 25 minutes, rest 10 min, then wait 2 hours')).toBe(`Bake for 25${NB}minutes, rest 10${NB}min, then wait 2${NB}hours`)
  })
  it('leaves a number that is followed by a plain word, and a number already joined, alone', () => {
    expect(nbspUnits('Crack 3 eggs into a bowl')).toBe('Crack 3 eggs into a bowl')
    expect(nbspUnits(`Heat to 220${NB}°C`)).toBe(`Heat to 220${NB}°C`)
    expect(nbspUnits('Heat to 220°C')).toBe('Heat to 220°C')
  })
  it('does not join a word that only starts like a unit ("5 gloves"), and joins "mins"', () => {
    expect(nbspUnits('Peel 5 gloves')).toBe('Peel 5 gloves')
    expect(nbspUnits('Wait 2 mins')).toBe(`Wait 2${NB}mins`)
  })
  it('is idempotent and keeps the rest of the text byte for byte', () => {
    const once = nbspUnits('Bake at 200 °C for 25 min, then cool 10 min.')
    expect(nbspUnits(once)).toBe(once)
    expect(once.replaceAll(NB, ' ')).toBe('Bake at 200 °C for 25 min, then cool 10 min.')
  })
})

describe('stepTextSize (PC-03: up to 25 words is short, longer is long)', () => {
  const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(' ')
  it('25 words is short, 26 is long', () => {
    expect(stepTextSize(words(25))).toBe('short')
    expect(stepTextSize(words(26))).toBe('long')
  })
  it('an empty Step and a one-word Step are short', () => {
    expect(stepTextSize('')).toBe('short')
    expect(stepTextSize('Serve.')).toBe('short')
  })
  it('counts words split by any whitespace, including no-break spaces and line breaks', () => {
    expect(stepTextSize(Array.from({ length: 26 }, (_, i) => `w${i}`).join(`${NB}\n`))).toBe('long')
  })
})

describe('formatStepDuration (PC-16 item 3: hours and minutes, sentence case)', () => {
  it('minutes under an hour', () => {
    expect(formatStepDuration(3)).toBe('3 min')
    expect(formatStepDuration(45)).toBe('45 min')
  })
  it('whole hours and hours with minutes', () => {
    expect(formatStepDuration(60)).toBe('1 h')
    expect(formatStepDuration(360)).toBe('6 h')
    expect(formatStepDuration(90)).toBe('1 h 30 min')
  })
  it('stays in hours past a day: no "days" inside a Step (choice: 1500 min is "25 h")', () => {
    expect(formatStepDuration(1500)).toBe('25 h')
  })
})

describe('stepOverline (PC-03: the Step count is the first word of the overline; PC-16 item 3: hours)', () => {
  it('puts "Step n of N" in front, then the kind and the duration', () => {
    expect(stepOverline({ number: 2, of: 5, kind: 'active', durationMinutes: 2 })).toBe('Step 2 of 5 · Active · 2 min')
  })
  it('a Passive Step names its timer in sentence case, in hours when long', () => {
    expect(stepOverline({ number: 1, of: 5, kind: 'passive', durationMinutes: 3 })).toBe('Step 1 of 5 · Passive · 3 min timer')
    expect(stepOverline({ number: 2, of: 4, kind: 'passive', durationMinutes: 360 })).toBe('Step 2 of 4 · Passive · 6 h timer')
    expect(stepOverline({ number: 3, of: 4, kind: 'passive', durationMinutes: 90 })).toBe('Step 3 of 4 · Passive · 1 h 30 min timer')
  })
  it('an Active Step with no duration is just "Active"', () => {
    expect(stepOverline({ number: 1, of: 6, kind: 'active', durationMinutes: 0 })).toBe('Step 1 of 6 · Active')
  })
  it('with no Step count (number 0) the overline is as before the count moved in', () => {
    expect(stepOverline({ number: 0, of: 0, kind: 'passive', durationMinutes: 15 })).toBe('Passive · 15 min timer')
    expect(stepOverline({ kind: 'active', durationMinutes: 10 })).toBe('Active · 10 min')
  })
  it('has no upper-case text of its own (CSS never upper-cases it either: sentence case)', () => {
    expect(stepOverline({ number: 2, of: 5, kind: 'passive', durationMinutes: 5 })).not.toMatch(/PASSIVE|ACTIVE/)
  })
})

describe('shortTimerLabel (PC-16 item 2: the held line names the timer once, with no double punctuation)', () => {
  it('drops the "Step n:" prefix, the closing full stop and the quantity tail, and the leading verb before an article', () => {
    expect(shortTimerLabel('Step 1: Pre-heat the oven to 220 °C.')).toBe('the oven')
    expect(shortTimerLabel('Step 4: Simmer the rice')).toBe('the rice')
    expect(shortTimerLabel('Roast the chicken for 40 minutes')).toBe('the chicken')
  })
  it('a timeline label "<Recipe> · <Step text>" and a "Step 1 · …" label are judged by the text after the last " · "', () => {
    expect(shortTimerLabel('Green beans · Simmer the beans')).toBe('the beans')
    expect(shortTimerLabel('Step 1 · Pre-heat the oven')).toBe('the oven')
  })
  it('a label with no article after its first word keeps every word, in lower case', () => {
    expect(shortTimerLabel('Step 2: Rest')).toBe('rest')
    expect(shortTimerLabel('Eggs')).toBe('eggs')
    expect(shortTimerLabel('Slow cooker beef stew')).toBe('slow cooker beef stew')
  })
  it('never ends in punctuation (so the line reads "…oven: 2:43 left")', () => {
    for (const l of ['Step 1: Pre-heat the oven to 220 °C.', 'Rest.', 'Bring to the boil!']) expect(shortTimerLabel(l)).not.toMatch(/[.!?:;,]$/)
  })
})

describe('the held line (PC-16 item 2)', () => {
  it('reads "Next waits for the oven: 2:43 left. Cancel that timer to go on now." from the full label', () => {
    expect(cookStrings.nextHeld('Step 1: Pre-heat the oven to 220 °C.', '2:43')).toBe('Next waits for the oven: 2:43 left. Cancel that timer to go on now.')
  })
  it('has no ".:" and no "Cancel its timer"', () => {
    const line = cookStrings.nextHeld('Step 1: Pre-heat the oven to 220 °C.', '2:56')
    expect(line).not.toContain('.:')
    expect(line).not.toContain('Cancel its timer')
  })
  it('several timers keep the count form', () => {
    expect(cookStrings.nextHeldMany(2, '4:00')).toBe('Next waits for 2 timers: 4:00 left. Cancel them to go on now.')
  })
})
