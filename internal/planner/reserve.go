package planner

// A Slot Rule reservation (spec §7.2, round 2, decision 2026-11-10; design note
// r7-slot-rule-reserve). An open Slot Rule slot whose only eligible Recipe is r
// reserves r: an earlier slot may not take r when its Cool-down would then block
// the reserved slot.

// reservation is one live reservation of a Recipe for a later open Slot Rule slot.
type reservation struct {
	slot     int // index into st.slots of the Slot Rule slot
	recipe   RecipeID
	cooldown int // the reserved Recipe's Cool-down in days
}

// computeReservations finds the reservations of the walk. It must run after the
// roles are classified and the history holds only the LastPlanned, Pinned and
// Cooked cooks: a tentatively kept Planned meal must not void a reservation.
// Reservations are taken in slot order, so an earlier open reservation wins over
// a later one for the same Recipe inside its Cool-down (the later one is void).
func (st *state) computeReservations() {
	for i := range st.slots {
		if !st.isOpenSlot(i) {
			continue
		}
		r, ok := st.onlyEligible(i)
		if !ok {
			continue
		}
		cd := st.cooldownDays(r)
		if cd <= 0 || st.freshWithin(r.ID, st.days[i], cd) || st.reservedWithin(r.ID, st.days[i], cd) {
			continue // void: nothing is held back
		}
		st.reservations = append(st.reservations, reservation{slot: i, recipe: r.ID, cooldown: cd})
	}
}

// isOpenSlot: the walk still decides the slot (empty, or an unpinned Planned
// fresh meal in this run). The Swap target is never reserved: Swap ignores Slot
// Rules on its own slot.
func (st *state) isOpenSlot(i int) bool {
	if i == st.swapIdx {
		return false
	}
	if st.roles[i] != roleEmpty && st.roles[i] != roleKept {
		return false
	}
	return st.slots[i].Portions() > eps
}

// onlyEligible returns the Recipe the cell's Slot Rules allow when that is
// exactly one: the Recipes matching the rules, restricted to those not archived,
// with Yield > 0, marked with the cell's Course, and no Exclusion for an attendee
// (Ingredients included).
func (st *state) onlyEligible(i int) (Recipe, bool) {
	s := st.slots[i]
	if len(s.Rules) == 0 {
		return Recipe{}, false
	}
	var only Recipe
	n := 0
	for _, id := range st.recipeIDs {
		r := st.recipes[id]
		if r.Archived || r.Yield <= 0 || !st.fitsCourse(i, r) {
			continue
		}
		if _, ok := matchRule(s.Rules, r); !ok {
			continue
		}
		if st.excludes(s.Attendance, r, true) {
			continue
		}
		only = r
		if n++; n > 1 {
			return Recipe{}, false
		}
	}
	return only, n == 1
}

// freshWithin reports whether the history holds a fresh cook of the Recipe
// within cd days of day (before or after it).
func (st *state) freshWithin(id RecipeID, day, cd int) bool {
	for _, h := range st.history {
		if h.recipe == id && absInt(h.day-day) < cd {
			return true
		}
	}
	return false
}

// reservedWithin reports whether a reservation of the Recipe already held by an
// earlier slot lies within cd days of day.
func (st *state) reservedWithin(id RecipeID, day, cd int) bool {
	for _, res := range st.reservations {
		if res.recipe == id && absInt(st.days[res.slot]-day) < cd {
			return true
		}
	}
	return false
}

// dropBlockedKept turns a kept unpinned Planned meal into an empty slot when its
// Recipe lies inside the Cool-down of a live reservation of that Recipe at another
// slot, so Plan replans it. A reservation's own slot is never blocked by itself.
func (st *state) dropBlockedKept() {
	for i := range st.slots {
		if st.roles[i] != roleKept {
			continue
		}
		id := st.slots[i].Existing.RecipeID
		for _, res := range st.reservations {
			if res.recipe == id && res.slot != i && absInt(st.days[res.slot]-st.days[i]) < res.cooldown {
				st.roles[i] = roleEmpty
				st.uncoverCells(i) // the history loop after dropBlockedKept adds the restored kept cells
				break
			}
		}
	}
}

// reservedFor reports whether Recipe r is reserved for a later open Slot Rule slot
// whose Cool-down window placing r at slot i would fall inside. Such a Recipe is
// skipped like a Slot Rule narrowing: it does not count as considered.
func (st *state) reservedFor(i int, r Recipe) bool {
	for _, res := range st.reservations {
		if res.recipe == r.ID && res.slot > i && absInt(st.days[res.slot]-st.days[i]) < res.cooldown {
			return true
		}
	}
	return false
}
