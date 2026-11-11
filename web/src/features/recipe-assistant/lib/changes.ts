// Change history wording (Admin-only list of the last 20 changes). Pure.
import type { SettingsChange } from '../types'

export interface ChangeRow {
  title: string
  meta: string
}

/** "just now", "30 min ago", "2 h ago", "3 d ago". */
export function agoCopy(at: string, now: Date): string {
  const seconds = Math.floor((now.getTime() - new Date(at).getTime()) / 1000)
  if (!(seconds >= 60)) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`
  return `${Math.floor(seconds / 86400)} d ago`
}

/** The new value of an "old -> new" detail; a plain detail is returned as is. */
const newValue = (detail: string) => detail.split(' -> ').pop()!.trim()

export function changeRow(change: SettingsChange, now: Date): ChangeRow {
  const who = change.actorName
  const meta = agoCopy(change.at, now)
  switch (change.action) {
    case 'turned_on':
      return { title: `${who} turned the Recipe Assistant on`, meta }
    case 'turned_off':
      return { title: `${who} turned the Recipe Assistant off`, meta }
    case 'model_changed':
      return { title: `${who} changed the model to ${newValue(change.detail)}`, meta }
    case 'base_url_changed':
      return { title: `${who} changed the address to ${newValue(change.detail)}`, meta }
    case 'key_saved':
      return { title: `${who} saved the API key ••••${change.detail}`, meta }
    case 'key_replaced':
      return { title: `${who} replaced the API key ••••${change.detail}`, meta }
    case 'key_removed':
      return { title: `${who} removed the API key`, meta }
    default:
      return { title: `${who} changed the Recipe Assistant settings`, meta }
  }
}
