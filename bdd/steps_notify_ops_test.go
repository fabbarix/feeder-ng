package bdd

import (
	"context"
	"crypto/ecdh"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/cucumber/godog"

	"github.com/fabbarix/feeder-ng/internal/backup"
	"github.com/fabbarix/feeder-ng/internal/db"
	"github.com/fabbarix/feeder-ng/internal/notify"
	notifyapi "github.com/fabbarix/feeder-ng/internal/notify/httpapi"
	"github.com/fabbarix/feeder-ng/internal/testkit"
)

func init() { RegisterSteps("notify-ops", notifyOpsSteps) }

// recSender stands in for the push service: it records what would be sent.
type recSender struct {
	mu      sync.Mutex
	sent    []sentPush
	gone    map[string]bool // endpoints that answer 410
	failing bool
}

type sentPush struct {
	endpoint string
	payload  notify.Payload
}

func (s *recSender) Send(_ context.Context, to notify.Target, p notify.Payload) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.gone[to.Endpoint] {
		return notify.ErrGone
	}
	if s.failing {
		return errors.New("push service unavailable")
	}
	s.sent = append(s.sent, sentPush{to.Endpoint, p})
	return nil
}

func (s *recSender) to(endpoint string) []sentPush {
	s.mu.Lock()
	defer s.mu.Unlock()
	var out []sentPush
	for _, p := range s.sent {
		if p.endpoint == endpoint {
			out = append(out, p)
		}
	}
	return out
}

func (s *recSender) total() int { s.mu.Lock(); defer s.mu.Unlock(); return len(s.sent) }

// stepFacts is a fixed, mutable fact source.
type stepFacts struct {
	mu sync.Mutex
	f  notify.Facts
}

func (s *stepFacts) Facts(context.Context, time.Time) (notify.Facts, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.f, nil
}

// notifyWorld is the per-scenario state of these steps (w.Vars["notify-ops"]).
type notifyWorld struct {
	sender  *recSender
	facts   *stepFacts
	loc     *time.Location
	devices map[string]int64 // label -> device id
	nextID  int64
	vapid   string
	tickErr error
}

const baseDay = "2026-11-09" // the testkit clock's date

func notifyOpsSteps(sc *godog.ScenarioContext, w *World) {
	nw := func() *notifyWorld {
		if v, ok := w.Vars["notify-ops"].(*notifyWorld); ok {
			return v
		}
		v := &notifyWorld{loc: time.UTC, devices: map[string]int64{}, facts: &stepFacts{}, sender: &recSender{gone: map[string]bool{}}}
		w.Vars["notify-ops"] = v
		return v
	}
	day := func(offset int) time.Time {
		d, _ := time.Parse("2006-01-02", baseDay)
		return d.AddDate(0, 0, offset)
	}
	dateStr := func(offset int) string { return day(offset).Format("2006-01-02") }
	at := func(offset int, hhmm string) time.Time {
		var h, m int
		fmt.Sscanf(hhmm, "%d:%d", &h, &m)
		d := day(offset)
		return time.Date(d.Year(), d.Month(), d.Day(), h, m, 0, 0, nw().loc)
	}

	// ---- push devices ----
	keys := func() map[string]string {
		k, _ := ecdh.P256().GenerateKey(rand.Reader)
		a := make([]byte, 16)
		rand.Read(a)
		return map[string]string{
			"p256dh": base64.RawURLEncoding.EncodeToString(k.PublicKey().Bytes()),
			"auth":   base64.RawURLEncoding.EncodeToString(a),
		}
	}
	register := func(label, endpoint string, on []string, brokenKeys bool) {
		w.Ensure()
		body := map[string]any{"endpoint": endpoint, "label": label, "keys": keys()}
		if brokenKeys {
			body["keys"] = map[string]string{"p256dh": "x", "auth": "y"}
		}
		if len(on) > 0 {
			types := map[string]bool{}
			for _, t := range on {
				types[strings.TrimSpace(t)] = true
			}
			body["types"] = types
		}
		w.Last = w.Client.Do("POST", "/api/notifications/devices", body)
		var out struct {
			ID int64 `json:"id"`
		}
		if w.Last.Status < 300 && w.Last.JSON(&out) == nil {
			nw().devices[label] = out.ID
		}
	}
	split := func(s string) []string {
		var out []string
		for _, p := range strings.Split(s, ",") {
			if p = strings.TrimSpace(p); p != "" {
				out = append(out, p)
			}
		}
		return out
	}
	listDevices := func() ([]map[string]any, error) {
		r := w.Client.Get("/api/notifications/devices")
		var out struct {
			Devices []map[string]any `json:"devices"`
		}
		if r.Status != 200 || r.JSON(&out) != nil {
			return nil, fmt.Errorf("list devices: %d %s", r.Status, r.Body)
		}
		return out.Devices, nil
	}
	setType := func(label, typ string, on bool, owner string) {
		id, ok := nw().devices[label]
		if !ok {
			id = 0
		}
		w.Last = w.Client.Do("PUT", fmt.Sprintf("/api/notifications/devices/%d", id), map[string]any{"types": map[string]bool{typ: on}})
	}

	sc.Step(`^I ask for the push configuration$`, func() { w.Ensure(); w.Last = w.Client.Get("/api/notifications/config") })
	sc.Step(`^the push configuration has a VAPID public key$`, func() error {
		var out struct {
			Key string `json:"vapidPublicKey"`
		}
		if err := w.Last.JSON(&out); err != nil || len(out.Key) < 40 {
			return fmt.Errorf("no VAPID public key in %s", w.Last.Body)
		}
		return nil
	})
	sc.Step(`^the push configuration lists (\d+) notification types$`, func(n int) error {
		var out struct {
			Types []string `json:"types"`
		}
		if err := w.Last.JSON(&out); err != nil || len(out.Types) != n {
			return fmt.Errorf("types %v, want %d", out.Types, n)
		}
		return nil
	})
	key := func() string {
		var out struct {
			Key string `json:"vapidPublicKey"`
		}
		_ = w.Client.Get("/api/notifications/config").JSON(&out)
		return out.Key
	}
	sc.Step(`^I note the VAPID public key$`, func() { nw().vapid = key() })
	sc.Step(`^the VAPID public key is unchanged$`, func() error {
		if got := key(); got == "" || got != nw().vapid {
			return fmt.Errorf("VAPID key %q, was %q", got, nw().vapid)
		}
		return nil
	})
	sc.Step(`^the Feeder restarts$`, func() { w.Ensure().Restart(w.TB) })

	sc.Step(`^I register the push device "([^"]*)" at "([^"]*)"$`, func(label, endpoint string) { register(label, endpoint, nil, false) })
	sc.Step(`^I register the push device "([^"]*)" at "([^"]*)" with "([^"]*)" on$`, func(label, endpoint, types string) {
		register(label, endpoint, split(types), false)
	})
	sc.Step(`^I register the push device "([^"]*)" at "([^"]*)" with broken keys$`, func(label, endpoint string) {
		register(label, endpoint, nil, true)
	})
	sc.Step(`^I registered the push device "([^"]*)" at "([^"]*)"$`, func(label, endpoint string) error {
		register(label, endpoint, nil, false)
		if w.Last.Status != 201 {
			return fmt.Errorf("register: %d %s", w.Last.Status, w.Last.Body)
		}
		return nil
	})
	sc.Step(`^I switch "([^"]*)" (on|off) for the push device "([^"]*)"$`, func(typ, state, label string) {
		setType(label, typ, state == "on", "")
	})
	sc.Step(`^I switch "([^"]*)" on for the push device "([^"]*)" owned by "([^"]*)"$`, func(typ, label, owner string) {
		setType(label, typ, true, owner)
	})
	sc.Step(`^I remove the push device "([^"]*)"$`, func(label string) {
		w.Last = w.Client.Do("DELETE", fmt.Sprintf("/api/notifications/devices/%d", nw().devices[label]), nil)
	})
	sc.Step(`^I remove the push device "([^"]*)" owned by "([^"]*)"$`, func(label, owner string) {
		w.Last = w.Client.Do("DELETE", fmt.Sprintf("/api/notifications/devices/%d", nw().devices[label]), nil)
	})
	sc.Step(`^I list my push devices$`, func() { w.Last = w.Client.Get("/api/notifications/devices") })
	sc.Step(`^the response body does not contain "([^"]*)"$`, func(s string) error {
		if strings.Contains(string(w.Last.Body), s) {
			return fmt.Errorf("body contains %q: %s", s, w.Last.Body)
		}
		return nil
	})
	sc.Step(`^my push devices are:$`, func(t *godog.Table) error {
		devs, err := listDevices()
		if err != nil {
			return err
		}
		rows := t.Rows[1:]
		if len(devs) != len(rows) {
			return fmt.Errorf("%d devices, want %d: %v", len(devs), len(rows), devs)
		}
		for i, row := range rows {
			if devs[i]["label"] != row.Cells[0].Value {
				return fmt.Errorf("device %d is %v, want %s", i, devs[i]["label"], row.Cells[0].Value)
			}
			types, _ := devs[i]["types"].(map[string]any)
			for c, cell := range row.Cells[1:] {
				name := t.Rows[0].Cells[c+1].Value
				if on, _ := types[name].(bool); on != (cell.Value == "on") {
					return fmt.Errorf("device %s: %s is %v, want %s", row.Cells[0].Value, name, on, cell.Value)
				}
			}
		}
		return nil
	})
	sc.Step(`^I have no push devices$`, func() error {
		devs, err := listDevices()
		if err != nil || len(devs) != 0 {
			return fmt.Errorf("devices %v, %v", devs, err)
		}
		return nil
	})
	sc.Step(`^the push device "([^"]*)" still belongs to "([^"]*)"$`, func(label, email string) error {
		var n int
		err := w.Env.DB.QueryRow(`SELECT COUNT(*) FROM push_subscriptions s JOIN users u ON u.id = s.user_id WHERE s.label = ? AND u.email = ?`, label, email).Scan(&n)
		if err != nil || n != 1 {
			return fmt.Errorf("found %d, %v", n, err)
		}
		return nil
	})

	// ---- delivery ----
	sc.Step(`^the push service is a recording stand-in$`, func() {
		d := notifyapi.DispatcherFor(w.Ensure().DB)
		d.SetSender(nw().sender)
		d.SetFacts(nw().facts)
	})
	sc.Step(`^the household is in "([^"]*)" with quiet hours from (\d\d:\d\d) to (\d\d:\d\d)$`, func(zone, from, to string) error {
		loc, err := time.LoadLocation(zone)
		if err != nil {
			return err
		}
		nw().loc = loc
		var cur map[string]any
		if err := w.Client.Get("/api/household/settings").JSON(&cur); err != nil {
			return err
		}
		delete(cur, "timeZoneConfigured")
		cur["timeZone"] = zone
		cur["quietHours"] = map[string]string{"start": from, "end": to}
		if r := w.Client.Do("PUT", "/api/household/settings", cur); r.Status != 200 {
			return fmt.Errorf("save settings: %d %s", r.Status, r.Body)
		}
		return nil
	})
	endpointOf := func(name string) string { return "https://push.example.test/" + name }
	sc.Step(`^the (phone|tablet) is registered for push with "([^"]*)" on$`, func(name, types string) error {
		register(name, endpointOf(name), split(types), false)
		if w.Last.Status != 201 {
			return fmt.Errorf("register: %d %s", w.Last.Status, w.Last.Body)
		}
		return nil
	})
	addMeal := func(name, hhmm string, total time.Duration, steps ...notify.AdvanceStepFact) {
		f := nw().facts
		f.mu.Lock()
		defer f.mu.Unlock()
		slotAt := at(0, hhmm)
		f.f.Meals = append(f.f.Meals, notify.MealFact{
			Date: dateStr(0), MealSlotID: int64(len(f.f.Meals) + 1), RecipeName: name, SlotAt: slotAt,
			State: notify.MealPlanned, TotalTime: total, AdvanceSteps: steps,
		})
	}
	sc.Step(`^dinner "([^"]*)" is planned for (\d\d:\d\d) today with the Advance Step "([^"]*)" (\d+) hours ahead$`, func(name, hhmm, step string, hours int) {
		addMeal(name, hhmm, 0, notify.AdvanceStepFact{ID: 1, Description: step, Lead: time.Duration(hours) * time.Hour})
	})
	sc.Step(`^dinner "([^"]*)" is planned for (\d\d:\d\d) today taking (\d+) minutes in total$`, func(name, hhmm string, mins int) {
		addMeal(name, hhmm, time.Duration(mins)*time.Minute)
	})
	sc.Step(`^dinner "([^"]*)" has been cooked$`, func(name string) error {
		f := nw().facts
		f.mu.Lock()
		defer f.mu.Unlock()
		for i := range f.f.Meals {
			if f.f.Meals[i].RecipeName == name {
				f.f.Meals[i].State = "cooked"
				return nil
			}
		}
		return fmt.Errorf("no dinner %q", name)
	})
	sc.Step(`^a Leftover "([^"]*)" with (\d+) portions has its Use-by tomorrow$`, func(name string, n int) {
		f := nw().facts
		f.mu.Lock()
		defer f.mu.Unlock()
		f.f.Leftovers = append(f.f.Leftovers, notify.LeftoverFact{ID: 1, RecipeName: name, Portions: float64(n), UseBy: dateStr(1)})
	})
	sc.Step(`^a Stock Lot of "([^"]*)" goes off in (\d+) days? and (no plan uses it|a plan uses it)$`, func(name string, days int, used string) {
		f := nw().facts
		f.mu.Lock()
		defer f.mu.Unlock()
		f.f.Lots = append(f.f.Lots, notify.LotFact{ID: int64(len(f.f.Lots) + 1), IngredientName: name, GoesOff: dateStr(days), UsedByPlan: used == "a plan uses it"})
	})
	setClock := func(hhmm, when string) {
		off := 0
		if when == " tomorrow" {
			off = 1
		}
		w.Ensure().Clock.Set(at(off, hhmm).UTC())
	}
	sc.Step(`^it is (\d\d:\d\d)( tomorrow)? and the Feeder checks for due notifications$`, func(hhmm, when string) {
		setClock(hhmm, when)
		_, nw().tickErr = notifyapi.DispatcherFor(w.Env.DB).Tick(context.Background())
	})
	sc.Step(`^it is (\d\d:\d\d)( tomorrow)? and the timer "([^"]*)" for "([^"]*)" finishes$`, func(hhmm, when, label, recipe string) {
		setClock(hhmm, when)
		w.Env.App.Deps.Events.Publish("timers", map[string]any{"changed": "finished", "timerId": 7, "label": label, "recipeName": recipe})
	})
	sc.Step(`^the push service has forgotten the (phone|tablet)$`, func(name string) {
		s := nw().sender
		s.mu.Lock()
		s.gone[endpointOf(name)] = true
		s.mu.Unlock()
	})
	sc.Step(`^the push service is failing$`, func() { nw().sender.mu.Lock(); nw().sender.failing = true; nw().sender.mu.Unlock() })
	sc.Step(`^the push service recovers$`, func() { nw().sender.mu.Lock(); nw().sender.failing = false; nw().sender.mu.Unlock() })

	waitFor := func(check func() error) error {
		var err error
		for i := 0; i < 100; i++ {
			if err = check(); err == nil {
				return nil
			}
			time.Sleep(20 * time.Millisecond)
		}
		return err
	}
	totalIs := func(n int) error {
		if got := nw().sender.total(); got != n {
			return fmt.Errorf("%d pushes sent, want %d", got, n)
		}
		return nil
	}
	savedBy := func(name string, n int, body string) error {
		got := nw().sender.to(endpointOf(name))
		if len(got) != n {
			return fmt.Errorf("%s received %d pushes, want %d", name, len(got), n)
		}
		if n > 0 && body != "" && got[len(got)-1].payload.Body != body {
			return fmt.Errorf("%s was told %q, want %q", name, got[len(got)-1].payload.Body, body)
		}
		return nil
	}
	sc.Step(`^(\d+) push(?:es)? (?:has|have) been sent$`, totalIs)
	sc.Step(`^(\d+) push(?:es)? (?:has|have) been sent in total$`, totalIs)
	sc.Step(`^(\d+) push(?:es)? (?:has|have) been sent to the (phone|tablet) saying "([^"]*)"$`, func(n int, name, body string) error {
		return savedBy(name, n, body)
	})
	sc.Step(`^the (phone|tablet) has received (\d+) push(?:es)?$`, func(name string, n int) error { return savedBy(name, n, "") })
	sc.Step(`^within a moment (\d+) push(?:es)? (?:has|have) been sent in total$`, func(n int) error { return waitFor(func() error { return totalIs(n) }) })
	sc.Step(`^within a moment (\d+) push(?:es)? (?:has|have) been sent to the (phone|tablet) saying "([^"]*)"$`, func(n int, name, body string) error {
		return waitFor(func() error { return savedBy(name, n, body) })
	})

	// ---- backups ----
	backupDir := func() string { return filepath.Join(w.Ensure().DataDir, backup.DirName) }
	sc.Step(`^I take a backup now$`, func() { w.Ensure(); w.Last = w.Client.Do("POST", "/api/admin/backups", map[string]any{}) })
	sc.Step(`^I list the backups$`, func() { w.Ensure(); w.Last = w.Client.Get("/api/admin/backups") })
	sc.Step(`^(\d+) days go by in the backup kitchen$`, func(n int) { w.Ensure().Clock.Advance(time.Duration(n) * 24 * time.Hour) })
	sc.Step(`^the backup folder holds "([^"]*)"$`, func(name string) error {
		if _, err := os.Stat(filepath.Join(backupDir(), name)); err != nil {
			return fmt.Errorf("missing %s: %v", name, err)
		}
		return nil
	})
	sc.Step(`^the backup folder does not hold "([^"]*)"$`, func(name string) error {
		if _, err := os.Stat(filepath.Join(backupDir(), name)); err == nil {
			return fmt.Errorf("%s should have been pruned", name)
		}
		return nil
	})
	sc.Step(`^the backup folder holds the file "([^"]*)"$`, func(name string) error {
		if _, err := os.Stat(filepath.Join(backupDir(), name)); err != nil {
			return fmt.Errorf("missing %s: %v", name, err)
		}
		return nil
	})
	sc.Step(`^the backup folder holds (\d+) backups?$`, func(n int) error {
		infos, err := backup.List(backupDir())
		if err != nil || len(infos) != n {
			return fmt.Errorf("%d backups, want %d (%v)", len(infos), n, err)
		}
		return nil
	})
	sc.Step(`^the backup folder has a file "([^"]*)"$`, func(name string) error {
		if err := os.MkdirAll(backupDir(), 0o755); err != nil {
			return err
		}
		return os.WriteFile(filepath.Join(backupDir(), name), []byte("keep me"), 0o600)
	})
	sc.Step(`^the backup folder has a snapshot for each of the (\d+) days before today$`, func(n int) error {
		if err := os.MkdirAll(backupDir(), 0o755); err != nil {
			return err
		}
		for i := 1; i <= n; i++ {
			if err := os.WriteFile(filepath.Join(backupDir(), backup.FileName(dateStr(-i))), []byte("old"), 0o600); err != nil {
				return err
			}
		}
		return nil
	})
	sc.Step(`^the backup "([^"]*)" opens as a Feeder database with the Admin in it$`, func(name string) error {
		d, err := db.Open(filepath.Join(backupDir(), name))
		if err != nil {
			return err
		}
		defer d.Close()
		var email string
		if err := d.QueryRow(`SELECT email FROM users WHERE is_admin = 1`).Scan(&email); err != nil || email != testkit.AdminEmail {
			return fmt.Errorf("admin %q, %v", email, err)
		}
		return nil
	})
	sc.Step(`^the backups listed are "([^"]*)"$`, func(want string) error {
		var out struct {
			Backups []struct {
				Name string `json:"name"`
			} `json:"backups"`
		}
		if err := w.Last.JSON(&out); err != nil {
			return err
		}
		var names []string
		for _, b := range out.Backups {
			names = append(names, b.Name)
		}
		if got := strings.Join(names, ", "); got != want {
			return fmt.Errorf("backups %q, want %q", got, want)
		}
		return nil
	})

	// ---- Today ----
	sc.Step(`^Stock knows the Ingredient "([^"]*)" for Today$`, func(name string) error {
		r := w.Client.Do("POST", "/api/ingredients", map[string]any{"name": name, "baseUnit": "g"})
		var out struct {
			ID int64 `json:"id"`
		}
		if r.Status != 201 || r.JSON(&out) != nil {
			return fmt.Errorf("create Ingredient: %d %s", r.Status, r.Body)
		}
		w.Vars["today.ing."+name] = out.ID
		return nil
	})
	sc.Step(`^I bought a Stock Lot of "([^"]*)" on "([^"]*)"$`, func(name, date string) error {
		id, _ := w.Vars["today.ing."+name].(int64)
		r := w.Client.Do("POST", "/api/stock/lots", map[string]any{"ingredientId": id, "quantity": 100, "purchased": date, "source": "manual"})
		if r.Status != 201 {
			return fmt.Errorf("add lot: %d %s", r.Status, r.Body)
		}
		return nil
	})
	sc.Step(`^I threw away (\w+) on "([^"]*)"$`, func(name, date string) error {
		id, _ := w.Vars["today.ing."+name].(int64)
		_, err := w.Env.DB.Exec(`INSERT INTO stock_waste(ingredient_id, quantity, wasted_on, reason, created_at) VALUES (?, 100, ?, 'spoiled', ?)`,
			id, date, w.Env.Clock.Now().UTC().Format(time.RFC3339))
		return err
	})
	// R11c: household age, go-off, Keep and Throw out for the zero-waste streak.
	sc.Step(`^a day passes$`, func() { w.Ensure().Clock.Advance(24 * time.Hour) })
	sc.Step(`^the Household was created on "([^"]*)"$`, func(date string) error {
		_, err := w.Ensure().DB.Exec(`UPDATE household_settings SET created_at = ? WHERE id = 1`, date+"T08:00:00Z")
		return err
	})
	sc.Step(`^the Household's time zone is "([^"]*)"$`, func(zone string) error {
		adm := w.Ensure().LoginAdmin(w.TB) // saving settings is Admin-only
		var cur map[string]any
		if err := adm.Get("/api/household/settings").JSON(&cur); err != nil {
			return err
		}
		delete(cur, "timeZoneConfigured")
		cur["timeZone"] = zone
		if r := adm.Do("PUT", "/api/household/settings", cur); r.Status != 200 {
			return fmt.Errorf("save settings: %d %s", r.Status, r.Body)
		}
		return nil
	})
	sc.Step(`^Stock knows the Ingredient "([^"]*)" with a Shelf Life of (\d+) days for Today$`, func(name string, days int) error {
		r := w.Client.Do("POST", "/api/ingredients", map[string]any{"name": name, "baseUnit": "g", "shelfLifeDays": days})
		var out struct {
			ID int64 `json:"id"`
		}
		if r.Status != 201 || r.JSON(&out) != nil {
			return fmt.Errorf("create Ingredient: %d %s", r.Status, r.Body)
		}
		w.Vars["today.ing."+name] = out.ID
		return nil
	})
	goneOffLot := func(name string) (int64, error) {
		id, _ := w.Vars["today.ing."+name].(int64)
		var out struct {
			Lots []struct {
				ID           int64 `json:"id"`
				IngredientID int64 `json:"ingredientId"`
			} `json:"lots"`
		}
		if err := w.Client.Get("/api/stock/spoiled").JSON(&out); err != nil {
			return 0, err
		}
		for _, l := range out.Lots {
			if l.IngredientID == id {
				return l.ID, nil
			}
		}
		return 0, fmt.Errorf("no gone-off Stock Lot of %q", name)
	}
	for _, act := range []struct{ verb, path string }{{"throw out", "throw-out"}, {"keep", "keep"}} {
		sc.Step(`^I `+act.verb+` the gone-off Stock Lot of "([^"]*)"$`, func(name string) error {
			id, err := goneOffLot(name)
			if err != nil {
				return err
			}
			if r := w.Client.Do("POST", fmt.Sprintf("/api/stock/lots/%d/%s", id, act.path), nil); r.Status != 200 {
				return fmt.Errorf("%s: %d %s", act.verb, r.Status, r.Body)
			}
			return nil
		})
	}
	// R11c: the 100 g Lot bought by "I bought a Stock Lot" leaves Stock by Cooked or by a Stock-take.
	sc.Step(`^a meal is Cooked using up the "([^"]*)" in Stock$`, func(name string) error {
		id, _ := w.Vars["today.ing."+name].(int64)
		r := w.Client.Do("POST", "/api/stock/cooked", map[string]any{"needs": []map[string]any{{"ingredientId": id, "quantity": 100}}})
		if r.Status != 200 {
			return fmt.Errorf("Cooked: %d %s", r.Status, r.Body)
		}
		return nil
	})
	sc.Step(`^I do a Stock-take of "([^"]*)" to nothing$`, func(name string) error {
		id, _ := w.Vars["today.ing."+name].(int64)
		r := w.Client.Do("PUT", fmt.Sprintf("/api/stock/ingredients/%d/total", id), map[string]any{"total": 0})
		if r.Status != 200 {
			return fmt.Errorf("Stock-take: %d %s", r.Status, r.Body)
		}
		return nil
	})
	sc.Step(`^I ask for the zero-waste streak$`, func() { w.Last = w.Client.Get("/api/today/streak") })
	sc.Step(`^the streak is (\d+) days?$`, func(n int) error {
		var out struct {
			Days int `json:"days"`
		}
		if w.Last.Status != 200 || w.Last.JSON(&out) != nil || out.Days != n {
			return fmt.Errorf("streak %d (%d %s), want %d", out.Days, w.Last.Status, w.Last.Body, n)
		}
		return nil
	})
	sc.Step(`^the Today facts have dinner "([^"]*)" at (\d\d:\d\d) with the Advance Step "([^"]*)" (\d+) hours ahead$`, func(name, hhmm, step string, hours int) {
		d := notifyapi.DispatcherFor(w.Ensure().DB)
		d.SetFacts(nw().facts)
		addMeal(name, hhmm, 0, notify.AdvanceStepFact{ID: 1, Description: step, Lead: time.Duration(hours) * time.Hour})
	})
	sc.Step(`^the Today facts say "([^"]*)" is cooked$`, func(name string) error {
		f := nw().facts
		f.mu.Lock()
		defer f.mu.Unlock()
		for i := range f.f.Meals {
			if f.f.Meals[i].RecipeName == name {
				f.f.Meals[i].State = "cooked"
			}
		}
		return nil
	})
	sc.Step(`^I ask for today's Advance Steps$`, func() { w.Last = w.Client.Get("/api/today/advance-steps") })
	steps := func() ([]string, error) {
		var out struct {
			Steps []struct {
				Description string `json:"description"`
			} `json:"steps"`
		}
		if w.Last.Status != 200 || w.Last.JSON(&out) != nil {
			return nil, fmt.Errorf("%d %s", w.Last.Status, w.Last.Body)
		}
		var names []string
		for _, s := range out.Steps {
			names = append(names, s.Description)
		}
		return names, nil
	}
	sc.Step(`^the Advance Steps listed are "([^"]*)"$`, func(want string) error {
		got, err := steps()
		if err != nil || strings.Join(got, ", ") != want {
			return fmt.Errorf("steps %v, want %q (%v)", got, want, err)
		}
		return nil
	})
	sc.Step(`^no Advance Steps are listed$`, func() error {
		got, err := steps()
		if err != nil || len(got) != 0 {
			return fmt.Errorf("steps %v (%v)", got, err)
		}
		return nil
	})
}
