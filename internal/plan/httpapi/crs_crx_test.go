package httpapi_test

import (
	"encoding/json"
	"fmt"
	"strings"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/testkit"
	"github.com/fabbarix/feeder-ng/internal/testkit/crsc2"
)

// Team C-RX: GET /api/plan/couldnt-plan/exclusions (docs/dev/design/crs-crx.md, rx-pt.md §3 and §6). The fixture is
// crsc2: a Monday Dinner on 2026-11-09 (today, 19:00) serving Main then Side, attended by Anna and Sam. The reasons
// are written as rows so each test fixes exactly the detail it reads.

const exclusionsPath = "/api/plan/couldnt-plan/exclusions"

type crxMember struct {
	ID       int64  `json:"id"`
	Name     string `json:"name"`
	Colour   string `json:"colour"`
	PhotoURL string `json:"photoUrl"`
	Avatar   string `json:"avatar"`
}

type crxRecord struct {
	Member     crxMember `json:"member"`
	Ingredient *struct {
		ID   int64  `json:"id"`
		Name string `json:"name"`
	} `json:"ingredient"`
	Recipes []struct {
		ID   int64  `json:"id"`
		Name string `json:"name"`
	} `json:"recipes"`
	RecipeCount int `json:"recipeCount"`
}

type crxCell struct {
	Date            string         `json:"date"`
	MealSlotID      int64          `json:"mealSlotId"`
	MealSlotName    string         `json:"mealSlotName"`
	Time            string         `json:"time"`
	CourseID        int64          `json:"courseId"`
	CourseName      string         `json:"courseName"`
	SlotRuleClaimed bool           `json:"slotRuleClaimed"`
	Eliminated      map[string]int `json:"eliminated"`
	Attendance      []crxMember    `json:"attendance"`
	OptOuts         []crxMember    `json:"optOuts"`
	Exclusions      []crxRecord    `json:"exclusions"`
	MoreExclusions  int            `json:"moreExclusions"`
}

func (c crxCell) recipeNames(i int) []string {
	out := []string{}
	for _, r := range c.Exclusions[i].Recipes {
		out = append(out, r.Name)
	}
	return out
}

func memberIDs(ms []crxMember) []int64 {
	out := []int64{}
	for _, m := range ms {
		out = append(out, m.ID)
	}
	return out
}

func readExclusions(t *testing.T, c *testkit.Client) ([]crxCell, []byte) {
	t.Helper()
	r := c.Get(exclusionsPath)
	if r.Status != 200 {
		t.Fatalf("GET %s = %d %s", exclusionsPath, r.Status, r.Body)
	}
	var out struct {
		Cells []crxCell `json:"cells"`
	}
	r.MustJSON(t, &out)
	return out.Cells, r.Body
}

// stored writes a no_candidates reason with its Exclusion count and detail ("" detail stores NULL).
func stored(w *crsc2.World, date string, slot, course int64, exclusion int, claimed bool, detail string) {
	w.T.Helper()
	c := 0
	if claimed {
		c = 1
	}
	elim := fmt.Sprintf(`{"considered":%d,"exclusion":%d,"coolDown":0,"varietyRule":0,"advanceStep":0}`, exclusion+1, exclusion)
	if detail == "" {
		w.Exec(`INSERT INTO plan_unfilled (date, meal_slot_id, course_id, reason, slot_rule_claimed, eliminated_json, exclusions_json) VALUES (?, ?, ?, 'no_candidates', ?, ?, NULL)`,
			date, slot, course, c, elim)
		return
	}
	w.Exec(`INSERT INTO plan_unfilled (date, meal_slot_id, course_id, reason, slot_rule_claimed, eliminated_json, exclusions_json) VALUES (?, ?, ?, 'no_candidates', ?, ?, ?)`,
		date, slot, course, c, elim, detail)
}

func record(member, ingredient int64, count int, recipes ...int64) string {
	b, _ := json.Marshal(map[string]any{"memberId": member, "ingredientId": ingredient, "recipeIds": recipes, "recipeCount": count})
	return string(b)
}

func detail(more int, records ...string) string {
	return fmt.Sprintf(`{"records":[%s],"more":%d}`, strings.Join(records, ","), more)
}

func TestExclusionsListsACellWithItsNamesResolved(t *testing.T) {
	w := crsc2.New(t)
	garlic := w.Ingredient("garlic")
	pesto := w.Recipe("Pesto beans", crsc2.RecipeSpec{Courses: []int64{w.Side}})
	aglio := w.Recipe("Aglio peas", crsc2.RecipeSpec{Courses: []int64{w.Side}})
	w.Settle()
	stored(w, crsc2.Today, w.Slot, w.Side, 2, false, detail(0, record(w.Sam, garlic, 2, pesto, aglio)))

	cells, body := readExclusions(t, w.User)
	if len(cells) != 1 {
		t.Fatalf("cells = %s, want the Side only", body)
	}
	c := cells[0]
	if c.Date != crsc2.Today || c.MealSlotID != w.Slot || c.MealSlotName != "Dinner" || c.Time != "19:00" {
		t.Errorf("slot = %+v", c)
	}
	if c.CourseID != w.Side || c.CourseName != "Side" || c.SlotRuleClaimed {
		t.Errorf("course = %d %q claimed %v, want the real Side id", c.CourseID, c.CourseName, c.SlotRuleClaimed)
	}
	if c.Eliminated["considered"] != 3 || c.Eliminated["exclusion"] != 2 {
		t.Errorf("eliminated = %+v", c.Eliminated)
	}
	for _, k := range []string{"considered", "exclusion", "coolDown", "varietyRule", "advanceStep"} {
		if _, ok := c.Eliminated[k]; !ok {
			t.Errorf("eliminated lacks %q: %+v", k, c.Eliminated)
		}
	}
	if len(c.Exclusions) != 1 {
		t.Fatalf("exclusions = %+v, want 1 record", c.Exclusions)
	}
	rec := c.Exclusions[0]
	if rec.Member.ID != w.Sam || rec.Member.Name != "Sam" || rec.Member.Colour != "#81b29a" {
		t.Errorf("member = %+v", rec.Member)
	}
	if rec.Ingredient == nil || rec.Ingredient.ID != garlic || rec.Ingredient.Name != "garlic" {
		t.Errorf("ingredient = %+v, want garlic", rec.Ingredient)
	}
	if got := c.recipeNames(0); len(got) != 2 || got[0] != "Aglio peas" || got[1] != "Pesto beans" {
		t.Errorf("recipes = %v, want the name order", got)
	}
	if rec.RecipeCount != 2 || c.MoreExclusions != 0 {
		t.Errorf("recipeCount %d more %d", rec.RecipeCount, c.MoreExclusions)
	}
}

func TestExclusionsAnswersEveryCellInPlanOrderWithRealCourseIDs(t *testing.T) {
	w := crsc2.New(t)
	garlic := w.Ingredient("garlic")
	soup := w.Recipe("Garlic soup", crsc2.RecipeSpec{})
	lunch := w.AddSlot(2, "Lunch", "12:30", w.Main) // Tuesday 2026-11-10
	w.Settle()
	rec := detail(0, record(w.Sam, garlic, 1, soup))
	// written out of order on purpose
	stored(w, "2026-11-10", lunch, w.Main, 1, true, rec)
	stored(w, crsc2.Today, w.Slot, w.Side, 1, false, rec)
	stored(w, crsc2.Today, w.Slot, w.Main, 1, false, rec)

	cells, body := readExclusions(t, w.User)
	var got []string
	for _, c := range cells {
		got = append(got, fmt.Sprintf("%s/%d/%d", c.Date, c.MealSlotID, c.CourseID))
		if c.CourseID == 0 {
			t.Errorf("the transition shim's Course 0 leaked: %s", body)
		}
	}
	want := []string{
		fmt.Sprintf("%s/%d/%d", crsc2.Today, w.Slot, w.Main),
		fmt.Sprintf("%s/%d/%d", crsc2.Today, w.Slot, w.Side),
		fmt.Sprintf("2026-11-10/%d/%d", lunch, w.Main),
	}
	if strings.Join(got, " ") != strings.Join(want, " ") {
		t.Fatalf("cells = %v, want date, slot time, the slot's Course order: %v", got, want)
	}
	if cells[0].CourseName != "Main" || cells[2].MealSlotName != "Lunch" || !cells[2].SlotRuleClaimed {
		t.Errorf("cells = %+v", cells)
	}
}

func TestExclusionsIsNullWhenNoDetailIsStored(t *testing.T) {
	w := crsc2.New(t)
	w.Settle()
	stored(w, crsc2.Today, w.Slot, w.Side, 3, false, "")

	cells, body := readExclusions(t, w.User)
	if len(cells) != 1 {
		t.Fatalf("cells = %s, want the Side (its count is above zero even before the detail is worked out)", body)
	}
	if cells[0].Exclusions != nil || !strings.Contains(string(body), `"exclusions":null`) {
		t.Errorf("exclusions = %+v in %s, want null", cells[0].Exclusions, body)
	}
	if cells[0].MoreExclusions != 0 || cells[0].Eliminated["exclusion"] != 3 {
		t.Errorf("cell = %+v", cells[0])
	}
}

func TestExclusionsCarriesTheMoreCount(t *testing.T) {
	w := crsc2.New(t)
	garlic := w.Ingredient("garlic")
	beans := w.Recipe("Beans", crsc2.RecipeSpec{Courses: []int64{w.Side}})
	w.Settle()
	stored(w, crsc2.Today, w.Slot, w.Side, 9, false, detail(2, record(w.Sam, garlic, 1, beans)))
	cells, _ := readExclusions(t, w.User)
	if len(cells) != 1 || cells[0].MoreExclusions != 2 || len(cells[0].Exclusions) != 1 {
		t.Errorf("cells = %+v, want one record and moreExclusions 2", cells)
	}
}

func TestExclusionsDropsAMemberRecipeAndIngredientThatAreGone(t *testing.T) {
	w := crsc2.New(t)
	garlic := w.Ingredient("garlic")
	beans := w.Recipe("Beans", crsc2.RecipeSpec{Courses: []int64{w.Side}})
	peas := w.Recipe("Peas", crsc2.RecipeSpec{Courses: []int64{w.Side}})
	w.Settle()
	// no foreign keys: a Member, an Ingredient and a Recipe that no longer exist
	stored(w, crsc2.Today, w.Slot, w.Side, 4, false, detail(0,
		record(9999, garlic, 1, beans),        // Member gone: record dropped
		record(w.Sam, 9999, 1, beans),         // Ingredient gone: record dropped
		record(w.Anna, garlic, 3, peas, 9999), // Recipe gone: dropped from its record, count less one
		record(w.Sam, 0, 1, 9999),             // direct record with no Recipe left: dropped
	))
	cells, body := readExclusions(t, w.User)
	if len(cells) != 1 || len(cells[0].Exclusions) != 1 {
		t.Fatalf("cells = %s, want one cell with Anna's record only", body)
	}
	rec := cells[0].Exclusions[0]
	if rec.Member.ID != w.Anna || len(rec.Recipes) != 1 || rec.Recipes[0].ID != peas || rec.RecipeCount != 2 {
		t.Errorf("record = %+v", rec)
	}
}

func TestExclusionsDirectRecordHasANullIngredient(t *testing.T) {
	w := crsc2.New(t)
	tart := w.Recipe("Fish pie", crsc2.RecipeSpec{Courses: []int64{w.Side}})
	w.Settle()
	stored(w, crsc2.Today, w.Slot, w.Side, 1, false, detail(0, record(w.Anna, 0, 1, tart)))
	cells, body := readExclusions(t, w.User)
	if len(cells) != 1 || len(cells[0].Exclusions) != 1 || cells[0].Exclusions[0].Ingredient != nil {
		t.Fatalf("cells = %s, want a record with ingredient null", body)
	}
	if !strings.Contains(string(body), `"ingredient":null`) {
		t.Errorf("ingredient must be present as null: %s", body)
	}
}

func TestExclusionsListsOnlyCellsWithAnExclusionCount(t *testing.T) {
	w := crsc2.New(t)
	garlic := w.Ingredient("garlic")
	beans := w.Recipe("Beans", crsc2.RecipeSpec{Courses: []int64{w.Side}})
	supper := w.AddSlot(2, "Supper", "20:00", w.Main)
	w.Settle()
	// Main: no_candidates but nothing excluded (soft rules only); Side: listed; Supper: another reason
	stored(w, crsc2.Today, w.Slot, w.Main, 0, false, "")
	stored(w, crsc2.Today, w.Slot, w.Side, 1, false, detail(0, record(w.Sam, garlic, 1, beans)))
	w.Unfilled("2026-11-10", supper, w.Main, "no_attendance")

	cells, body := readExclusions(t, w.User)
	if len(cells) != 1 || cells[0].CourseID != w.Side {
		t.Errorf("cells = %s, want the Side only", body)
	}
}

func TestExclusionsCoversTheDatesOfCouldntPlanOnly(t *testing.T) {
	w := crsc2.New(t)
	garlic := w.Ingredient("garlic")
	beans := w.Recipe("Beans", crsc2.RecipeSpec{Courses: []int64{w.Side}})
	early := w.AddSlot(1, "Breakfast", "08:00", w.Main) // Monday, already over at 12:00
	w.Settle()
	rec := detail(0, record(w.Sam, garlic, 1, beans))
	stored(w, crsc2.Today, early, w.Main, 1, false, rec)      // the slot is over
	stored(w, crsc2.Yesterday, w.Slot, w.Side, 1, false, rec) // before today
	stored(w, crsc2.NextMon, w.Slot, w.Side, 1, false, rec)   // beyond the Planning Horizon
	stored(w, crsc2.Today, w.Slot, w.Side, 1, false, rec)

	cells, body := readExclusions(t, w.User)
	if len(cells) != 1 || cells[0].Date != crsc2.Today || cells[0].MealSlotID != w.Slot {
		t.Errorf("cells = %s, want tonight's Side only", body)
	}
	// the same cells as couldnt-plan, which also holds them
	r := w.User.Get("/api/plan/couldnt-plan")
	var cp struct {
		Slots []struct {
			Date       string `json:"date"`
			MealSlotID int64  `json:"mealSlotId"`
			CourseID   int64  `json:"courseId"`
		} `json:"slots"`
	}
	r.MustJSON(t, &cp)
	if len(cp.Slots) != 1 || cp.Slots[0].Date != cells[0].Date || cp.Slots[0].CourseID != cells[0].CourseID {
		t.Errorf("couldnt-plan = %s, want the same cell as the Exclusions", r.Body)
	}
}

func TestExclusionsAttendanceIsTheCourseAttendanceAndOptOutsTheMembersWhoSkip(t *testing.T) {
	w := crsc2.New(t)
	garlic := w.Ingredient("garlic")
	beans := w.Recipe("Beans", crsc2.RecipeSpec{Courses: []int64{w.Side}})
	w.OptOut(w.Slot, w.Side, w.Anna) // Anna usually skips the Side
	w.Settle()
	rec := detail(0, record(w.Sam, garlic, 1, beans))
	stored(w, crsc2.Today, w.Slot, w.Main, 1, false, rec)
	stored(w, crsc2.Today, w.Slot, w.Side, 1, false, rec)

	cells, body := readExclusions(t, w.User)
	if len(cells) != 2 {
		t.Fatalf("cells = %s", body)
	}
	main, side := cells[0], cells[1]
	if got := memberIDs(main.Attendance); len(got) != 2 || got[0] != w.Anna || got[1] != w.Sam {
		t.Errorf("Main attendance = %v, want Anna and Sam", got)
	}
	if len(main.OptOuts) != 0 {
		t.Errorf("Main optOuts = %+v, want none", main.OptOuts)
	}
	if got := memberIDs(side.Attendance); len(got) != 1 || got[0] != w.Sam {
		t.Errorf("Side attendance = %v, want Sam only", got)
	}
	if got := memberIDs(side.OptOuts); len(got) != 1 || got[0] != w.Anna || side.OptOuts[0].Name != "Anna" {
		t.Errorf("Side optOuts = %+v, want Anna", side.OptOuts)
	}
	noNull(t, body, "optOuts")
	noNull(t, body, "attendance")
}

func TestExclusionsAttendanceFollowsADateOverride(t *testing.T) {
	w := crsc2.New(t)
	garlic := w.Ingredient("garlic")
	beans := w.Recipe("Beans", crsc2.RecipeSpec{Courses: []int64{w.Side}})
	w.OptOut(w.Slot, w.Side, w.Anna)
	w.OptOutOn(w.Slot, crsc2.Today, w.Side) // tonight everybody eats the Side
	w.Settle()
	stored(w, crsc2.Today, w.Slot, w.Side, 1, false, detail(0, record(w.Sam, garlic, 1, beans)))

	cells, body := readExclusions(t, w.User)
	if len(cells) != 1 || len(cells[0].Attendance) != 2 || len(cells[0].OptOuts) != 0 {
		t.Errorf("cell = %s, want both eating and no opt-out tonight", body)
	}
}

func TestExclusionsAnswersAnEmptyListNotNull(t *testing.T) {
	w := crsc2.New(t)
	w.Settle()
	r := w.User.Get(exclusionsPath)
	if r.Status != 200 || strings.TrimSpace(string(r.Body)) != `{"cells":[]}` {
		t.Errorf("GET = %d %s, want {\"cells\":[]}", r.Status, r.Body)
	}
}

func TestExclusionsIsOpenToAPlainUserAndNeedsASignIn(t *testing.T) {
	w := crsc2.New(t)
	w.Settle()
	if r := w.User.Get(exclusionsPath); r.Status != 200 {
		t.Errorf("User = %d %s, want 200", r.Status, r.Body)
	}
	if r := w.Admin.Get(exclusionsPath); r.Status != 200 {
		t.Errorf("Admin = %d %s, want 200", r.Status, r.Body)
	}
	if r := w.Env.Anonymous().Get(exclusionsPath); r.Status != 401 {
		t.Errorf("signed out = %d %s, want 401", r.Status, r.Body)
	}
}

// The literal route is more specific than the {date}/{slotId} patterns, so the mux picks it and answers cells, never
// a plan error such as unknown_slot for the "date" couldnt-plan.
func TestExclusionsRouteIsNotShadowedByTheDateSlotPatterns(t *testing.T) {
	w := crsc2.New(t)
	w.Settle()
	r := w.User.Get(exclusionsPath)
	var m map[string]json.RawMessage
	if r.Status != 200 || r.JSON(&m) != nil {
		t.Fatalf("GET = %d %s", r.Status, r.Body)
	}
	if _, ok := m["cells"]; !ok || len(m) != 1 {
		t.Errorf("answer = %s, want {cells}", r.Body)
	}
	// the route is GET only: the other verbs still reach the {date}/{slotId} routes, which refuse the date
	wantErr(t, "PUT on the literal", w.User.Put(exclusionsPath, map[string]any{"recipeId": 1}), 404, "unknown_slot")
	// and its neighbours are untouched
	if r := w.User.Get("/api/plan/couldnt-plan"); r.Status != 200 {
		t.Errorf("GET couldnt-plan = %d %s", r.Status, r.Body)
	}
	if r := w.User.Get("/api/plan/to-confirm"); r.Status != 200 {
		t.Errorf("GET to-confirm = %d %s", r.Status, r.Body)
	}
}

func TestNoExistingPlanPayloadCarriesTheExclusionDetail(t *testing.T) {
	w := crsc2.New(t)
	garlic := w.Ingredient("garlic")
	beans := w.Recipe("Beans", crsc2.RecipeSpec{Courses: []int64{w.Side}})
	w.Settle()
	stored(w, crsc2.Today, w.Slot, w.Side, 1, false, detail(0, record(w.Sam, garlic, 1, beans)))
	for _, p := range []string{"/api/plan?from=" + crsc2.Today + "&to=" + crsc2.Today, "/api/plan/couldnt-plan"} {
		r := w.User.Get(p)
		if r.Status != 200 {
			t.Fatalf("GET %s = %d %s", p, r.Status, r.Body)
		}
		for _, key := range []string{`"exclusions"`, `"moreExclusions"`, `"recipeCount"`} {
			if strings.Contains(string(r.Body), key) {
				t.Errorf("GET %s now carries %s: %s", p, key, r.Body)
			}
		}
	}
}
