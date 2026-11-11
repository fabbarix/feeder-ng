// Helper for native-controls.test.ts (R2-L-b). The per-User secondary colour is banned in the feature folders; two things named
// "secondary" are not it and are removed before the ban is applied:
//   - the shared Button variant:       variant="secondary"
//   - the FormActions slot prop (R2-F): secondary={...}
// Anything else (secondaryColour, secondaryAccent, --color-secondary, a bare `secondary` identifier) still fails the ban.
export const stripAllowedSecondary = (text: string): string =>
  text
    .replace(/\bvariant=["']secondary["']/g, "")
    .replace(/\bsecondary=(?=\{)/g, "");
