# Team K: `cook.Timeline`

Pure function in `internal/cook/timeline.go` (spec §11, ADR 0008 point 9). The plan left the types open; these are the choices.

```go
func Timeline(courses []Course) (Result, error)

type Course struct {
    ID            int64
    Reheat        bool            // Leftover Course: one Reheat item, Steps ignored
    ReheatSeconds int             // > 0, caller supplies it (multiples of 30)
    Steps         []schedule.Step // fresh Course
}
type Item struct {
    CourseID     int64
    Kind         ItemKind      // "step" | "reheat" | "serve"
    StepIndex    int           // Recipe Step index; -1 for reheat and serve
    StepKind     schedule.Kind // Active/Passive (reheat passive, serve active)
    StartSeconds, EndSeconds int // half-open, from the timeline start
}
type Result struct { Items []Item; TotalSeconds int }
```

- Input is the slot's unresolved Courses in slot order; the caller drops Cooked and Not cooked Courses and works out each Reheat length (spec §8). Advance Steps are not items.
- The slot time is E = `TotalSeconds`; clock time of an item is `slotTime - TotalSeconds + StartSeconds`. Start cooking is `slotTime - TotalSeconds`.
- A fresh Course with no non-Advance Steps gives one zero-length active Serve item at E.
- Items are ordered by start, ties by slot order of the Course, then Step index. Zero-length items never clash.
- Errors wrap `ErrInvalidCourse` (invalid Steps from `schedule.Compute`, Reheat without length, duplicate Course id). Empty input gives an empty Result, no error.
- Placement: Reheat first, then fresh Courses by longer total, then slot order (stable). Each block takes the largest shift where no Active item overlaps one already placed; candidates are "touching" positions, so the result is exact in whole seconds.
