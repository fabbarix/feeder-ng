import { useImperativeHandle, useRef, type ComponentPropsWithoutRef, type KeyboardEvent, type Ref } from 'react'
import { IconButton } from '../IconButton'
import { Icon } from '../Icon'
import { fieldStrings } from './strings'
import './Field.css'
import './SearchField.css'

export interface SearchFieldProps extends Omit<ComponentPropsWithoutRef<'input'>, 'type' | 'value' | 'onChange' | 'onSubmit' | 'size'> {
  label: string
  value: string
  onChange: (value: string) => void
  /** Enter. */
  onSubmit?: (value: string) => void
  ref?: Ref<HTMLInputElement>
}

/**
 * The only `type="search"` input: a searchbox with a magnifier, a "Clear search" button (refocuses) and Escape to clear.
 * `onKeyDown` runs first; a handler that calls preventDefault() keeps SearchField from its own Escape and Enter.
 */
export function SearchField({ label, value, onChange, onSubmit, onKeyDown, ref, placeholder, className, ...rest }: SearchFieldProps) {
  const inner = useRef<HTMLInputElement>(null)
  useImperativeHandle(ref, () => inner.current as HTMLInputElement)
  const clear = () => {
    onChange('')
    inner.current?.focus()
  }
  const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(e)
    if (e.defaultPrevented) return
    if (e.key === 'Escape' && value !== '') {
      e.preventDefault()
      clear()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      onSubmit?.(value)
    }
  }
  return (
    <div className={['search-field', className].filter(Boolean).join(' ')}>
      <span className="visually-hidden">{label}</span>
      <span className="search-field__control">
        <Icon name="search" size={20} />
        <input
          {...rest}
          ref={inner}
          type="search"
          role="searchbox"
          aria-label={label}
          className="search-field__input"
          value={value}
          placeholder={placeholder ?? fieldStrings.searchPlaceholder}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKey}
        />
        {value !== '' ? <IconButton icon="close" label={fieldStrings.clearSearch} size="compact" onClick={clear} /> : null}
      </span>
    </div>
  )
}

