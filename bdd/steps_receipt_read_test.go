package bdd

// RR2 (red): steps of bdd/features/receipt/receipt_read.feature. The step set "receipt-read" is its own (it shares no
// state with the recipe-assistant set); every phrase starts with "receipt", "the read" or "the provider" so it cannot
// clash with another set. HTTP only, with the fake Anthropic server.

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io/fs"
	"log/slog"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/cucumber/godog"

	"github.com/fabbarix/feeder-ng/internal/config"
	"github.com/fabbarix/feeder-ng/internal/receipt/receipttest"
	"github.com/fabbarix/feeder-ng/internal/recipeassistant/fakeanthropic"
	"github.com/fabbarix/feeder-ng/internal/secretbox"
	"github.com/fabbarix/feeder-ng/internal/testkit"
)

func init() { RegisterSteps("receipt-read", receiptReadSteps) }

const (
	rrMaster = "W1tbW1tbW1tbW1tbW1tbW1tbW1tbW1tbW1tbW1tbW1s="
	rrKey    = "sk-ant-api03-RRBDDKEY-0001"
	rrDay    = "2026-11-09"
)

type rrLogs struct {
	mu sync.Mutex
	b  bytes.Buffer
}

func (l *rrLogs) Write(p []byte) (int, error) { l.mu.Lock(); defer l.mu.Unlock(); return l.b.Write(p) }
func (l *rrLogs) String() string              { l.mu.Lock(); defer l.mu.Unlock(); return l.b.String() }

type rrState struct {
	fake     *fakeanthropic.Server
	shops    map[string]int64
	products map[string]int64
	barcodes map[string]string
	uuids    map[string][]string // by Shop name
	n        int
	readID   string
	view     map[string]any
	last     *testkit.Response
	first    string
	prints   []string
	logs     *rrLogs
	prev     *slog.Logger
	price    map[string]int
}

func receiptReadSteps(sc *godog.ScenarioContext, w *World) {
	st := &rrState{shops: map[string]int64{}, products: map[string]int64{}, barcodes: map[string]string{}, uuids: map[string][]string{},
		logs: &rrLogs{}, price: map[string]int{}}
	w.Vars["receipt-read"] = st
	sc.After(func(ctx context.Context, _ *godog.Scenario, err error) (context.Context, error) {
		if st.fake != nil {
			st.fake.Close()
		}
		if st.prev != nil {
			slog.SetDefault(st.prev)
		}
		return ctx, nil
	})
	admin := func() *testkit.Client { return w.Env.LoginAdmin(w.TB) }
	user := func() *testkit.Client { return w.Env.LoginUser(w.TB) }
	fail := func(f string, a ...any) error { return fmt.Errorf(f+"; last response: %s", append(a, lastBody(w))...) }

	sc.Step(`^Feeder runs with the Recipe Assistant on through a fake provider$`, func() {
		st.prev = slog.Default()
		slog.SetDefault(slog.New(slog.NewTextHandler(st.logs, &slog.HandlerOptions{Level: slog.LevelDebug})))
		mk, _ := secretbox.ParseMasterKey(rrMaster)
		w.Setup = append(w.Setup, func(c *config.Config) { c.SecretKey = mk })
		w.Ensure()
		st.fake = fakeanthropic.New()
		r := admin().Put("/api/recipe-assistant/settings", map[string]any{"enabled": true, "baseUrl": st.fake.URL, "model": "claude-haiku-5-5", "apiKey": rrKey})
		if r.Status != 200 {
			panic(fmt.Sprintf("turning the Recipe Assistant on: %d %s", r.Status, r.Body))
		}
	})
	sc.Step(`^the Shops "([^"]*)" and "([^"]*)"$`, func(a, b string) {
		for _, name := range []string{a, b} {
			var id struct {
				ID int64 `json:"id"`
			}
			r := admin().Post("/api/shops", map[string]any{"name": name})
			_ = json.Unmarshal(r.Body, &id)
			if r.Status != 201 {
				panic(fmt.Sprintf("shop %s: %d %s", name, r.Status, r.Body))
			}
			st.shops[name] = id.ID
		}
	})
	sc.Step(`^the Products "([^"]*)" and "([^"]*)"$`, func(a, b string) {
		res, err := w.Env.DB.Exec(`INSERT INTO ingredients (name, name_key, base_unit, shelf_life_days, created_at, updated_at)
			VALUES ('rr-ingredient', 'rr-ingredient', 'g', NULL, '2026-11-09T12:00:00Z', '2026-11-09T12:00:00Z')`)
		if err != nil {
			panic(err)
		}
		ing, _ := res.LastInsertId()
		for i, name := range []string{a, b} {
			bc := []string{"8000500310427", "8076800195057"}[i]
			pack := []int{700, 500}[i]
			var id struct {
				ID int64 `json:"id"`
			}
			r := user().Post("/api/products", map[string]any{"name": name, "ingredientId": ing, "packSize": pack, "barcodes": []string{bc}})
			_ = json.Unmarshal(r.Body, &id)
			if r.Status != 201 {
				panic(fmt.Sprintf("product %s: %d %s", name, r.Status, r.Body))
			}
			st.products[name], st.barcodes[name] = id.ID, bc
		}
	})

	scan := func(shop, product string, qty float64, price int) string {
		st.n++
		uuid := fmt.Sprintf("rr-%03d", st.n)
		r := user().Post("/api/scan", map[string]any{"clientUuid": uuid, "scannedAt": rrDay + "T12:00:00Z", "kind": "shop_scan", "shopId": st.shops[shop],
			"productId": st.products[product], "quantity": qty, "priceCents": price, "rangeTo": "2026-11-15"})
		if r.Status != 200 {
			panic(fmt.Sprintf("scan: %d %s", r.Status, r.Body))
		}
		st.uuids[shop] = append(st.uuids[shop], uuid)
		return uuid
	}
	sc.Step(`^I scanned "([^"]*)" twice at (\d+) cents and "([^"]*)" once at (\d+) cents in "([^"]*)" today$`, func(p1 string, c1 int, p2 string, c2 int, shop string) {
		scan(shop, p1, 700, c1)
		scan(shop, p1, 700, c1)
		scan(shop, p2, 500, c2)
	})
	sc.Step(`^I scanned "([^"]*)" once at (\d+) cents in "([^"]*)" today$`, func(p string, c int, shop string) { scan(shop, p, 700, c) })
	sc.Step(`^I change the Price of the last scan to (\d+) cents$`, func(c int) {
		us := st.uuids["Esselunga"]
		if r := user().Patch("/api/scan/"+us[len(us)-1], map[string]any{"priceCents": c}); r.Status != 200 {
			panic(fmt.Sprintf("price: %d %s", r.Status, r.Body))
		}
	})
	sc.Step(`^the household day turns$`, func() { w.Env.Clock.Advance(24 * time.Hour) })
	sc.Step(`^the Admin switches the assistant off$`, func() {
		if r := admin().Put("/api/recipe-assistant/settings", map[string]any{"enabled": false, "baseUrl": st.fake.URL, "model": "claude-haiku-5-5"}); r.Status != 200 {
			panic(fmt.Sprintf("off: %d %s", r.Status, r.Body))
		}
	})
	sc.Step(`^the API key is removed$`, func() {
		if r := admin().Delete("/api/recipe-assistant/settings/api-key"); r.Status != 200 {
			panic(fmt.Sprintf("remove key: %d %s", r.Status, r.Body))
		}
	})

	// ---- the provider ----
	sc.Step(`^the provider will read row (\d+) as (\d+) packs at (\d+) cents each$`, func(row, packs, cents int) {
		line := receipttest.Line(map[string]any{"row": row, "text": "PRINTED LINE", "count": packs, "priceCents": packs * cents, "unitPriceCents": cents})
		st.fake.Queue(fakeanthropic.Reply{Text: receipttest.Answer("Esselunga", rrDay, 7800, line)})
	})
	sc.Step(`^the provider will refuse the photo$`, func() { st.fake.Queue(fakeanthropic.Reply{StopReason: "refusal"}) })
	sc.Step(`^the provider will say the photo is not a receipt$`, func() { st.fake.Queue(fakeanthropic.Reply{Text: receipttest.Unreadable()}) })
	sc.Step(`^the provider will answer with prose$`, func() { st.fake.Queue(fakeanthropic.Reply{Text: "I could not read that."}) })
	sc.Step(`^the provider will reject the key$`, func() {
		st.fake.Queue(fakeanthropic.Reply{Status: 401, ErrorType: "authentication_error", ErrorMsg: "invalid x-api-key"})
	})
	sc.Step(`^the provider will run out of tokens$`, func() {
		st.fake.Queue(fakeanthropic.Reply{StopReason: "max_tokens", Text: `{"readable":tr`})
	})
	sc.Step(`^the provider will hold the read$`, func() {
		// a Product whose name carries the fake's slow marker is scanned into the session, so the read is held by the fake
		var ing int64
		if err := w.Env.DB.QueryRow(`SELECT id FROM ingredients LIMIT 1`).Scan(&ing); err != nil {
			panic(err)
		}
		var id struct {
			ID int64 `json:"id"`
		}
		r := user().Post("/api/products", map[string]any{"name": "Held #fake:slow", "ingredientId": ing, "packSize": 100, "barcodes": []string{"5449000000996"}})
		_ = json.Unmarshal(r.Body, &id)
		if r.Status != 201 {
			panic(fmt.Sprintf("held product: %d %s", r.Status, r.Body))
		}
		st.products["Held #fake:slow"] = id.ID
		scan("Esselunga", "Held #fake:slow", 100, 99)
	})
	sc.Step(`^the provider received no request$`, func() error {
		if n := len(st.fake.Messages()); n != 0 {
			return fmt.Errorf("the provider received %d requests", n)
		}
		return nil
	})

	// ---- the reads ----
	photos := func(n int) []map[string]any {
		out := make([]map[string]any, n)
		for i := range out {
			out[i] = map[string]any{"dataUrl": receipttest.JPEGDataURL(60+i, 90)}
		}
		return out
	}
	post := func(c *testkit.Client, body map[string]any) *testkit.Response {
		r := c.Post("/api/scan/receipt/reads", body)
		w.Last, st.last = r, r
		if r.Status == 202 {
			var a struct{ ID string }
			_ = json.Unmarshal(r.Body, &a)
			st.readID = a.ID
		}
		return r
	}
	poll := func(c *testkit.Client) {
		deadline := time.Now().Add(15 * time.Second)
		for time.Now().Before(deadline) {
			r := c.Get("/api/scan/receipt/reads/" + st.readID)
			w.Last = r
			st.view = nil
			_ = json.Unmarshal(r.Body, &st.view)
			if s, _ := st.view["status"].(string); s == "done" || s == "failed" {
				return
			}
			time.Sleep(10 * time.Millisecond)
		}
		panic("the read never finished: " + lastBody(w))
	}
	read := func(c *testkit.Client, shop string, n int, uuids []string) {
		if r := post(c, map[string]any{"shopId": st.shops[shop], "clientUuids": uuids, "photos": photos(n)}); r.Status != 202 {
			panic(fmt.Sprintf("starting the receipt read: %d %s", r.Status, r.Body))
		}
		poll(c)
	}
	sc.Step(`^I read the receipt with (\d+) photos for "([^"]*)"$`, func(n int, shop string) {
		read(user(), shop, n, st.uuids[shop])
		if fp, _ := st.view["fingerprint"].(string); fp != "" && st.first == "" {
			st.first = fp
		}
	})
	sc.Step(`^I read the receipt with (\d+) photos for "([^"]*)" again$`, func(n int, shop string) {
		read(user(), shop, n, st.uuids[shop])
		st.prints = append(st.prints, fmt.Sprint(st.view["fingerprint"]))
	})
	sc.Step(`^an Admin reads the receipt with (\d+) photos for "([^"]*)"$`, func(n int, shop string) { read(admin(), shop, n, st.uuids[shop]) })
	sc.Step(`^I read the receipt for "([^"]*)" with the uuids of the session and one the server has never seen$`, func(shop string) {
		read(user(), shop, 1, append(append([]string(nil), st.uuids[shop]...), "still-in-the-phones-queue"))
	})
	sc.Step(`^I start a receipt read with (\d+) photos for "([^"]*)"$`, func(n int, shop string) {
		if r := post(user(), map[string]any{"shopId": st.shops[shop], "clientUuids": st.uuids[shop], "photos": photos(n)}); r.Status != 202 {
			panic(fmt.Sprintf("start: %d %s", r.Status, r.Body))
		}
		time.Sleep(100 * time.Millisecond)
	})
	sc.Step(`^I cancel the receipt read$`, func() { w.Last = user().Delete("/api/scan/receipt/reads/" + st.readID) })
	sc.Step(`^the receipt read ends failed with "([^"]*)"$`, func(code string) error {
		poll(user())
		return checkFailed(st, code, fail)
	})
	sc.Step(`^I can start another receipt read at once$`, func() error {
		st.fake.Queue(fakeanthropic.Reply{Text: receipttest.Answer("", "", -1)})
		if r := post(user(), map[string]any{"shopId": st.shops["Esselunga"], "clientUuids": st.uuids["Esselunga"], "photos": photos(1)}); r.Status != 202 {
			return fail("another read: %d", r.Status)
		}
		return nil
	})
	sc.Step(`^I send a receipt read with (\d+) photos$`, func(n int) {
		post(user(), map[string]any{"shopId": st.shops["Esselunga"], "clientUuids": st.uuids["Esselunga"], "photos": photos(n)})
	})
	sc.Step(`^I send a receipt read with a text file as its photo$`, func() {
		post(user(), map[string]any{"shopId": st.shops["Esselunga"], "clientUuids": st.uuids["Esselunga"],
			"photos": []map[string]any{{"dataUrl": "data:text/plain;base64," + base64.StdEncoding.EncodeToString([]byte("hello"))}}})
	})
	sc.Step(`^I send a receipt read for "([^"]*)" with the uuids of the Esselunga session$`, func(shop string) {
		post(user(), map[string]any{"shopId": st.shops[shop], "clientUuids": st.uuids["Esselunga"], "photos": photos(1)})
	})
	sc.Step(`^I have made 30 accepted reads$`, func() {
		for i := 0; i < 30; i++ {
			st.fake.Queue(fakeanthropic.Reply{Text: receipttest.Answer("", "", -1)})
			read(user(), "Esselunga", 1, st.uuids["Esselunga"])
		}
	})

	// ---- answers ----
	errCode := func() (string, int, map[string]any) {
		var b struct {
			Error map[string]any `json:"error"`
		}
		_ = json.Unmarshal(st.last.Body, &b)
		c, _ := b.Error["code"].(string)
		return c, st.last.Status, b.Error
	}
	sc.Step(`^the receipt read is refused with (\d+) "([^"]*)"$`, func(status int, code string) error {
		c, s, _ := errCode()
		if s != status || c != code {
			return fail("got %d %q, want %d %q", s, c, status, code)
		}
		return nil
	})
	sc.Step(`^the receipt read is refused with (\d+) "([^"]*)" because "([^"]*)"$`, func(status int, code, reason string) error {
		c, s, e := errCode()
		if s != status || c != code || e["reason"] != reason {
			return fail("got %d %q %v, want %d %q reason %q", s, c, e["reason"], status, code, reason)
		}
		return nil
	})
	sc.Step(`^the receipt read is refused with (\d+) "([^"]*)" and a wait$`, func(status int, code string) error {
		c, s, e := errCode()
		if n, _ := e["retryAfterSeconds"].(float64); s != status || c != code || n <= 0 {
			return fail("got %d %q retry %v", s, c, e["retryAfterSeconds"])
		}
		return nil
	})
	sc.Step(`^the receipt read is done$`, func() error {
		if st.view["status"] != "done" {
			return fail("status = %v", st.view["status"])
		}
		return nil
	})
	sc.Step(`^the receipt read failed with "([^"]*)"$`, func(code string) error { return checkFailed(st, code, fail) })
	sc.Step(`^the read proposes nothing$`, func() error {
		if p, _ := st.view["proposals"].([]any); len(p) != 0 {
			return fail("proposals = %v", p)
		}
		return nil
	})
	sc.Step(`^the provider got (\d+) JPEG photos before one text block holding the (\d+) rows$`, func(n, rows int) error {
		ms := st.fake.Messages()
		if len(ms) != 1 {
			return fmt.Errorf("the provider received %d Messages calls, want 1", len(ms))
		}
		imgs := ms[0].Images()
		if len(imgs) != n {
			return fmt.Errorf("images = %d, want %d", len(imgs), n)
		}
		for i, im := range imgs {
			if im.MediaType != "image/jpeg" || im.Index != i {
				return fmt.Errorf("image %d = %+v", i, im)
			}
		}
		texts := ms[0].UserTexts()
		if len(texts) != 1 || strings.Count(texts[0], `"row":`) != rows || !strings.Contains(texts[0], "Mutti passata 700 g") {
			return fmt.Errorf("the text block is not the rows: %v", texts)
		}
		return nil
	})
	sc.Step(`^the read has (\d+) rows$`, func(n int) error {
		if rows, _ := st.view["rows"].([]any); len(rows) != n {
			return fail("rows = %d, want %d", len(rows), n)
		}
		return nil
	})
	sc.Step(`^the read has (\d+) rows, the first being "([^"]*)" scanned (\d+) times$`, func(n int, name string, scans int) error {
		rows, _ := st.view["rows"].([]any)
		if len(rows) != n {
			return fail("rows = %d, want %d", len(rows), n)
		}
		r0, _ := rows[0].(map[string]any)
		if r0["product"] != name || int(r0["scans"].(float64)) != scans {
			return fail("first row = %v", r0)
		}
		return nil
	})
	findProposal := func(id string) map[string]any {
		ps, _ := st.view["proposals"].([]any)
		for _, p := range ps {
			if m, _ := p.(map[string]any); m["id"] == id {
				return m
			}
		}
		return nil
	}
	sc.Step(`^the read proposes "([^"]*)", checked, changing the Price from (\d+) to (\d+)$`, func(id string, from, to int) error {
		p := findProposal(id)
		if p == nil || p["checked"] != true {
			return fail("proposal %s = %v", id, p)
		}
		b, _ := p["before"].(map[string]any)
		a, _ := p["after"].(map[string]any)
		if int(b["priceCents"].(float64)) != from || int(a["priceCents"].(float64)) != to {
			return fail("before %v after %v", b, a)
		}
		return nil
	})
	sc.Step(`^the read proposes "([^"]*)" for the row not on the receipt$`, func(id string) error {
		if p := findProposal(id); p == nil || p["kind"] != "missing" {
			return fail("proposal %s = %v", id, p)
		}
		return nil
	})
	sc.Step(`^the read has a fingerprint of 64 hex digits$`, func() error {
		if fp, _ := st.view["fingerprint"].(string); !regexp.MustCompile(`^[0-9a-f]{64}$`).MatchString(fp) {
			return fail("fingerprint = %q", fp)
		}
		return nil
	})
	sc.Step(`^the read has the receipt total of (\d+) cents and the scanned total of (\d+) cents$`, func(receipt, scanned int) error {
		t, _ := st.view["totals"].(map[string]any)
		if t == nil || int(t["receiptCents"].(float64)) != receipt || int(t["scannedCents"].(float64)) != scanned {
			return fail("totals = %v", t)
		}
		return nil
	})
	sc.Step(`^the two fingerprints are the same$`, func() error {
		if st.first == "" || len(st.prints) == 0 || st.first != st.prints[0] {
			return fmt.Errorf("fingerprints %q %v", st.first, st.prints)
		}
		return nil
	})
	sc.Step(`^the fingerprint differs from the first$`, func() error {
		if last := st.prints[len(st.prints)-1]; last == st.first || last == "" {
			return fmt.Errorf("fingerprint %q equals the first %q", last, st.first)
		}
		return nil
	})
	sc.Step(`^an Admin asking for that read gets 404$`, func() error {
		if r := admin().Get("/api/scan/receipt/reads/" + st.readID); r.Status != 404 {
			return fmt.Errorf("status = %d", r.Status)
		}
		return nil
	})

	// ---- privacy ----
	sc.Step(`^no file in the data directory is an image$`, func() error {
		var bad []string
		dbName := filepath.Base(w.Env.Config.DBPath())
		_ = filepath.WalkDir(w.Env.DataDir, func(p string, d fs.DirEntry, err error) error {
			if err != nil || d.IsDir() || strings.HasPrefix(filepath.Base(p), dbName) {
				return nil
			}
			bad = append(bad, p)
			return nil
		})
		if len(bad) != 0 {
			return fmt.Errorf("files appeared in the data directory: %v", bad)
		}
		return nil
	})
	sc.Step(`^no database row holds image bytes$`, func() error {
		tables, err := w.Env.DB.Query(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`)
		if err != nil {
			return err
		}
		var names []string
		for tables.Next() {
			var n string
			_ = tables.Scan(&n)
			names = append(names, n)
		}
		tables.Close()
		for _, n := range names {
			rs, err := w.Env.DB.Query(`SELECT * FROM "` + n + `"`)
			if err != nil {
				continue
			}
			cols, _ := rs.Columns()
			for rs.Next() {
				vals := make([]any, len(cols))
				ptrs := make([]any, len(cols))
				for i := range vals {
					ptrs[i] = &vals[i]
				}
				_ = rs.Scan(ptrs...)
				for i, v := range vals {
					var text string
					switch x := v.(type) {
					case []byte:
						text = string(x)
						if len(x) > 512 {
							rs.Close()
							return fmt.Errorf("%s.%s holds a BLOB of %d bytes", n, cols[i], len(x))
						}
					case string:
						text = x
					}
					if strings.Contains(text, "data:image") || strings.HasPrefix(text, "/9j/") || strings.Contains(text, "\xff\xd8\xff") || strings.Contains(text, "\x89PNG") {
						rs.Close()
						return fmt.Errorf("%s.%s holds image bytes", n, cols[i])
					}
				}
			}
			rs.Close()
		}
		return nil
	})
	sc.Step(`^the logs contain no Product name, barcode, receipt line, price of the Scanned list, photo data or API key$`, func() error {
		out := st.logs.String()
		if out == "" {
			return fmt.Errorf("the logs were not captured")
		}
		leaks := []string{"Mutti passata", "Barilla spaghetti", "8000500310427", "8076800195057", "PRINTED LINE", "7771", "77.71", "data:image", "/9j/", rrKey}
		for _, l := range leaks {
			if strings.Contains(out, l) {
				return fmt.Errorf("the logs contain %q", l)
			}
		}
		return nil
	})
}

func checkFailed(st *rrState, code string, fail func(string, ...any) error) error {
	e, _ := st.view["error"].(map[string]any)
	if st.view["status"] != "failed" || e["code"] != code {
		return fail("status %v error %v, want failed %q", st.view["status"], e, code)
	}
	return nil
}
