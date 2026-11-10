package recipefile

// CheckFile reports the file-intrinsic Recipe rules that the JSON Schema does
// not (or cannot) express and that BuildPlan would otherwise report during
// Import Review. It is pure and needs no database: it is the second half of
// "is this model answer a usable Recipe File?" after Parse. Paths are those of
// PathError ("$.recipes[0].steps[2].after[0]"); the result is in document
// order and nil when the file is fine.
//
// Rules (see docs/dev/design/ra-ab-core.md):
//   - Step timing: schedule.Validate on each Recipe's Steps (unknown kind,
//     Passive without duration, Advance without lead time, "after" index not
//     an earlier Step or an Advance Step); an Advance Step with "after".
//   - Fractional minutes: durationMinutes and leadTimeMinutes must be whole.
//     BuildPlan rounds up, but a model should say what it means, so it is
//     reported (and repaired) instead of silently rounded.
//   - A Ready Meal has exactly one ingredient line.
//   - Two Recipes of the file with the same normalised name.
//
// STUB.
func CheckFile(f File) []PathError { return nil }
