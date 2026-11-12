// The words the photo read shows for a photo and for a refusal (photo-read.md section 5). Pure: no React, no DOM.
import { problemMessage, type ImageEdit, type Size } from '../../../ui'
import { photoReadStrings as t } from '../strings'
import { blockReason, isSmallPhoto, photoNumber, type Photo, type PanelProblem, type PhotoPagesState } from './photoPages'

/** The text of the panel's message (one at a time). Refusals of the picker's own codes come from problemMessage. */
export function problemText(problem: PanelProblem): string {
  switch (problem.code) {
    case 'too_large':
      return problem.limit === 'as-is' ? t.problems.tooLargeAsIs : t.problems.tooLargeOriginal
    case 'too_many_pixels':
      return t.problems.tooManyPixels
    case 'unsupported':
      return t.problems.unsupported
    case 'unreadable':
      return t.problems.unreadable
    case 'empty':
      return t.problems.empty
    case 'too_many_photos':
      return t.problems.tooManyPhotos(problem.count ?? 0)
    case 'render_failed':
      return t.problems.renderFailed
    default:
      return problemMessage(problem.code)
  }
}

/** Whether the edit turns or crops the working copy (a turn with the whole turned picture is "Turned", not "Cropped"). */
function editChanges(edit: ImageEdit, size: Size): { turned: boolean; cropped: boolean } {
  const odd = edit.turns % 2 === 1
  const turnedW = odd ? size.height : size.width
  const turnedH = odd ? size.width : size.height
  const c = edit.crop
  const cropped = !(c.x === 0 && c.y === 0 && c.width === turnedW && c.height === turnedH)
  return { turned: edit.turns !== 0, cropped }
}

/** The status line of a row: how the photo is made, or why it is not ready. Undefined for an untouched photo. */
export function rowStatus(photo: Photo): { text: string; failed: boolean } | undefined {
  const source = photo.source
  if (source.kind === 'as-is') return { text: t.status.asIs, failed: false }
  if (source.kind === 'link') return { text: t.status.link, failed: false }
  if (photo.output.status === 'failed') {
    return { text: photo.output.problem === 'too_large' ? t.status.stillLarge : t.status.failed, failed: true }
  }
  if (photo.output.status === 'pending') return { text: t.status.preparing, failed: false }
  if (!photo.edit) return undefined
  const { turned, cropped } = editChanges(photo.edit, source)
  if (turned && cropped) return { text: t.status.croppedAndTurned, failed: false }
  if (turned) return { text: t.status.turned, failed: false }
  if (cropped) return { text: t.status.cropped, failed: false }
  return undefined
}

/** The small warning: the photo that would be sent has its long side under 1,000 px. Never for a link or an as-is photo (their output is 0 x 0). */
export function isSmallOutput(photo: Photo): boolean {
  if (photo.source.kind !== 'image' || photo.output.status !== 'ready') return false
  return isSmallPhoto({ width: photo.output.width, height: photo.output.height })
}

/** Why Read recipe is off on the Photo tab, in words (undefined when it is on or nothing is wrong with the photos). */
export function blockText(state: PhotoPagesState): string | undefined {
  const reason = blockReason(state)
  if (reason === null) return undefined
  if (reason === 'editing') return t.block.editing
  if (reason === 'preparing') return t.block.preparing
  return t.block.failed(photoNumber(state, reason.failed))
}
