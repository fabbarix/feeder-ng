// STUB (B9-31 test author): only so the editor tests resolve this module. The developer replaces it with the real store the
// tests in unsavedChanges.test.tsx pin. These stubs make the pinned behaviour fail, not crash.
export const useHasUnsavedChanges = (): boolean => false
export const useReportUnsavedChanges = (_dirty: boolean): void => {}
export const resetUnsavedChanges = (): void => {}
