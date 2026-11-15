import { BottomSheet, Button, TextArea } from '../../../ui'
import { settingsStrings } from '../strings'

const text = settingsStrings.allowlistPanel

export interface SignInMessageSheetProps {
  /** The message to show; null keeps the sheet closed. */
  message: string | null
  onClose: () => void
}

/** SET-03: the fallback when neither the share sheet nor the clipboard took the message: the text, read-only and already selected,
 *  with one primary Done. No Cancel, so the header keeps its one circular Close (R-B). */
export function SignInMessageSheet({ message, onClose }: SignInMessageSheetProps) {
  return (
    <BottomSheet
      open={message !== null}
      onClose={onClose}
      title={text.sheetTitle}
      footer={
        <Button variant="primary" onClick={onClose}>
          {text.done}
        </Button>
      }
    >
      <TextArea
        label={text.sheetTitle}
        helper={text.sheetHelper}
        value={message ?? ''}
        onChange={() => {}}
        readOnly
        rows={4}
        onFocus={(e) => e.currentTarget.select()}
      />
    </BottomSheet>
  )
}
