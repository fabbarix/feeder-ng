// B9-36 (SAFE-08, decision SAFE 6 B): the unsaved preview of Your preferences. Plain TypeScript, no React (lib/preferencePreview.test.ts).
// One store for the app: the theme, the unit system and the Cook context read `saved` overlaid with it, so a choice shows everywhere at
// once while nothing reaches the server until Save. It lives in memory only, so a reload drops it.
import type { Preferences } from '../types'
import { ACCENT_PRESETS } from './accents'
import { settingsPreferencesStrings } from '../strings/preferences'

export interface PreferencePreview {
  /** The previewed preferences, or null when nothing is previewed. */
  get: () => Preferences | null
  /** Previews `next` across the whole app. */
  set: (next: Preferences) => void
  /** Ends the preview: every consumer falls back to the saved value. */
  clear: () => void
  /** Called after every change of the preview. Returns the unsubscribe. */
  subscribe: (listener: () => void) => () => void
  /** The page that owns a dirty preview registers its leave check (useLeaveGuard's confirmLeave); null unregisters. */
  setLeaveCheck: (check: (() => Promise<boolean>) | null) => void
  /** For an exit that is not a router navigation (Sign out): true at once with no check registered, else the check's answer. */
  confirmLeave: () => Promise<boolean>
}

export function createPreferencePreview(): PreferencePreview {
  let current: Preferences | null = null
  let check: (() => Promise<boolean>) | null = null
  const listeners = new Set<() => void>()
  const notify = () => {
    for (const l of [...listeners]) l()
  }
  return {
    get: () => current,
    set: (next) => {
      current = { ...next }
      notify()
    },
    clear: () => {
      if (current === null) return
      current = null
      notify()
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    setLeaveCheck: (next) => {
      check = next
    },
    confirmLeave: () => (check ? check() : Promise.resolve(true)),
  }
}

/** The app's one preview. */
export const preferencePreview: PreferencePreview = createPreferencePreview()

/** `preview` overlaid on `saved`: what the app shows now. */
export function effectivePreferences(saved: Preferences, preview: Preferences | null): Preferences {
  return preview ?? saved
}

const p = settingsPreferencesStrings.prefs

function schemeName(scheme: Preferences['scheme']): string {
  return scheme === 'dark' ? p.dark : scheme === 'light' ? p.light : p.system
}

function unitsName(units: Preferences['units']): string {
  return units === 'imperial' ? p.imperial : p.metric
}

function accentName(accent: string): string {
  const preset = ACCENT_PRESETS.find((a) => a.hex.toLowerCase() === accent.toLowerCase())
  return preset ? preset.name : p.customColour
}

/** What is previewed and what Save would replace, in the order colour mode, units, accent. Empty when nothing differs. */
export function previewChanges(saved: Preferences, preview: Preferences): Array<{ preview: string; saved: string }> {
  const out: Array<{ preview: string; saved: string }> = []
  if (preview.scheme !== saved.scheme) out.push({ preview: schemeName(preview.scheme), saved: schemeName(saved.scheme) })
  if (preview.units !== saved.units) out.push({ preview: unitsName(preview.units), saved: unitsName(saved.units) })
  if (preview.accent.toLowerCase() !== saved.accent.toLowerCase()) out.push({ preview: accentName(preview.accent), saved: accentName(saved.accent) })
  return out
}

function listOf(names: string[]): string {
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/** The status line of a dirty form ("Not saved yet: Dark is a preview. Save it or put back System."), or null when nothing differs. */
export function previewSummary(saved: Preferences, preview: Preferences): string | null {
  const changes = previewChanges(saved, preview)
  if (changes.length === 0) return null
  if (changes.length === 1) return p.notSavedOne(changes[0]!.preview, changes[0]!.saved)
  return p.notSavedMany(listOf(changes.map((c) => c.preview)))
}

/** The leave question's lead and note (decision SAFE 6): "Dark is only a preview." / "If you leave, Feeder goes back to System."
 *  Null when nothing differs. */
export function previewLeaveCopy(saved: Preferences, preview: Preferences): { lead: string; note: string } | null {
  const changes = previewChanges(saved, preview)
  if (changes.length === 0) return null
  if (changes.length === 1) return { lead: p.leaveLeadOne(changes[0]!.preview), note: p.leaveNoteOne(changes[0]!.saved) }
  return { lead: p.leaveLeadMany(listOf(changes.map((c) => c.preview))), note: p.leaveNoteMany }
}
