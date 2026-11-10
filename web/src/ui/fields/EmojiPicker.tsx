// TYPE-ONLY STUB (R11a test-first). The developer implements this; see docs/dev/design/r11a-settings-shell.md.
export interface EmojiOption {
  value: string
  name: string
}
export interface EmojiPickerProps {
  label: string
  helper?: string
  /** Accessible name of the "no emoji" choice (value ""). */
  noneLabel: string
  options: EmojiOption[]
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}
export function EmojiPicker(_props: EmojiPickerProps): null {
  return null
}
