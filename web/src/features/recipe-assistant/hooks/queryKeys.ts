// react-query keys for the Recipe Assistant settings. Keys hold addresses only, never an API key.
export const raKeys = {
  settings: ['recipe-assistant', 'settings'] as const,
  models: (origin: string) => ['recipe-assistant', 'models', origin] as const,
}
