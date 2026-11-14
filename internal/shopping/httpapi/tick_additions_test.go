package httpapi_test

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/testkit"
)

// B9-23 (SSP-01, SSP-02, RES-03) over HTTP. The test household date is Monday 2026-11-09 and the default range ends
// 2026-11-15. The first User's display name is "User"; the second is Sam.
//
// Contract pinned here:
//   - GET /api/shopping/list: each Line has `tick`, null when open, else {by: "hand"|"scan", added: number|null (null when
//     the tick added nothing), additions: [{who, mine, by, quantity, clientUuid, tickedAt, syncedAt}]} (oldest first;
//     syncedAt null for an online tick). A Line with More has `more` (Base Units); it is absent otherwise. An Ingredient
//     extra has the same `tick`.
//   - POST /api/shopping/ticks answers {ticked, lotId, created, added, alsoTickedBy: [{name, quantity, by}]}.
//   - PATCH /api/shopping/ticks {ingredientId, to, quantity, clientUuid?, shopId?} -> 200 {ticked: true, lotId|null,
//     quantity}; 404 not_found (no such tick or addition), 422 validation_failed (negative), 409 not_by_hand (a Scan's).
//   - PATCH /api/shopping/extras/{id}/tick {quantity} -> 200 with the extra as the list shows it.

type tAddition struct {
	Who        string  `json:"who"`
	Mine       bool    `json:"mine"`
	By         string  `json:"by"`
	Quantity   float64 `json:"quantity"`
	ClientUUID string  `json:"clientUuid"`
	TickedAt   string  `json:"tickedAt"`
	SyncedAt   *string `json:"syncedAt"`
}

type tTick struct {
	By        string      `json:"by"`
	Added     *float64    `json:"added"`
	Additions []tAddition `json:"additions"`
}

type tLine struct {
	IngredientID int64   `json:"ingredientId"`
	Quantity     float64 `json:"quantity"`
	Ticked       bool    `json:"ticked"`
	More         float64 `json:"more"`
	Tick         *tTick  `json:"tick"`
}

type tList struct {
	Lines    []tLine `json:"lines"`
	Extras   []tExtra
	Progress struct {
		Ticked int `json:"ticked"`
		Total  int `json:"total"`
	} `json:"progress"`
	Complete bool `json:"complete"`
}

type tExtra struct {
	ID     int64   `json:"id"`
	Ticked bool    `json:"ticked"`
	Tick   *tTick  `json:"tick"`
	Qty    float64 `json:"quantity"`
}

func listAs(t *testing.T, c *testkit.Client) (tList, map[string]any) {
	t.Helper()
	r := c.Get("/api/shopping/list")
	var v tList
	r.MustJSON(t, &v)
	var raw map[string]any
	_ = json.Unmarshal(r.Body, &raw)
	var ex struct {
		Extras []tExtra `json:"extras"`
	}
	r.MustJSON(t, &ex)
	v.Extras = ex.Extras
	if r.Status != 200 {
		t.Fatalf("list = %d %s", r.Status, r.Body)
	}
	return v, raw
}

func lineOf(t *testing.T, v tList, ing int64) tLine {
	t.Helper()
	for _, l := range v.Lines {
		if l.IngredientID == ing {
			return l
		}
	}
	t.Fatalf("no Line for Ingredient %d in %+v", ing, v.Lines)
	return tLine{}
}

func tickBody(ing int64, q float64, uuid string) map[string]any {
	return map[string]any{"ingredientId": ing, "to": "2026-11-15", "quantity": q, "clientUuid": uuid}
}

func twoUsers(t *testing.T) (env *testkit.Env, ana, sam *testkit.Client) {
	t.Helper()
	env = testkit.Start(t)
	env.AddUser(t, "sam@example.test", "Sam", false)
	return env, env.LoginUser(t), env.LoginAs(t, "sam@example.test")
}

// addMeal plants a second Planned Meal (a Side) in the Tuesday Dinner that seedCourseDinner made.
func addMeal(t *testing.T, env *testkit.Env, recipe string, ing int64, grams float64) {
	t.Helper()
	for _, q := range []struct {
		sql  string
		args []any
	}{
		{`INSERT INTO recipes(id,name,yield,created_at,updated_at) VALUES (200,?,4,'2026-11-09T12:00:00Z','2026-11-09T12:00:00Z')`, []any{recipe}},
		{`INSERT INTO recipe_lines(recipe_id,position,ingredient_id,quantity,unit) VALUES (200,0,?,?,'g')`, []any{ing, grams}},
		{`INSERT INTO planned_meals(date,meal_slot_id,course_id,recipe_id,batches,portions,created_at,updated_at)
			VALUES ('2026-11-10',90,(SELECT id FROM courses WHERE name='Side'),200,1,4,'2026-11-09T12:00:00Z','2026-11-09T12:00:00Z')`, nil},
	} {
		if _, err := env.DB.Exec(q.sql, q.args...); err != nil {
			t.Fatalf("%s: %v", q.sql, err)
		}
	}
}

func TestAnOpenLineHasNoTickAndNoMore(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	rice := seedIngredient(t, env, "rice", "g")
	seedCourseDinner(t, env, courseMeal{"Main", "Risotto", rice, 300, 1})
	_, raw := listAs(t, c)
	line := raw["lines"].([]any)[0].(map[string]any)
	if v, has := line["tick"]; !has || v != nil {
		t.Errorf("open Line tick = %v (present %v), want null", v, has)
	}
	if _, has := line["more"]; has {
		t.Errorf("open Line has a `more` key: %v", line)
	}
}

func TestATickByHandAnswersWhatItAddedAndTheListSaysSo(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	rice := seedIngredient(t, env, "rice", "g")
	seedCourseDinner(t, env, courseMeal{"Main", "Risotto", rice, 300, 1})
	var res struct {
		Ticked       bool    `json:"ticked"`
		LotID        *int64  `json:"lotId"`
		Created      bool    `json:"created"`
		Added        float64 `json:"added"`
		AlsoTickedBy []any   `json:"alsoTickedBy"`
	}
	r := c.Post("/api/shopping/ticks", tickBody(rice, 500, "t1"))
	r.MustJSON(t, &res)
	if r.Status != 200 || !res.Ticked || res.LotID == nil || !res.Created || res.Added != 500 || res.AlsoTickedBy == nil || len(res.AlsoTickedBy) != 0 {
		t.Fatalf("tick = %d %s; want ticked, a Lot, created, added 500 and an empty alsoTickedBy array", r.Status, r.Body)
	}
	v, _ := listAs(t, c)
	l := lineOf(t, v, rice)
	if !l.Ticked || l.Tick == nil || l.Tick.By != "hand" || l.Tick.Added == nil || *l.Tick.Added != 500 || len(l.Tick.Additions) != 1 {
		t.Fatalf("Line = %+v Tick %+v; want ticked by hand, 500 added, one addition", l, l.Tick)
	}
	a := l.Tick.Additions[0]
	if a.Who != "User" || !a.Mine || a.By != "hand" || a.Quantity != 500 || a.ClientUUID != "t1" || a.TickedAt == "" || a.SyncedAt != nil {
		t.Errorf("addition = %+v, want my 500 by hand, UUID t1, a time, not synced late", a)
	}
}

func TestATickWithoutAddingSaysAddedNull(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	rice := seedIngredient(t, env, "rice", "g")
	seedCourseDinner(t, env, courseMeal{"Main", "Risotto", rice, 300, 1})
	c.Post("/api/shopping/ticks", tickBody(rice, 0, "t1"))
	v, raw := listAs(t, c)
	l := lineOf(t, v, rice)
	if !l.Ticked || l.Tick == nil || l.Tick.Added != nil || len(l.Tick.Additions) != 1 || l.Tick.Additions[0].Quantity != 0 {
		t.Errorf("Line %+v Tick %+v; want ticked with added null and an addition of 0 (%v)", l, l.Tick, raw["lines"])
	}
	if got := stockOf(t, c, rice); len(got.Lots) != 0 {
		t.Errorf("Lots = %+v, want none", got.Lots)
	}
}

func TestTwoUsersTicksKeepBothLotsAndEachViewerSeesWhichIsTheirs(t *testing.T) {
	env, ana, sam := twoUsers(t)
	rice := seedIngredient(t, env, "rice", "g")
	seedCourseDinner(t, env, courseMeal{"Main", "Risotto", rice, 300, 1})
	ana.Post("/api/shopping/ticks", tickBody(rice, 300, "a"))
	var res struct {
		AlsoTickedBy []struct {
			Name     string  `json:"name"`
			Quantity float64 `json:"quantity"`
			By       string  `json:"by"`
		} `json:"alsoTickedBy"`
	}
	r := sam.Post("/api/shopping/ticks", tickBody(rice, 200, "b"))
	r.MustJSON(t, &res)
	if r.Status != 200 || len(res.AlsoTickedBy) != 1 || res.AlsoTickedBy[0].Name != "User" || res.AlsoTickedBy[0].Quantity != 300 || res.AlsoTickedBy[0].By != "hand" {
		t.Fatalf("Sam's tick = %d %s; want alsoTickedBy User's 300 by hand", r.Status, r.Body)
	}
	if got := stockOf(t, ana, rice); len(got.Lots) != 2 {
		t.Fatalf("Lots = %+v, want both Stock Lots", got.Lots)
	}
	for who, c := range map[string]*testkit.Client{"Ana": ana, "Sam": sam} {
		v, _ := listAs(t, c)
		l := lineOf(t, v, rice)
		if l.Tick == nil || l.Tick.Added == nil || *l.Tick.Added != 500 || len(l.Tick.Additions) != 2 || v.Progress.Ticked != 1 {
			t.Fatalf("%s sees %+v progress %+v; want one tick of two additions, 500 in all", who, l.Tick, v.Progress)
		}
		first, second := l.Tick.Additions[0], l.Tick.Additions[1]
		if first.Who != "User" || second.Who != "Sam" || first.Mine != (who == "Ana") || second.Mine != (who == "Sam") {
			t.Errorf("%s sees additions %+v", who, l.Tick.Additions)
		}
	}
}

func TestAnUntickTakesBackEveryAdditionOfAnotherUserToo(t *testing.T) {
	env, ana, sam := twoUsers(t)
	rice := seedIngredient(t, env, "rice", "g")
	seedCourseDinner(t, env, courseMeal{"Main", "Risotto", rice, 300, 1})
	ana.Post("/api/shopping/ticks", tickBody(rice, 300, "a"))
	sam.Post("/api/shopping/ticks", tickBody(rice, 200, "b"))
	if r := ana.Delete("/api/shopping/ticks?ingredientId=" + itoa(rice) + "&to=2026-11-15"); r.Status != 204 {
		t.Fatalf("untick = %d %s", r.Status, r.Body)
	}
	if got := stockOf(t, ana, rice); len(got.Lots) != 0 {
		t.Errorf("Lots = %+v, want none: the untick takes back every hand addition", got.Lots)
	}
	if v, _ := listAs(t, sam); lineOf(t, v, rice).Ticked {
		t.Error("the Line is still ticked")
	}
}

func patchTick(c *testkit.Client, ing int64, q float64, uuid string) *testkit.Response {
	body := map[string]any{"ingredientId": ing, "to": "2026-11-15", "quantity": q}
	if uuid != "" {
		body["clientUuid"] = uuid
	}
	return c.Patch("/api/shopping/ticks", body)
}

func TestPatchTickChangesTheQuantityTheTickAdded(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	rice := seedIngredient(t, env, "rice", "g")
	seedCourseDinner(t, env, courseMeal{"Main", "Risotto", rice, 300, 1})
	c.Post("/api/shopping/ticks", tickBody(rice, 300, "a"))
	var got struct {
		Ticked   bool    `json:"ticked"`
		LotID    *int64  `json:"lotId"`
		Quantity float64 `json:"quantity"`
	}
	r := patchTick(c, rice, 500, "")
	r.MustJSON(t, &got)
	if r.Status != 200 || !got.Ticked || got.LotID == nil || got.Quantity != 500 {
		t.Fatalf("PATCH = %d %s", r.Status, r.Body)
	}
	if lots := stockOf(t, c, rice); len(lots.Lots) != 1 || lots.Lots[0].Quantity != 500 || lots.Lots[0].ID != *got.LotID {
		t.Fatalf("Lots = %+v, want the tick's Lot at 500", lots.Lots)
	}
	if r := patchTick(c, rice, 100, ""); r.Status != 200 {
		t.Fatalf("PATCH down = %d %s", r.Status, r.Body)
	}
	v, _ := listAs(t, c)
	if l := lineOf(t, v, rice); l.Tick == nil || l.Tick.Added == nil || *l.Tick.Added != 100 || !l.Ticked {
		t.Errorf("Line %+v Tick %+v; want 100 added", l, l.Tick)
	}
}

func TestPatchTickToZeroTakesTheStockBackAndKeepsTheTick(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	rice := seedIngredient(t, env, "rice", "g")
	seedCourseDinner(t, env, courseMeal{"Main", "Risotto", rice, 300, 1})
	c.Post("/api/shopping/ticks", tickBody(rice, 300, "a"))
	var got struct {
		LotID    *int64  `json:"lotId"`
		Quantity float64 `json:"quantity"`
	}
	r := patchTick(c, rice, 0, "")
	r.MustJSON(t, &got)
	if r.Status != 200 || got.LotID != nil || got.Quantity != 0 {
		t.Fatalf("PATCH 0 = %d %s; want quantity 0 and no Lot", r.Status, r.Body)
	}
	if lots := stockOf(t, c, rice); len(lots.Lots) != 0 {
		t.Fatalf("Lots = %+v, want none", lots.Lots)
	}
	v, _ := listAs(t, c)
	if l := lineOf(t, v, rice); !l.Ticked || l.Tick == nil || l.Tick.Added != nil {
		t.Errorf("Line %+v Tick %+v; want ticked with added null", l, l.Tick)
	}
	// The toast's Undo sends the previous quantity.
	if r := patchTick(c, rice, 300, ""); r.Status != 200 {
		t.Fatalf("PATCH undo = %d %s", r.Status, r.Body)
	}
	if lots := stockOf(t, c, rice); len(lots.Lots) != 1 || lots.Lots[0].Quantity != 300 {
		t.Errorf("Lots = %+v, want 300 back", lots.Lots)
	}
}

func TestPatchTickAfterAPartialCookedTakesBackOnlyWhatIsLeft(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	rice := seedIngredient(t, env, "rice", "g")
	seedCourseDinner(t, env, courseMeal{"Main", "Risotto", rice, 300, 1})
	var tick struct {
		LotID *int64 `json:"lotId"`
	}
	c.Post("/api/shopping/ticks", tickBody(rice, 400, "a")).MustJSON(t, &tick)
	c.Post("/api/stock/lots", map[string]any{"ingredientId": rice, "quantity": 1000}) // another Lot stays
	if r := c.Patch("/api/stock/lots/"+itoa(*tick.LotID), map[string]any{"quantity": 150}); r.Status != 200 {
		t.Fatalf("use = %d %s", r.Status, r.Body)
	}
	if r := patchTick(c, rice, 0, ""); r.Status != 200 {
		t.Fatalf("PATCH 0 = %d %s", r.Status, r.Body)
	}
	if lots := stockOf(t, c, rice); len(lots.Lots) != 1 || lots.Lots[0].Quantity != 1000 {
		t.Errorf("Lots = %+v, want only the other 1000", lots.Lots)
	}
}

func TestPatchTickWithAClientUUIDTakesBackThatAdditionOnly(t *testing.T) {
	env, ana, sam := twoUsers(t)
	rice := seedIngredient(t, env, "rice", "g")
	seedCourseDinner(t, env, courseMeal{"Main", "Risotto", rice, 300, 1})
	ana.Post("/api/shopping/ticks", tickBody(rice, 300, "a"))
	sam.Post("/api/shopping/ticks", tickBody(rice, 200, "b"))
	// Without a UUID Sam's PATCH is his own latest addition ("Take mine back").
	if r := patchTick(sam, rice, 0, ""); r.Status != 200 {
		t.Fatalf("PATCH = %d %s", r.Status, r.Body)
	}
	lots := stockOf(t, ana, rice)
	if len(lots.Lots) != 1 || lots.Lots[0].Quantity != 300 {
		t.Fatalf("Lots = %+v, want only Ana's 300", lots.Lots)
	}
	v, _ := listAs(t, ana)
	l := lineOf(t, v, rice)
	if !l.Ticked || l.Tick == nil || len(l.Tick.Additions) != 2 || *l.Tick.Added != 300 {
		t.Errorf("Tick %+v; want both additions kept and 300 added", l.Tick)
	}
	// With a UUID any hand addition is addressed (PRODUCT QUESTION: may Sam take back Ana's?).
	if r := patchTick(sam, rice, 0, "a"); r.Status != 200 {
		t.Fatalf("PATCH by UUID = %d %s", r.Status, r.Body)
	}
	if lots := stockOf(t, ana, rice); len(lots.Lots) != 0 {
		t.Errorf("Lots = %+v, want none", lots.Lots)
	}
}

func TestPatchTickErrors(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	rice := seedIngredient(t, env, "rice", "g")
	seedCourseDinner(t, env, courseMeal{"Main", "Risotto", rice, 300, 1})
	if r := patchTick(c, rice, 100, ""); r.Status != http.StatusNotFound || r.ErrorCode() != "not_found" {
		t.Errorf("no tick = %d %s, want 404 not_found", r.Status, r.Body)
	}
	c.Post("/api/shopping/ticks", tickBody(rice, 300, "a"))
	if r := patchTick(c, rice, -5, ""); r.Status != http.StatusUnprocessableEntity || r.ErrorCode() != "validation_failed" {
		t.Errorf("negative = %d %s, want 422 validation_failed", r.Status, r.Body)
	}
	if r := patchTick(c, rice, 5, "nope"); r.Status != http.StatusNotFound {
		t.Errorf("unknown clientUuid = %d %s, want 404", r.Status, r.Body)
	}
	if r := c.Patch("/api/shopping/ticks", map[string]any{"to": "2026-11-15", "quantity": 5}); r.Status != http.StatusUnprocessableEntity && r.Status != http.StatusNotFound {
		t.Errorf("no ingredientId = %d %s", r.Status, r.Body)
	}
	if r := env.Anonymous().Patch("/api/shopping/ticks", tickBody(rice, 1, "")); r.Status != http.StatusUnauthorized || r.ErrorCode() != "unauthenticated" {
		t.Errorf("anonymous = %d %s", r.Status, r.Body)
	}
	if r := env.Anonymous().Patch("/api/shopping/extras/1/tick", map[string]any{"quantity": 1}); r.Status != http.StatusUnauthorized || r.ErrorCode() != "unauthenticated" {
		t.Errorf("anonymous extra = %d %s", r.Status, r.Body)
	}
}

func TestPatchExtraTickChangesAndTakesBack(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	milk := seedIngredient(t, env, "milk", "ml")
	var x struct {
		ID int64 `json:"id"`
	}
	c.Post("/api/shopping/extras", map[string]any{"ingredientId": milk, "quantity": 2000}).MustJSON(t, &x)
	c.Post("/api/shopping/extras/"+itoa(x.ID)+"/tick", map[string]any{"quantity": 2000, "clientUuid": "x1"})
	var got tExtra
	r := c.Patch("/api/shopping/extras/"+itoa(x.ID)+"/tick", map[string]any{"quantity": 2500})
	r.MustJSON(t, &got)
	if r.Status != 200 || got.ID != x.ID || !got.Ticked || got.Tick == nil || got.Tick.Added == nil || *got.Tick.Added != 2500 || len(got.Tick.Additions) != 1 {
		t.Fatalf("PATCH = %d %s; want the extra with 2500 added", r.Status, r.Body)
	}
	if lots := stockOf(t, c, milk); len(lots.Lots) != 1 || lots.Lots[0].Quantity != 2500 {
		t.Fatalf("Lots = %+v, want 2500", lots.Lots)
	}
	r = c.Patch("/api/shopping/extras/"+itoa(x.ID)+"/tick", map[string]any{"quantity": 0})
	r.MustJSON(t, &got)
	if r.Status != 200 || !got.Ticked || got.Tick == nil || got.Tick.Added != nil {
		t.Fatalf("PATCH 0 = %d %s; want ticked, nothing added", r.Status, r.Body)
	}
	if lots := stockOf(t, c, milk); len(lots.Lots) != 0 {
		t.Errorf("Lots = %+v, want none", lots.Lots)
	}
	if r := c.Patch("/api/shopping/extras/9999/tick", map[string]any{"quantity": 1}); r.Status != http.StatusNotFound {
		t.Errorf("unknown extra = %d %s", r.Status, r.Body)
	}
	if r := c.Patch("/api/shopping/extras/"+itoa(x.ID)+"/tick", map[string]any{"quantity": -1}); r.Status != http.StatusUnprocessableEntity {
		t.Errorf("negative = %d %s", r.Status, r.Body)
	}
}

func TestANeedThatGrowsAfterATickReappearsAsMoreAndTickingItCoversOnlyTheDifference(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	rice := seedIngredient(t, env, "rice", "g")
	seedCourseDinner(t, env, courseMeal{"Main", "Risotto", rice, 300, 1})
	c.Post("/api/shopping/ticks", tickBody(rice, 300, "a"))
	if v, _ := listAs(t, c); !v.Complete || v.Progress.Total != 1 {
		t.Fatalf("before the import: %+v complete %v", v.Progress, v.Complete)
	}
	addMeal(t, env, "Rice salad", rice, 750) // a Recipe import: 750 g more rice on Tuesday
	v, raw := listAs(t, c)
	l := lineOf(t, v, rice)
	if !l.Ticked || l.More != 750 || v.Progress.Total != 2 || v.Progress.Ticked != 1 || v.Complete {
		t.Fatalf("after the import: Line %+v progress %+v complete %v; want ticked with 750 more, 1 of 2, not complete (%v)", l, v.Progress, v.Complete, raw["lines"])
	}
	if r := c.Post("/api/shopping/ticks", tickBody(rice, 750, "b")); r.Status != 200 {
		t.Fatalf("tick the difference = %d %s", r.Status, r.Body)
	}
	v, raw = listAs(t, c)
	l = lineOf(t, v, rice)
	if l.More != 0 || !v.Complete || l.Tick == nil || len(l.Tick.Additions) != 2 || *l.Tick.Added != 1050 {
		t.Fatalf("after ticking the more row: Line %+v Tick %+v complete %v", l, l.Tick, v.Complete)
	}
	if _, has := raw["lines"].([]any)[0].(map[string]any)["more"]; has {
		t.Error("`more` is still sent after the difference was ticked")
	}
}

func TestNotNeededOnTheMoreRowTakesOffOnlyTheDifference(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	rice := seedIngredient(t, env, "rice", "g")
	seedCourseDinner(t, env, courseMeal{"Main", "Risotto", rice, 300, 1})
	c.Post("/api/shopping/ticks", tickBody(rice, 300, "a"))
	if r := c.Post("/api/shopping/not-needed", map[string]any{"ingredientId": rice, "to": "2026-11-15"}); r.Status != http.StatusConflict {
		t.Fatalf("Not needed on a covered ticked Line = %d %s, want 409", r.Status, r.Body)
	}
	addMeal(t, env, "Rice salad", rice, 750)
	r := c.Post("/api/shopping/not-needed", map[string]any{"ingredientId": rice, "to": "2026-11-15"})
	var v tList
	r.MustJSON(t, &v)
	l := lineOf(t, v, rice)
	if r.Status != 200 || !l.Ticked || l.More != 0 || !v.Complete {
		t.Errorf("Not needed on the more row = %d %s; want the ticked Line to stay, no more, complete", r.Status, r.Body)
	}
}
