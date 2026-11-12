import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Icon } from './Icon'
import { icons, type IconName } from './icons'

// Semantic name -> Phosphor component (docs/design/ui-fix-plan.md 3.4, plus the Tag names of 4.15).
// Names that share a glyph (delete/throwOut, keep/tick/confirm, ...) must resolve to the same one.
const TABLE: ReadonlyArray<readonly [string, string]> = [
  ['today', 'House'],
  ['minus', 'Minus'], // WP4: Stepper and NumberField decrease
  ['plan', 'CalendarDots'],
  ['scan', 'Barcode'],
  ['shop', 'Basket'],
  ['recipes', 'BookOpenText'],
  ['stock', 'Package'],
  ['ingredients', 'Carrot'],
  ['products', 'ShoppingBagOpen'],
  ['shops', 'Storefront'],
  ['location', 'MapPin'],
  ['fridge', 'ThermometerCold'],
  ['freezer', 'Snowflake'],
  ['board', 'Monitor'],
  ['settings', 'GearSix'],
  ['signOut', 'SignOut'],
  ['household', 'HouseLine'],
  ['members', 'UsersThree'],
  ['mealSlots', 'Clock'],
  ['planningRules', 'SlidersHorizontal'],
  ['notifications', 'Bell'],
  ['allowlist', 'UserPlus'],
  ['appearance', 'Palette'],
  ['barcodes', 'Barcode'],
  ['breakfast', 'Coffee'],
  ['lunch', 'Sun'],
  ['dinner', 'MoonStars'],
  ['snack', 'Cookie'],
  ['other', 'ForkKnife'],
  ['cook', 'CookingPot'],
  ['markCooked', 'CheckCircle'],
  ['notCooked', 'XCircle'],
  ['swap', 'ArrowsLeftRight'],
  ['pin', 'PushPin'],
  ['unpin', 'PushPinSlash'],
  ['chooseRecipe', 'MagnifyingGlass'],
  ['regenerate', 'ArrowsClockwise'],
  ['add', 'Plus'],
  ['edit', 'PencilSimple'],
  ['archive', 'Archive'],
  ['unarchive', 'ArrowCounterClockwise'],
  ['delete', 'Trash'],
  ['throwOut', 'Trash'],
  ['keep', 'Check'],
  ['tick', 'Check'],
  ['confirm', 'Check'],
  ['close', 'X'],
  ['back', 'ArrowLeft'],
  ['next', 'ArrowRight'],
  ['more', 'DotsThreeVertical'],
  ['search', 'MagnifyingGlass'],
  ['filter', 'FunnelSimple'],
  ['sort', 'SortAscending'],
  ['expand', 'CaretUpDown'],
  ['chevron', 'CaretRight'],
  ['copy', 'Copy'],
  ['undo', 'ArrowCounterClockwise'],
  ['import', 'DownloadSimple'],
  ['export', 'UploadSimple'],
  ['agentPrompt', 'Robot'],
  ['file', 'FileArrowUp'],
  ['torch', 'Flashlight'],
  ['moveUp', 'ArrowUp'], // WP3b: reorder Recipe Steps
  ['moveDown', 'ArrowDown'],
  ['mute', 'SpeakerSlash'], // WP3b: ViewfinderStrip mute (pressed = muted); one glyph keeps the bundle budget
  ['stockTake', 'HouseLine'],
  ['unknownBarcode', 'Question'],
  ['weigh', 'Scales'],
  ['price', 'Coins'],
  ['extra', 'NotePencil'],
  ['timer', 'Timer'],
  ['reheat', 'Fire'], // R12: Reheat button and screen
  ['pause', 'Pause'],
  ['resume', 'Play'],
  ['addMinute', 'PlusCircle'],
  ['voice', 'Microphone'],
  ['voiceOff', 'MicrophoneSlash'],
  ['exit', 'X'],
  ['why', 'Sparkle'],
  ['ingredientOverlap', 'Recycle'],
  ['favourite', 'Heart'],
  ['dislike', 'ThumbsDown'],
  ['exclusion', 'Prohibit'],
  ['slotRule', 'CalendarCheck'],
  ['varietyRule', 'Shuffle'],
  ['alreadyInStock', 'Package'],
  ['leftover', 'BowlFood'],
  ['useSoon', 'HourglassMedium'],
  ['goesOff', 'HourglassMedium'],
  ['spoiled', 'WarningCircle'],
  ['pinned', 'PushPin'],
  ['cooked', 'CheckCircle'],
  ['advanceStep', 'Alarm'],
  ['passiveStep', 'HourglassSimple'],
  ['activeStep', 'Knife'],
  ['batch', 'Stack'],
  ['portions', 'ChartPieSlice'],
  ['attendance', 'UsersThree'],
  ['tag', 'Tag'],
  ['readyMeal', 'Package'],
  ['duration', 'Clock'],
  ['success', 'CheckCircle'],
  ['info', 'Info'],
  ['warning', 'Warning'], // R2-1: was the hourglass (shared with useSoon); a warning is a triangle, an error stays the circle
  ['error', 'WarningCircle'],
  ['offline', 'CloudSlash'],
  ['streak', 'Leaf'],
  ['celebration', 'Confetti'],
  ['planEmpty', 'CalendarBlank'],
  ['cameraOff', 'CameraSlash'],
  ['camera', 'Camera'], // UF1: ImagePicker take-a-photo
  ['photos', 'Images'], // photo-read: Choose photos
  ['clipboard', 'ClipboardText'], // UF1: ImagePicker paste
  ['link', 'LinkSimple'], // UF1: ImagePicker from a link
  ['rotateRight', 'ArrowClockwise'], // UF1: ImagePicker crop rotate
  ['rotateLeft', 'ArrowCounterClockwise'], // UF1: shares the glyph of undo/unarchive
  ['pasta', 'BowlSteam'],
  ['fish', 'Fish'],
  ['chicken', 'Bird'],
  ['pizza', 'Pizza'],
  ['soup', 'BowlFood'],
  ['vegetarian', 'Leaf'],
  ['liquid', 'Drop'], // R14: Base Unit ml
  ['piece', 'Cube'], // R14: Base Unit piece
  ['snowflake', 'Snowflake'], // beta.5 WP D
  ['question', 'Question'], // beta.5 WP D
  ['shoppingCart', 'ShoppingCart'], // beta.5 WP D
  ['guests', 'UserPlus'], // beta.5 WP D
  ['key', 'Key'], // WP-D
  ['assistant', 'Robot'], // WP-D
  ['refresh', 'ArrowsClockwise'], // WP-D
  ['drag', 'DotsSixVertical'], // sort-drag: ui/Sortable handle
]

const markup = (name: string) => {
  const { container, unmount } = render(<Icon name={name as IconName} />)
  const html = container.querySelector('svg')?.innerHTML ?? ''
  unmount()
  return html
}

describe('icon registry', () => {
  it('registers exactly the semantic names of the plan, no more', () => {
    expect(Object.keys(icons).sort()).toEqual(TABLE.map(([name]) => name).sort())
  })

  it.each(TABLE)('%s renders an svg glyph', (name) => {
    expect(markup(name)).toContain('<path')
  })

  it('maps every name to its Phosphor glyph: same Phosphor name => identical svg, different => different', () => {
    const byPhosphor = new Map<string, string[]>()
    for (const [name, phosphor] of TABLE) byPhosphor.set(phosphor, [...(byPhosphor.get(phosphor) ?? []), name])
    const seen = new Map<string, string>()
    for (const [phosphor, names] of byPhosphor) {
      const [first, ...rest] = names as [string, ...string[]]
      const html = markup(first)
      for (const other of rest) expect(markup(other), `${other} should share the glyph of ${first}`).toBe(html)
      expect(seen.get(html), `${phosphor} (${first}) duplicates the glyph of ${seen.get(html)}`).toBeUndefined()
      seen.set(html, first)
    }
  })
})
