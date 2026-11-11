// Whether "Read a recipe" can be used, and what to say when it cannot (docs/dev/design/ra-e-import.md section 4.4). Plain TypeScript.
import type { AssistantStatus, AssistantUnavailableReason } from '../types'
import { readStrings as t } from '../strings'
import { waitText } from './readErrors'

export interface ReadAvailability {
  /** The status has not arrived yet (no message, inputs shown disabled). */
  loading: boolean
  /** The Read button and the inputs can be used. */
  enabled: boolean
  isAdmin: boolean
  /** The status call itself failed: offer "Check again". */
  statusFailed: boolean
  /** Why not (when !enabled and !loading). */
  message?: string
  /** Admins: show "Open Recipe Assistant settings". */
  settingsLink: boolean
  /** The Photo option can be chosen. */
  photos: boolean
  photosMessage?: string
  /** The Household limit is used up (non-Admins): Read is disabled and this says when to try again. */
  limitMessage?: string
  /** "N reads left this hour." when 5 or fewer are left. */
  limitHint?: string
  modelName?: string
  /** The id of that model: the server names the model that declined by id, the copy wants the name. */
  modelId?: string
}

const REASONS: Record<AssistantUnavailableReason, { admin: string; user: string }> = {
  off: { admin: 'The Recipe Assistant is off. Turn it on in Settings.', user: 'The Recipe Assistant is off. Ask an Admin to turn it on.' },
  no_secret_key: { admin: 'The Recipe Assistant needs a secret key on the server first. Settings explains how.', user: "The Recipe Assistant isn't set up yet. Ask an Admin." },
  no_key: { admin: 'The Recipe Assistant needs an API key. Add it in Settings.', user: 'The Recipe Assistant needs an API key. Ask an Admin.' },
  key_unreadable: { admin: "The saved API key can't be read. Enter it again in Settings.", user: "The saved API key can't be read. Ask an Admin." },
  model_unavailable: { admin: 'The chosen model is no longer available. Pick another model in Settings.', user: 'The chosen model is no longer available. Ask an Admin.' },
}
const LOW_LIMIT = 5

export function availabilityOf(status: AssistantStatus | undefined, o: { isAdmin: boolean; failed?: boolean }): ReadAvailability {
  const base = { isAdmin: o.isAdmin, settingsLink: false, photos: false }
  if (!status) {
    if (o.failed) return { ...base, loading: false, enabled: false, statusFailed: true, message: t.loadFailed }
    return { ...base, loading: true, enabled: false, statusFailed: false }
  }
  if (!status.available) {
    const reason = REASONS[status.reason ?? 'off']
    return { ...base, loading: false, enabled: false, statusFailed: false, message: o.isAdmin ? reason.admin : reason.user, settingsLink: o.isAdmin }
  }
  const photosMessage = status.photos ? undefined : o.isAdmin ? "This model can't read photos. Pick another model in Settings." : "This model can't read photos."
  const out: ReadAvailability = { ...base, loading: false, enabled: true, statusFailed: false, photos: status.photos, modelName: status.model?.name, modelId: status.model?.id }
  if (photosMessage) out.photosMessage = photosMessage
  const limit = o.isAdmin ? undefined : status.limit
  out.limitMessage = undefined
  if (limit && limit.remaining <= 0) {
    out.limitMessage = `Your Household has read 30 recipes in the last hour. Try again in ${waitText(limit.resetsInSeconds)}.`
    out.message = out.limitMessage
    out.enabled = false
  } else if (limit && limit.remaining <= LOW_LIMIT) {
    out.limitHint = `${limit.remaining} ${limit.remaining === 1 ? 'read' : 'reads'} left this hour.`
  }
  return out
}
