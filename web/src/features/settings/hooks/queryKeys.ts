// react-query keys for the settings feature.
export const settingsKeys = {
  settings: ['household', 'settings'] as const,
  members: ['household', 'members'] as const,
  slots: ['household', 'meal-slots'] as const,
  /** SET-15: under `slots`, so every Meal Slot change reads the removed list again too. */
  removedSlots: ['household', 'meal-slots', 'removed'] as const,
  attendance: (slotId: number, date: string) => ['household', 'attendance', slotId, date] as const,
  allowlist: ['allowlist'] as const,
  preferences: ['me', 'preferences'] as const,
}
