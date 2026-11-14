// hf-recipes-filter round 2: the filtered /recipes the guard also probes, at every width of the profile: the chips of a Side Course and a
// long Tag, closed, and with the Filters panel open (docs/design/recipes-filter.md 13.6). pantry-filter: the same for /pantry, with Use
// soon and the 60-character Storage Place (docs/design/pantry-filter.md 10). The ids file gives the Course, the Tag and the place
// (resolveScenario). No `widths`: they run at every viewport of the profile. RESIZE_WALKS walk recipes-filtered and pantry-filtered.
export default {
  order: 10,
  scenarios: [
    { name: 'recipes-filtered', route: '/recipes', open: false },
    { name: 'recipes-filtered-open', route: '/recipes', open: true },
    { name: 'pantry-filtered', route: '/pantry', open: false },
    { name: 'pantry-filtered-open', route: '/pantry', open: true },
  ],
  setups: {},
}
