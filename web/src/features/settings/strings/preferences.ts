// English copy for Settings, Your preferences. Glossary terms only. Re-exported as part of settingsStrings by ../strings.ts.
export const settingsPreferencesStrings = {
  preferencesSaved: 'Your preferences are saved',

  prefs: {
    colourMode: 'Colour mode',
    light: 'Light',
    dark: 'Dark',
    system: 'System',
    units: 'Units',
    metric: 'Metric',
    imperial: 'Imperial',
    accent: 'Accent colour',
    customAccent: 'Custom accent colour',
    save: 'Save preferences',
    // B9-36 (SAFE-08): the live preview with an explicit Save.
    intro: 'You see each choice across the app at once. Save keeps it on every phone and computer you sign in on.',
    revert: 'Revert',
    actions: 'Preferences actions',
    customColour: 'Custom colour',
    notSavedOne: (preview: string, saved: string) => `Not saved yet: ${preview} is a preview. Save it or put back ${saved}.`,
    notSavedMany: (list: string) => `Not saved yet: ${list} are a preview.`,
    // The leave question (decision SAFE 6): "Dark is only a preview." / "If you leave, Feeder goes back to System."
    leaveLeadOne: (preview: string) => `${preview} is only a preview.`,
    leaveLeadMany: (list: string) => `${list} are only a preview.`,
    leaveNoteOne: (saved: string) => `If you leave, Feeder goes back to ${saved}.`,
    leaveNoteMany: 'If you leave, Feeder goes back to your saved preferences.',
  },
}
