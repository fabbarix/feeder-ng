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
/** Max inline size of a field (docs/dev/design/r2f-fields.md): xs 112, sm 168, md 320, lg 480, full 100 %. */
export type FieldSize = 'xs' | 'sm' | 'md' | 'lg' | 'full'

/** Sizing prop shared by every field primitive. Each has its own default (see the design note). */
export interface FieldSizeProps {
  size?: FieldSize
}
export type { IconName }
