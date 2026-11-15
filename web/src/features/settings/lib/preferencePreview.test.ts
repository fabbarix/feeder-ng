// B9-36 (SAFE-08): the preview store and the "Not saved yet" line.
import { describe, expect, it, vi } from 'vitest'
import { createPreferencePreview, previewSummary, preferencePreview } from './preferencePreview'
import type { Preferences } from '../types'

const saved: Preferences = { scheme: 'system', accent: '#3f7d58', units: 'metric' } // Basil
const dark: Preferences = { ...saved, scheme: 'dark' }

describe('createPreferencePreview', () => {
  it('starts empty, holds what is set and clears', () => {
    const p = createPreferencePreview()
    expect(p.get()).toBeNull()
    p.set(dark)
    expect(p.get()).toEqual(dark)
    p.clear()
    expect(p.get()).toBeNull()
  })

  it('tells subscribers after every set and clear, and not after unsubscribing; clearing an empty preview tells nobody', () => {
    const p = createPreferencePreview()
    const seen = vi.fn()
    const off = p.subscribe(seen)
    p.clear()
    expect(seen).not.toHaveBeenCalled()
    p.set(dark)
    p.clear()
    expect(seen).toHaveBeenCalledTimes(2)
    off()
    p.set(dark)
    expect(seen).toHaveBeenCalledTimes(2)
  })

  it('is a store that never throws for the first reader: get() is the same object until it changes (useSyncExternalStore)', () => {
    const p = createPreferencePreview()
    p.set(dark)
    expect(p.get()).toBe(p.get())
  })

  it('confirmLeave is true at once when no page registered a check', async () => {
    await expect(createPreferencePreview().confirmLeave()).resolves.toBe(true)
  })

  it('confirmLeave asks the registered check, and is true again once it is unregistered', async () => {
    const p = createPreferencePreview()
    const check = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    p.setLeaveCheck(check)
    await expect(p.confirmLeave()).resolves.toBe(false)
    await expect(p.confirmLeave()).resolves.toBe(true)
    p.setLeaveCheck(null)
    await expect(p.confirmLeave()).resolves.toBe(true)
    expect(check).toHaveBeenCalledTimes(2)
  })

  it('the app has one shared instance with the same API', () => {
    preferencePreview.clear()
    expect(preferencePreview.get()).toBeNull()
    preferencePreview.set(dark)
    expect(preferencePreview.get()).toEqual(dark)
    preferencePreview.clear()
  })
})

describe('previewSummary', () => {
  it('is null when nothing differs (accent compared without case)', () => {
    expect(previewSummary(saved, saved)).toBeNull()
    expect(previewSummary(saved, { ...saved, accent: '#3F7D58' })).toBeNull()
  })

  it('one colour mode: names it and what returns', () => {
    expect(previewSummary(saved, dark)).toBe('Not saved yet: Dark is a preview. Save it or put back System.')
  })

  it('one accent: the preset name, and the saved preset to put back', () => {
    expect(previewSummary(saved, { ...saved, accent: '#c0392b' })).toBe('Not saved yet: Tomato is a preview. Save it or put back Basil.')
  })

  it('one unit system', () => {
    expect(previewSummary(saved, { ...saved, units: 'imperial' })).toBe('Not saved yet: Imperial is a preview. Save it or put back Metric.')
  })

  it('a custom accent is called "Custom colour"', () => {
    expect(previewSummary(saved, { ...saved, accent: '#123456' })).toBe('Not saved yet: Custom colour is a preview. Save it or put back Basil.')
  })

  it('several changes: they are listed and there is no put-back clause', () => {
    expect(previewSummary(saved, { ...dark, accent: '#c0392b' })).toBe('Not saved yet: Dark and Tomato are a preview.')
    expect(previewSummary(saved, { scheme: 'dark', accent: '#c0392b', units: 'imperial' })).toBe('Not saved yet: Dark, Imperial and Tomato are a preview.')
  })
})
