// English copy for Settings, the Household page and the Planner Style. Glossary terms only. Re-exported as part of settingsStrings by ../strings.ts.
export const settingsHouseholdStrings = {
  householdSaved: 'Household settings saved.',

  form: {
    timeZone: 'Time zone',
    timeZoneFromBrowser: 'Suggested from your browser. Save to confirm it.',
    planningHorizon: 'Planning Horizon (days)',
    cooldown: 'Default Cool-down (days)',
    leftoverUseBy: 'Default Leftover Use-by (days)',
    frozenUseBy: 'Default Frozen Use-by (days)',
    quietStart: 'Quiet hours start',
    quietEnd: 'Quiet hours end',
    location: 'Location',
    locationHint: "Coordinates such as 45.07, 7.69 are needed for the kitchen board's sunset and sunrise. A city alone keeps the 19:00 to 07:00 dark mode.",
    currency: 'Currency',
    save: 'Save Household settings',
  },
  plannerStyle: 'Planner Style',
  plannerStyleAnchor: {
    useWhatWeHave: 'Use what we have',
    variety: 'Variety',
    favourites: 'Favourites',
  },
  plannerStyleBetween: (lower: string, upper: string) => `Between ${lower} and ${upper}`,
}
