export interface RadioGroupProps<T extends string> {
  legend: string
  name: string
  value: T
  options: ReadonlyArray<{ value: T; label: string }>
  onChange: (next: T) => void
}

/** A labelled set of radio buttons. Shared by the settings forms. */
export function RadioGroup<T extends string>({ legend, name, value, options, onChange }: RadioGroupProps<T>) {
  return (
    <fieldset className="choice-group">
      <legend>{legend}</legend>
      {options.map((o) => (
        <label key={o.value} className="choice">
          <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} />
          {o.label}
        </label>
      ))}
    </fieldset>
  )
}
