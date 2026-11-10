package planner

// reservedFor reports whether Recipe r is reserved for a later open slot whose
// Slot Rule it is the only eligible match for, such that placing r at slot i
// would put that slot inside r's Cool-down (spec §7.2, round 2, decision
// 2026-11-10; design note r7-slot-rule-reserve). Stub: the developer wires it
// into evaluate (Plan, Regenerate and Swap) and into the validity of kept
// Planned meals.
func (st *state) reservedFor(i int, r Recipe) bool { return false }
