// English copy for Settings, the Household page and the Planner Style. Glossary terms only. Re-exported as part of settingsStrings by ../strings.ts.
export const settingsHouseholdStrings = {
  householdSaved: 'Household settings saved.',

  form: {
    timeZone: 'Time zone',
    timeZoneFromBrowser: 'Suggested from your browser. Save to confirm it.',
    // B9-36 (SET-07): what the zone is for and the time there now; the notice once it differs from the stored zone.
    timeZoneHelper: (clock: string | null) => `Today, the Plan and notifications use it.${clock ? ` It is ${clock} there now.` : ''}`,
    timeZoneChanged: "Changing the time zone can move today's meals to another day.",
    planningHorizon: 'Planning Horizon (days)',
    cooldown: 'Default Cool-down (days)',
    leftoverUseBy: 'Default Leftover Use\u2011by (days)',
    frozenUseBy: 'Default Frozen Use\u2011by (days)',
    quietStart: 'Quiet hours start',
    quietEnd: 'Quiet hours end',
    location: 'Location',
    locationHint: "Coordinates such as 45.07, 7.69 are needed for the kitchen board's sunset and sunrise. A city alone keeps the 19:00 to 07:00 dark mode.",
    currency: 'Currency',
    save: 'Save Household settings',
    // B9-53 (TB-06, TB 6): the row that shows the hidden first-run checklist on Today again.
    setupChecklist: 'Setup checklist',
    setupHidden: 'Hidden from Today',
    showSetup: 'Show on Today',
    setupShown: 'The setup checklist is back on Today.',
    rowsLabel: 'Today',
  },
  plannerStyle: 'Planner Style',
  plannerStyleAnchor: {
    useWhatWeHave: 'Use what we have',
    variety: 'Variety',
    favourites: 'Favourites',
  },
  plannerStyleBetween: (lower: string, upper: string) => `Between ${lower} and ${upper}`,
}
