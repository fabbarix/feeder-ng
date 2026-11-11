package httpapi_test

import (
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/auth"
	"github.com/fabbarix/feeder-ng/internal/testkit"
)

// rawPatch sends a PATCH with chosen headers so the CSRF guard can be exercised.
func rawPatch(t *testing.T, env *testkit.Env, c *testkit.Client, path, body string, headers map[string]string) *testkit.Response {
	t.Helper()
	req, err := http.NewRequest(http.MethodPatch, env.URL()+path, strings.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", "application/json")
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	if ck := c.Cookie(auth.CookieName); ck != nil {
		req.AddCookie(ck)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)
	return &testkit.Response{Status: resp.StatusCode, Header: resp.Header, Body: data}
}

// R15 API: PATCH /api/meal-slots/batch
//
//	{"match":"Dinner","weekdays":[1,2,3],"set":{"name"?,"time"?,"attendance"?}}
//	200 {"match":"Dinner","updated":[slotBody...],"skipped":[{"weekday":4,"reason":"no_slot"}]}
type batchOut struct {
	Match   string     `json:"match"`
	Updated []slotBody `json:"updated"`
	Skipped []struct {
		Weekday int    `json:"weekday"`
		Reason  string `json:"reason"`
	} `json:"skipped"`
}

func batch(weekdays []int, set map[string]any) map[string]any {
	return map[string]any{"match": "Dinner", "weekdays": weekdays, "set": set}
}

func listSlots(t *testing.T, c *testkit.Client) []slotBody {
	t.Helper()
	var l []slotBody
	c.Get("/api/meal-slots").MustJSON(t, &l)
	return l
}

func TestBatchEditsEveryMatchingSlotAndReportsSkippedDays(t *testing.T) {
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	anna, sam := mustMember(t, admin, "Anna", 1), mustMember(t, admin, "Sam", 0.5)
	for _, d := range []int{1, 2, 3} {
		mustSlot(t, admin, d, "Dinner", "19:00", attendeeBody{MemberID: anna.ID})
	}
	mustSlot(t, admin, 3, "Lunch", "12:30")
	mustSlot(t, admin, 5, "Lunch", "12:30")
	r := admin.Patch("/api/meal-slots/batch", batch([]int{1, 2, 3, 4}, map[string]any{"time": "19:45", "attendance": []attendeeBody{{MemberID: anna.ID}, {MemberID: sam.ID}}}))
	var out batchOut
	r.MustJSON(t, &out)
	if r.Status != 200 || len(out.Updated) != 3 || len(out.Skipped) != 1 || out.Skipped[0].Weekday != 4 || out.Skipped[0].Reason != "no_slot" {
		t.Fatalf("batch = %d %s", r.Status, r.Body)
	}
	for i, u := range out.Updated {
		if u.Weekday != i+1 || u.Time != "19:45" || u.PortionsNeeded != 1.5 || u.Name != "Dinner" {
			t.Errorf("updated[%d] = %+v", i, u)
		}
	}
	for _, s := range listSlots(t, admin) {
		if s.Name == "Lunch" && (s.Time != "12:30") {
			t.Errorf("Lunch touched: %+v", s)
		}
	}
}

func TestBatchOnlyChangesTheFieldsSent(t *testing.T) {
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	anna := mustMember(t, admin, "Anna", 1)
	mustSlot(t, admin, 1, "Dinner", "19:00", attendeeBody{MemberID: anna.ID})
	mustSlot(t, admin, 2, "Dinner", "20:00")
	var out batchOut
	admin.Patch("/api/meal-slots/batch", batch([]int{1, 2}, map[string]any{"name": "Supper"})).MustJSON(t, &out)
	l := listSlots(t, admin)
	if len(l) != 2 || l[0].Name != "Supper" || l[0].Time != "19:00" || len(l[0].Attendance) != 1 || l[1].Time != "20:00" {
		t.Fatalf("slots = %+v", l)
	}
	// An explicit empty attendance means nobody.
	admin.Patch("/api/meal-slots/batch", map[string]any{"match": "Supper", "weekdays": []int{1}, "set": map[string]any{"attendance": []attendeeBody{}}})
	if l := listSlots(t, admin); len(l[0].Attendance) != 0 || l[0].PortionsNeeded != 0 {
		t.Errorf("nobody: %+v", l[0])
	}
}

func TestBatchMatchesByNameIgnoringCase(t *testing.T) {
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	mustSlot(t, admin, 1, "Dinner", "19:00")
	var out batchOut
	admin.Patch("/api/meal-slots/batch", map[string]any{"match": "  dinner", "weekdays": []int{1}, "set": map[string]any{"time": "18:00"}}).MustJSON(t, &out)
	if len(out.Updated) != 1 || out.Updated[0].Time != "18:00" {
		t.Fatalf("out = %+v", out)
	}
}

func TestBatchIsAtomic(t *testing.T) {
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	anna := mustMember(t, admin, "Anna", 1)
	mustSlot(t, admin, 1, "Dinner", "19:00", attendeeBody{MemberID: anna.ID})
	mustSlot(t, admin, 2, "Dinner", "19:00", attendeeBody{MemberID: anna.ID})
	mustSlot(t, admin, 2, "Supper", "20:00")
	before := listSlots(t, admin)
	// Renaming Dinner to Supper clashes on Tuesday only; Monday must stay Dinner.
	r := admin.Patch("/api/meal-slots/batch", batch([]int{1, 2}, map[string]any{"name": "Supper", "time": "21:00"}))
	if r.Status != 409 || r.ErrorCode() != "duplicate_slot" {
		t.Fatalf("clash = %d %s", r.Status, r.Body)
	}
	// An unknown Member fails the whole batch.
	r = admin.Patch("/api/meal-slots/batch", batch([]int{1, 2}, map[string]any{"attendance": []attendeeBody{{MemberID: 9999}}}))
	if r.Status != 422 || r.ErrorCode() != "unknown_member" {
		t.Fatalf("unknown member = %d %s", r.Status, r.Body)
	}
	after := listSlots(t, admin)
	if len(after) != len(before) {
		t.Fatalf("slot count changed")
	}
	for i := range before {
		if before[i].Name != after[i].Name || before[i].Time != after[i].Time || len(before[i].Attendance) != len(after[i].Attendance) {
			t.Errorf("slot %d changed: %+v -> %+v", i, before[i], after[i])
		}
	}
}

func TestBatchValidation(t *testing.T) {
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	mustSlot(t, admin, 1, "Dinner", "19:00")
	cases := map[string]struct {
		body  map[string]any
		code  string
		field string
	}{
		"no match":       {map[string]any{"weekdays": []int{1}, "set": map[string]any{"time": "19:00"}}, "validation_failed", "match"},
		"no weekdays":    {batch([]int{}, map[string]any{"time": "19:00"}), "validation_failed", "weekdays"},
		"weekday 0":      {batch([]int{0}, map[string]any{"time": "19:00"}), "validation_failed", "weekdays"},
		"weekday 8":      {batch([]int{8}, map[string]any{"time": "19:00"}), "validation_failed", "weekdays"},
		"nothing to set": {batch([]int{1}, map[string]any{}), "validation_failed", "set"},
		"bad time":       {batch([]int{1}, map[string]any{"time": "7pm"}), "validation_failed", "time"},
		"blank name":     {batch([]int{1}, map[string]any{"name": " "}), "validation_failed", "name"},
		"nothing found":  {map[string]any{"match": "Brunch", "weekdays": []int{1}, "set": map[string]any{"time": "10:00"}}, "no_matching_slot", ""},
	}
	for name, c := range cases {
		r := admin.Patch("/api/meal-slots/batch", c.body)
		if r.Status != 422 || r.ErrorCode() != c.code || !strings.Contains(string(r.Body), c.field) {
			t.Errorf("%s: %d %s", name, r.Status, r.Body)
		}
	}
	if l := listSlots(t, admin); l[0].Time != "19:00" {
		t.Errorf("a refused batch changed %+v", l[0])
	}
}

func TestBatchIsAdminOnlyAndNeedsASession(t *testing.T) {
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	mustSlot(t, admin, 1, "Dinner", "19:00")
	body := batch([]int{1}, map[string]any{"time": "18:00"})
	if r := env.Anonymous().Patch("/api/meal-slots/batch", body); r.Status != 401 {
		t.Errorf("anonymous = %d", r.Status)
	}
	if r := env.LoginUser(t).Patch("/api/meal-slots/batch", body); r.Status != 403 {
		t.Errorf("User = %d", r.Status)
	}
	if listSlots(t, admin)[0].Time != "19:00" {
		t.Error("a refused call changed the slot")
	}
}

func TestBatchCarriesCSRFProtectionAndPublishesOneEvent(t *testing.T) {
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	mustSlot(t, admin, 1, "Dinner", "19:00")
	if r := rawPatch(t, env, admin, "/api/meal-slots/batch", `{"match":"Dinner","weekdays":[1],"set":{"time":"18:00"}}`, map[string]string{"Origin": "https://evil.example"}); r.Status != 403 || r.ErrorCode() != "cross_origin" {
		t.Errorf("cross-origin = %d %s", r.Status, r.Body)
	}
	if r := rawPatch(t, env, admin, "/api/meal-slots/batch", `x`, map[string]string{"Content-Type": "text/plain"}); r.Status != 415 {
		t.Errorf("form body = %d", r.Status)
	}
	if listSlots(t, admin)[0].Time != "19:00" {
		t.Error("a refused call changed the slot")
	}
}

func TestBatchPublishesOneMealSlotsEvent(t *testing.T) {
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	mustSlot(t, admin, 1, "Dinner", "19:00")
	mustSlot(t, admin, 2, "Dinner", "19:00")
	ch, cancel := env.App.Deps.Events.Subscribe("household")
	defer cancel()
	admin.Patch("/api/meal-slots/batch", batch([]int{1, 2}, map[string]any{"time": "18:00"}))
	if topic, data := nextEvent(t, ch); topic != "household" || !strings.Contains(data, `"mealSlots"`) {
		t.Fatalf("event = %s %s", topic, data)
	}
}
