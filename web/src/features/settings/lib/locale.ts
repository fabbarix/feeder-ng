/** The language of the page (`<html lang>`), 'en' when it is not set. Weekday names follow it. */
export function documentLocale(): string {
  return (typeof document !== 'undefined' && document.documentElement.lang) || 'en'
}
