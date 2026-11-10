import type { IconName } from '../icons'

/** Props every form field shares (anatomy: label above, 48 px control, helper, error with WarningCircle, aria-describedby). */
export interface FieldProps {
  label: string
  helper?: string
  error?: string
  disabled?: boolean
  required?: boolean
  name?: string
}
export type { IconName }
