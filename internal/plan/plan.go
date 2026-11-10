package plan

import (
	"encoding/json"
	"fmt"
	"time"

	"github.com/fabbarix/feeder-ng/internal/planner"
	"github.com/fabbarix/feeder-ng/internal/recipe"
)

// Today is the household calendar date of now in zone.
func Today(now time.Time, zone *time.Location) string {
	return now.In(zone).Format(dateLayout)
}

// HorizonDates are the days dates starting at today (YYYY-MM-DD), so the Planning Horizon includes today.
func HorizonDates(today string, days int) []string {
	if days <= 0 {
		return nil
	}
	d, err := time.Parse(dateLayout, today)
	if err != nil {
		return nil
	}
	out := make([]string, 0, days)
	for i := 0; i < days; i++ {
		out = append(out, d.AddDate(0, 0, i).Format(dateLayout))
	}
	return out
}

// StartBy is the household "HH:MM" by which cooking must start for the slot at `at` to be on time: the slot
// instant less the Recipe's total time, read in the instant's own zone (the household zone for slot instants). It
// returns "" when the time is not known (cookMinutes <= 0).
func StartBy(at time.Time, cookMinutes int) string {
	if cookMinutes <= 0 {
		return ""
	}
	return at.Add(-time.Duration(cookMinutes) * time.Minute).Format("15:04")
}

// SlotInstant is the instant of date plus hhmm in zone. ErrBadTime for a malformed time.
func SlotInstant(date, hhmm string, zone *time.Location) (time.Time, error) {
	if _, err := parseHHMM(hhmm); err != nil {
		return time.Time{}, ErrBadTime
	}
	t, err := time.ParseInLocation(dateLayout+" 15:04", date+" "+hhmm, zone)
	if err != nil {
		return time.Time{}, fmt.Errorf("plan: slot %s %s: %w", date, hhmm, err)
	}
	return t, nil
}

// SeedFor derives the planner seed from the plan generation (Regenerate bumps the generation, so it reshuffles).
// It is deterministic, non-negative and differs for different generations.
func SeedFor(generation int64) int64 {
	return int64(mix64(uint64(generation)) &^ (1 << 63))
}

// mix64 is the splitmix64 finaliser (a bijection on uint64).
func mix64(x uint64) uint64 {
	x ^= x >> 30
	x *= 0xbf58476d1ce4e5b9
	x ^= x >> 27
	x *= 0x94d049bb133111eb
	x ^= x >> 31
	return x
}

// BuildInput maps a Snapshot to the planner's Input.
//
//   - Slots: one planner.Slot per SlotInfo, At = SlotInstant(date, time). A slot with no existing meal whose At is
//     before Now is dropped (the past cannot be planned); a slot with an existing meal is always kept.
//   - Existing: Planned unpinned -> MealPlanned, Planned pinned -> MealPinned, Cooked -> MealCooked, Skipped ->
//     MealSkipped, with Recipe, Batches and From (Source -> planner.LeftoverSource). Keys listed in Clear make an
//     unpinned Planned meal count as empty. A Planned meal whose slot is already over (At before Now) and has not
//     been confirmed is passed as MealPinned: it happened, only Cooked / Not cooked resolves it, and the planner must
//     neither replan nor drop it (it still counts for Stock, Leftovers and Cool-down). Clear does not apply to it.
//   - Rules: SlotRules of the slot's Meal Slot id.
//   - Attendance: Factor <= 0 attendees are dropped.
//   - Tags (recipes and rules) are normalised with recipe.TagKey; Variety Rules likewise.
//   - Leftovers: only Status available with Portions > 0 (the planner decides Use-by), FromSlot from Leftover.From.
//   - LastPlanned: the latest History date per Recipe.
//   - Config: planner.DefaultConfig() with the Household's Cool-down and Use-by days. Style, Seed, Now as given.
//
// ErrNoZone when Zone is nil, ErrBadTime for a malformed slot time.
func BuildInput(s Snapshot) (planner.Input, error) {
	if s.Zone == nil {
		return planner.Input{}, ErrNoZone
	}
	meals := make(map[Key]Meal, len(s.Meals))
	for _, m := range s.Meals {
		meals[m.Key] = m
	}
	clear := make(map[Key]bool, len(s.Clear))
	for _, k := range s.Clear {
		clear[k] = true
	}
	rules := map[int64][]SlotRule{}
	for _, r := range s.SlotRules {
		rules[r.MealSlotID] = append(rules[r.MealSlotID], r)
	}

	in := planner.Input{
		Now: s.Now, Seed: s.Seed, Style: s.Settings.Style,
		Config: planner.DefaultConfig(),
	}
	in.Config.DefaultCooldownDays = s.Settings.DefaultCooldownDays
	in.Config.DefaultUseByDays = s.Settings.DefaultUseByDays

	for _, si := range s.Slots {
		at, err := SlotInstant(si.Key.Date, si.Time, s.Zone)
		if err != nil {
			return planner.Input{}, err
		}
		m, hasMeal := meals[si.Key]
		if !hasMeal && at.Before(s.Now) {
			continue // the past cannot be planned
		}
		slot := planner.Slot{
			Key:        pkey(si.Key),
			At:         at,
			Attendance: attendance(si.Attendance),
			Rules:      slotRules(rules[si.Key.MealSlotID]),
		}
		if hasMeal {
			slot.Existing = existing(m, at, s.Now, clear[si.Key])
		}
		in.Slots = append(in.Slots, slot)
	}

	for _, r := range s.Recipes {
		r.Tags = normaliseTags(r.Tags)
		in.Recipes = append(in.Recipes, r)
	}
	if s.Preferences != nil {
		in.Members = make(map[planner.MemberID]planner.Preferences, len(s.Preferences))
		for id, p := range s.Preferences {
			in.Members[planner.MemberID(id)] = p
		}
	}
	in.Lots = s.Lots
	in.ShelfLifeDays = s.ShelfLife
	in.Packs = s.Packs
	for _, l := range s.Leftovers {
		if l.Status != LeftoverAvailable || l.Portions <= 0 {
			continue
		}
		in.Leftovers = append(in.Leftovers, planner.Leftover{
			ID: l.ID, FromSlot: pkey(l.From), RecipeID: planner.RecipeID(l.RecipeID),
			Portions: l.Portions, CookedOn: planner.Date(l.CookedOn), UseBy: planner.Date(l.UseBy),
		})
	}
	in.LastPlanned = map[planner.RecipeID]planner.Date{}
	for _, h := range s.History {
		id := planner.RecipeID(h.RecipeID)
		if d := planner.Date(h.Date); d > in.LastPlanned[id] {
			in.LastPlanned[id] = d
		}
	}
	for _, v := range s.VarietyRules {
		in.VarietyRules = append(in.VarietyRules, planner.VarietyRule{
			Tag: planner.Tag(recipe.TagKey(v.Tag)), MaxPerWeek: v.MaxPerWeek, NotConsecutiveDays: v.NotConsecutiveDays,
		})
	}
	return in, nil
}

// existing maps a stored Planned Meal to the planner's view of its slot.
func existing(m Meal, at, now time.Time, cleared bool) *planner.ExistingMeal {
	em := &planner.ExistingMeal{RecipeID: planner.RecipeID(m.RecipeID), Batches: m.Batches}
	if m.From != nil {
		em.From = &planner.LeftoverSource{LeftoverID: m.From.LeftoverID, FromSlot: pkey(m.From.From)}
	}
	switch m.State {
	case StateCooked:
		em.State = planner.MealCooked
	case StateSkipped:
		em.State = planner.MealSkipped
	default: // planned
		switch {
		case m.Pinned:
			em.State = planner.MealPinned
		case at.Before(now):
			// Happened, not confirmed: it waits in "To confirm" and is never replanned.
			em.State = planner.MealPinned
		case cleared:
			return nil
		default:
			em.State = planner.MealPlanned
		}
	}
	return em
}

func attendance(att []Attendee) []planner.Attendee {
	var out []planner.Attendee
	for _, a := range att {
		if a.Factor <= 0 {
			continue
		}
		out = append(out, planner.Attendee{MemberID: planner.MemberID(a.MemberID), PortionFactor: a.Factor})
	}
	return out
}

func slotRules(rs []SlotRule) []planner.SlotRule {
	var out []planner.SlotRule
	for _, r := range rs {
		if r.Tag != "" {
			out = append(out, planner.SlotRule{Tag: planner.Tag(recipe.TagKey(r.Tag))})
			continue
		}
		out = append(out, planner.SlotRule{RecipeID: planner.RecipeID(r.RecipeID)})
	}
	return out
}

func normaliseTags(tags []planner.Tag) []planner.Tag {
	if tags == nil {
		return nil
	}
	out := make([]planner.Tag, 0, len(tags))
	for _, t := range tags {
		out = append(out, planner.Tag(recipe.TagKey(string(t))))
	}
	return out
}

func pkey(k Key) planner.SlotKey {
	return planner.SlotKey{Date: planner.Date(k.Date), MealSlotID: k.MealSlotID}
}

func keyOf(k planner.SlotKey) Key {
	return Key{Date: string(k.Date), MealSlotID: k.MealSlotID}
}

// Reconcile turns the planner's Result into row changes against the Snapshot it came from.
//
//   - Every Placement becomes an upsert: State planned, not Pinned, Batches, Portions, From (planner.LeftoverSource ->
//     Source), Why converted with WhyFrom.
//   - An existing unpinned Planned meal whose slot is not over yet and that is neither in Result.Kept nor re-placed (so it
//     was invalid or cleared and nothing replaced it) is deleted. Pinned, Cooked and Skipped meals, and unconfirmed meals
//     whose slot is already over, are never touched.
//   - Result.Unfilled become Unfilled rows; every other slot of the snapshot is in ClearUnfilled.
func Reconcile(s Snapshot, res planner.Result) Changes {
	var ch Changes
	placed := map[Key]bool{}
	for _, p := range res.Placements {
		k := keyOf(p.Key)
		placed[k] = true
		m := Meal{
			Key: k, RecipeID: int64(p.RecipeID), Batches: float64(p.Batches), Portions: p.Portions,
			State: StatePlanned, Why: WhyAll(p.Why),
		}
		if p.From != nil {
			m.From = &Source{LeftoverID: p.From.LeftoverID, From: keyOf(p.From.FromSlot)}
		}
		ch.Upserts = append(ch.Upserts, m)
	}

	kept := map[Key]bool{}
	for _, k := range res.Kept {
		kept[keyOf(k)] = true
	}
	slotAt := map[Key]time.Time{}
	for _, si := range s.Slots {
		if at, err := SlotInstant(si.Key.Date, si.Time, s.Zone); err == nil {
			slotAt[si.Key] = at
		}
	}
	for _, m := range s.Meals {
		if m.State != StatePlanned || m.Pinned || kept[m.Key] || placed[m.Key] {
			continue
		}
		at, ok := slotAt[m.Key]
		if !ok || at.Before(s.Now) {
			continue // unconfirmed and over: stays in To confirm
		}
		ch.Deletes = append(ch.Deletes, m.Key)
	}

	unfilled := map[Key]bool{}
	for _, u := range res.Unfilled {
		k := keyOf(u.Key)
		unfilled[k] = true
		ch.Unfilled = append(ch.Unfilled, Unfilled{
			Key: k, Reason: string(u.Reason), SlotRuleClaimed: u.SlotRuleClaimed,
			Eliminated: Eliminations{Considered: u.Eliminated.Considered, Exclusion: u.Eliminated.Exclusion,
				CoolDown: u.Eliminated.CoolDown, VarietyRule: u.Eliminated.VarietyRule, AdvanceStep: u.Eliminated.AdvanceStep},
		})
	}
	for _, si := range s.Slots {
		if !unfilled[si.Key] {
			ch.ClearUnfilled = append(ch.ClearUnfilled, si.Key)
		}
	}
	return ch
}

// WhyFrom converts a planner chip to the stored form (the Date is kept as is).
func WhyFrom(w planner.Why) Why {
	out := Why{
		Code: string(w.Code), Value: w.Value, IngredientID: int64(w.IngredientID),
		RecipeID: int64(w.RecipeID), Tag: string(w.Tag), Date: string(w.Date),
	}
	for _, m := range w.MemberIDs {
		out.MemberIDs = append(out.MemberIDs, int64(m))
	}
	return out
}

// WhyAll converts a placement's chips.
func WhyAll(ws []planner.Why) []Why {
	if len(ws) == 0 {
		return nil
	}
	out := make([]Why, 0, len(ws))
	for _, w := range ws {
		out = append(out, WhyFrom(w))
	}
	return out
}

// EncodeWhy and DecodeWhy are the JSON stored in planned_meals.why_json ("[]" for none).
func EncodeWhy(ws []Why) (string, error) {
	if ws == nil {
		ws = []Why{}
	}
	b, err := json.Marshal(ws)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

func DecodeWhy(s string) ([]Why, error) {
	var out []Why
	if err := json.Unmarshal([]byte(s), &out); err != nil {
		return nil, fmt.Errorf("plan: why_json: %w", err)
	}
	if len(out) == 0 {
		return nil, nil
	}
	return out, nil
}

// knownReasons are the reasons an explicit invalidation may carry.
var knownReasons = map[Reason]bool{
	ReasonNightly: true, ReasonRegenerate: true, ReasonRecipeChanged: true, ReasonAttendanceChanged: true,
	ReasonUnpinned: true, ReasonLeftoversChanged: true, ReasonStockTake: true, ReasonRulesChanged: true,
	ReasonPinned: true, ReasonNotCooked: true,
}

// Invalidate tells the Runner the plan may be stale (publishes on InvalidateTopic). Safe to call from any module.
func Invalidate(p Publisher, reason Reason) {
	if p == nil {
		return
	}
	p.Publish(InvalidateTopic, struct {
		Reason Reason `json:"reason"`
	}{reason})
}

// ReasonForEvent says whether an event on another module's topic invalidates the plan, and why:
//
//	"plan.invalidate" {"reason": r}                       -> r (unknown or empty reasons are ignored)
//	"recipes" (any event: a Recipe, or a Member's preferences) -> ReasonRecipeChanged
//	"household" {"changed": "attendance"|"mealSlots"|"members"|"settings"} -> ReasonAttendanceChanged
//	"stock" {"changed": "lots"}                           -> ReasonStockTake
//
// Everything else (stock waste, the "plan" topic itself, products, ...) is ignored.
func ReasonForEvent(topic string, data []byte) (Reason, bool) {
	switch topic {
	case InvalidateTopic:
		var p struct {
			Reason Reason `json:"reason"`
		}
		if json.Unmarshal(data, &p) != nil || !knownReasons[p.Reason] {
			return "", false
		}
		return p.Reason, true
	case "recipes":
		return ReasonRecipeChanged, true
	case "household":
		var p struct {
			Changed string `json:"changed"`
		}
		if json.Unmarshal(data, &p) != nil {
			return "", false
		}
		switch p.Changed {
		case "attendance", "mealSlots", "members", "settings":
			return ReasonAttendanceChanged, true
		}
	case "stock":
		var p struct {
			Changed string `json:"changed"`
		}
		if json.Unmarshal(data, &p) == nil && p.Changed == "lots" {
			return ReasonStockTake, true
		}
	}
	return "", false
}

// dateLayout is the household date format (YYYY-MM-DD).
const dateLayout = "2006-01-02"

// parseHHMM returns the minutes after midnight of a strict HH:MM time.
func parseHHMM(hhmm string) (int, error) {
	if len(hhmm) != 5 || hhmm[2] != ':' {
		return 0, ErrBadTime
	}
	t, err := time.Parse("15:04", hhmm)
	if err != nil {
		return 0, ErrBadTime
	}
	return t.Hour()*60 + t.Minute(), nil
}
