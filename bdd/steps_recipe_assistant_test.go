package bdd

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"image"
	"image/color"
	"image/jpeg"
	"io"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"sync/atomic"
	"time"

	"github.com/cucumber/godog"

	"github.com/fabbarix/feeder-ng/internal/auth"
	"github.com/fabbarix/feeder-ng/internal/config"
	"github.com/fabbarix/feeder-ng/internal/recipeassistant/fakeanthropic"
	"github.com/fabbarix/feeder-ng/internal/recipeassistant/service"
	"github.com/fabbarix/feeder-ng/internal/safehttp"
	"github.com/fabbarix/feeder-ng/internal/secretbox"
	"github.com/fabbarix/feeder-ng/internal/testkit"
)

func init() { RegisterSteps("recipe-assistant", recipeAssistantSteps) }

const (
	raMasterA = "W1tbW1tbW1tbW1tbW1tbW1tbW1tbW1tbW1tbW1tbW1s="
	raMasterB = "XFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFxcXFw="
)

// raState lives in w.Vars["ra"]. Responses seen so far are kept to assert that no secret ever appeared.
type raState struct {
	fake, second *fakeanthropic.Server
	mark         int
	page         *httptest.Server
	servers      []func()
	readID       string
	reviewID     string
	view         map[string]any
	seen         []string
	hooked       bool
}

func recipeAssistantSteps(sc *godog.ScenarioContext, w *World) {
	st := &raState{}
	w.Vars["ra"] = st
	sc.After(func(ctx context.Context, _ *godog.Scenario, err error) (context.Context, error) {
		for _, c := range st.servers {
			c()
		}
		return ctx, nil
	})

	fail := func(f string, a ...any) error { return fmt.Errorf(f+"; last response: %s", append(a, lastBody(w))...) }
	remember := func(r *testkit.Response) *testkit.Response {
		w.Last = r
		st.seen = append(st.seen, string(r.Body))
		return r
	}
	admin := func() *testkit.Client { return w.Env.LoginAdmin(w.TB) }
	url := func(token string) string { return st.resolve(token) }

	// ---- set-up ----
	sc.Step(`^a running Feeder with a secret key$`, func() {
		mk, _ := secretbox.ParseMasterKey(raMasterA)
		w.Setup = append(w.Setup, func(c *config.Config) { c.SecretKey = mk })
		w.Ensure()
	})
	sc.Step(`^a running Feeder without a secret key$`, func() { w.Ensure() })
	sc.Step(`^a fake Anthropic server$`, func() {
		st.fake = fakeanthropic.New()
		st.servers = append(st.servers, st.fake.Close)
	})
	sc.Step(`^a second fake Anthropic server$`, func() {
		st.second = fakeanthropic.New()
		st.servers = append(st.servers, st.second.Close)
	})
	sc.Step(`^the fake server has no models endpoint$`, func() { st.fake.NoModelsEndpoint(true) })
	sc.Step(`^the fake server no longer lists the saved model$`, func() {
		st.fake.SetModels([]fakeanthropic.Model{{ID: "claude-other-1", DisplayName: "Other", StructuredOutputs: true, ImageInput: true}})
	})
	sc.Step(`^the fake server answers slowly$`, func() {
		// A slow fake replaces the default one; the saved base URL is moved to it.
		slow := fakeanthropic.New(fakeanthropic.WithSlow(20 * time.Second))
		st.servers = append(st.servers, slow.Close)
		st.fake = slow
		r := admin().Put("/api/recipe-assistant/settings", map[string]any{"enabled": true, "baseUrl": slow.URL, "model": "claude-haiku-5-5", "apiKey": "sk-slow-key-0001"})
		if r.Status != 200 {
			panic(fmt.Sprintf("re-saving settings for the slow fake: %d %s", r.Status, r.Body))
		}
	})
	sc.Step(`^the fake server asks to retry after (\d+) seconds$`, func(n int) {
		f := fakeanthropic.New(fakeanthropic.WithRetryAfter(fmt.Sprint(n)))
		st.servers = append(st.servers, f.Close)
		st.fake = f
		r := admin().Put("/api/recipe-assistant/settings", map[string]any{"enabled": true, "baseUrl": f.URL, "model": "claude-haiku-5-5", "apiKey": "sk-retry-key-0001"})
		if r.Status != 200 {
			panic(fmt.Sprintf("re-saving settings: %d %s", r.Status, r.Body))
		}
	})
	sc.Step(`^the Recipe Assistant is on with the fake server and the API key "([^"]*)"$`, func(key string) {
		w.Ensure()
		r := admin().Put("/api/recipe-assistant/settings", map[string]any{"enabled": true, "baseUrl": st.fake.URL, "model": "claude-haiku-5-5", "apiKey": key})
		if r.Status != 200 {
			panic(fmt.Sprintf("turning the Recipe Assistant on: %d %s", r.Status, r.Body))
		}
		w.Client = admin() // the scenarios go on with Admin-only settings steps; those that need a User sign in as one
	})
	sc.Step(`^the Recipe Assistant is turned off$`, func() {
		r := admin().Put("/api/recipe-assistant/settings", map[string]any{"enabled": false, "baseUrl": st.fake.URL, "model": "claude-haiku-5-5"})
		if r.Status != 200 {
			panic(fmt.Sprintf("turning off: %d %s", r.Status, r.Body))
		}
	})
	sc.Step(`^the server is restarted with another secret key$`, func() {
		mk, _ := secretbox.ParseMasterKey(raMasterB)
		w.Env.Config.SecretKey = mk
		w.Env.Restart(w.TB)
		w.Clients = map[string]*testkit.Client{}
	})

	// ---- settings and status ----
	body := func(enabled bool, base, model, key string) map[string]any {
		m := map[string]any{"enabled": enabled, "baseUrl": base, "model": model}
		if key != "" {
			m["apiKey"] = key
		}
		return m
	}
	sc.Step(`^I save the Recipe Assistant settings as (on|off), with the fake server, model "([^"]*)" and API key "([^"]*)"$`, func(onOff, model, key string) {
		remember(w.Client.Put("/api/recipe-assistant/settings", body(onOff == "on", st.fake.URL, model, key)))
	})
	sc.Step(`^I save the Recipe Assistant settings as on, with the fake server and model "([^"]*)" and no API key$`, func(model string) {
		remember(w.Client.Put("/api/recipe-assistant/settings", body(true, st.fake.URL, model, "")))
	})
	sc.Step(`^I save the Recipe Assistant settings as on, with the second server, model "([^"]*)" and no API key$`, func(model string) {
		remember(w.Client.Put("/api/recipe-assistant/settings", body(true, st.second.URL, model, "")))
	})
	sc.Step(`^I save the Recipe Assistant settings as on, with the second server, model "([^"]*)" and API key "([^"]*)"$`, func(model, key string) {
		remember(w.Client.Put("/api/recipe-assistant/settings", body(true, st.second.URL, model, key)))
	})
	sc.Step(`^I read the Recipe Assistant settings$`, func() { remember(w.Client.Get("/api/recipe-assistant/settings")) })
	sc.Step(`^I read the Recipe Assistant status$`, func() { remember(w.Client.Get("/api/recipe-assistant/status")) })
	sc.Step(`^I remove the API key$`, func() { remember(w.Client.Delete("/api/recipe-assistant/settings/api-key")) })
	sc.Step(`^I send (GET|PUT|POST|DELETE) "([^"]*)" with an empty JSON object$`, func(method, path string) {
		remember(w.Client.Do(method, path, map[string]any{}))
	})
	sc.Step(`^I send a settings change from the origin "([^"]*)"$`, func(origin string) {
		req, _ := http.NewRequest("PUT", w.Env.URL()+"/api/recipe-assistant/settings", strings.NewReader(`{"enabled":false,"baseUrl":"https://api.anthropic.com","model":"claude-haiku-5-5"}`))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Origin", origin)
		req.AddCookie(w.Client.Cookie(auth.CookieName))
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			panic(err)
		}
		defer resp.Body.Close()
		b, _ := io.ReadAll(resp.Body)
		remember(&testkit.Response{Status: resp.StatusCode, Header: resp.Header, Body: b})
	})
	sc.Step(`^the answer is 422 "([^"]*)"$`, func(code string) error {
		if w.Last.Status != 422 {
			return fail("status = %d, want 422", w.Last.Status)
		}
		if !strings.Contains(string(w.Last.Body), `"`+code+`"`) {
			return fail("no error code %q", code)
		}
		return nil
	})
	sc.Step(`^no response so far contains "([^"]*)"$`, func(s string) error {
		for _, b := range st.seen {
			if strings.Contains(b, s) {
				return fmt.Errorf("a response contains %q: %s", s, b)
			}
		}
		return nil
	})
	sc.Step(`^the response JSON field "baseUrl" is the fake server's address$`, func() error {
		return jsonFieldIs(w, "baseUrl", st.fake.URL)
	})
	sc.Step(`^the change history lists the actions "([^"]*)"$`, func(list string) error {
		var s struct{ Changes []struct{ Action string } }
		w.Last.MustJSON(w.TB, &s)
		have := map[string]bool{}
		for _, c := range s.Changes {
			have[c.Action] = true
		}
		for _, a := range strings.Split(list, ", ") {
			if !have[a] {
				return fail("history lacks %q: %v", a, s.Changes)
			}
		}
		return nil
	})
	sc.Step(`^I note the requests the fake server has received so far$`, func() {
		st.mark = len(st.fake.Requests())
	})
	sc.Step(`^the fake server received no request since$`, func() error {
		if n := len(st.fake.Requests()) - st.mark; n != 0 {
			return fmt.Errorf("the fake server received %d requests since the note", n)
		}
		return nil
	})
	sc.Step(`^no request since carried "([^"]*)" as x-api-key$`, func(saved string) error {
		for _, r := range st.fake.Requests()[st.mark:] {
			if r.APIKey == saved {
				return fmt.Errorf("the saved key reached the fake server after the note")
			}
		}
		return nil
	})
	sc.Step(`^the second server received no request$`, func() error {
		if n := len(st.second.Requests()); n != 0 {
			return fmt.Errorf("the second server received %d requests", n)
		}
		return nil
	})
	sc.Step(`^the second server received "([^"]*)" as x-api-key and never "([^"]*)"$`, func(want, never string) error {
		return keysSeen(st.second, want, never)
	})

	// ---- models ----
	sc.Step(`^an Admin lists the models$`, func() {
		w.Client = admin()
		remember(w.Client.Post("/api/recipe-assistant/models", map[string]any{}))
	})
	sc.Step(`^the first model is "([^"]*)"$`, func(id string) error {
		var a struct{ Models []struct{ ID string } }
		w.Last.MustJSON(w.TB, &a)
		if len(a.Models) == 0 || a.Models[0].ID != id {
			return fail("first model = %+v, want %s", a.Models, id)
		}
		return nil
	})
	sc.Step(`^the list does not offer "([^"]*)"$`, func(id string) error {
		if strings.Contains(string(w.Last.Body), `"`+id+`"`) {
			return fail("%s is offered", id)
		}
		return nil
	})
	sc.Step(`^an Admin tests the connection$`, func() {
		w.Client = admin()
		remember(w.Client.Post("/api/recipe-assistant/test", map[string]any{}))
	})
	sc.Step(`^an Admin tests the connection for the model "([^"]*)"$`, func(m string) {
		w.Client = admin()
		remember(w.Client.Post("/api/recipe-assistant/test", map[string]any{"model": m}))
	})
	sc.Step(`^the connection checks passed are "([^"]*)"$`, func(list string) error {
		var a struct {
			Checks []struct {
				Name string
				OK   bool
			}
		}
		w.Last.MustJSON(w.TB, &a)
		var got []string
		for _, c := range a.Checks {
			if c.OK {
				got = append(got, c.Name)
			}
		}
		if strings.Join(got, ", ") != list {
			return fail("passed = %v, want %s", got, list)
		}
		return nil
	})
	sc.Step(`^an Admin calls (GET|PUT|POST|DELETE) (/\S+) with base URL "([^"]*)" and no API key$`, func(method, path, base string) {
		w.Client = admin()
		remember(w.Client.Do(method, path, routeBody(method, url(base), "")))
	})
	sc.Step(`^an Admin calls (GET|PUT|POST|DELETE) (/\S+) with base URL "([^"]*)" and API key "([^"]*)"$`, func(method, path, base, key string) {
		w.Client = admin()
		remember(w.Client.Do(method, path, routeBody(method, url(base), key)))
	})
	// ---- reads ----
	poll := func(id string) {
		deadline := time.Now().Add(20 * time.Second)
		for time.Now().Before(deadline) {
			r := remember(w.Client.Get("/api/recipe-assistant/reads/" + id))
			var v map[string]any
			_ = json.Unmarshal(r.Body, &v)
			st.view = v
			switch v["state"] {
			case "done", "failed", "cancelled":
				if rv, ok := v["review"].(map[string]any); ok {
					st.reviewID, _ = rv["id"].(string)
				}
				return
			}
			time.Sleep(10 * time.Millisecond)
		}
		panic("the read never finished: " + lastBody(w))
	}
	start := func(b any) *testkit.Response {
		r := remember(w.Client.Post("/api/recipe-assistant/reads", b))
		if r.Status == 202 {
			var a struct{ ID string }
			_ = json.Unmarshal(r.Body, &a)
			st.readID = a.ID
		}
		return r
	}
	sc.Step(`^I start a read of the text "([^"]*)"$`, func(text string) { start(map[string]any{"text": text}) })
	sc.Step(`^I read the recipe text "([^"]*)"$`, func(text string) {
		if r := start(map[string]any{"text": text}); r.Status != 202 {
			panic(fmt.Sprintf("starting the read: %d %s", r.Status, r.Body))
		}
		poll(st.readID)
	})
	sc.Step(`^I cancel the read$`, func() { remember(w.Client.Delete("/api/recipe-assistant/reads/" + st.readID)) })
	sc.Step(`^the read ends as cancelled$`, func() error {
		poll(st.readID)
		if st.view["state"] != "cancelled" {
			return fail("state = %v", st.view["state"])
		}
		return nil
	})
	sc.Step(`^I have read (\d+) recipes$`, func(n int) error {
		for i := 0; i < n; i++ {
			if r := start(map[string]any{"text": fmt.Sprintf("recipe %d #fake:valid", i)}); r.Status != 202 {
				return fail("read %d refused: %d", i, r.Status)
			}
			poll(st.readID)
		}
		return nil
	})
	sc.Step(`^the read is done and a review is open$`, func() error {
		if st.view["state"] != "done" || st.reviewID == "" {
			return fail("view = %v", st.view)
		}
		return nil
	})
	sc.Step(`^the read failed with "([^"]*)"$`, func(code string) error {
		e, _ := st.view["error"].(map[string]any)
		if st.view["state"] != "failed" || e["code"] != code {
			return fail("view = %v, want failed with %s", st.view, code)
		}
		return nil
	})
	sc.Step(`^the read failed with "([^"]*)" after (\d+) seconds$`, func(code string, secs int) error {
		e, _ := st.view["error"].(map[string]any)
		if st.view["state"] != "failed" || e["code"] != code || e["retryAfterSeconds"] != float64(secs) {
			return fail("view = %v", st.view)
		}
		return nil
	})
	sc.Step(`^the read says the page's recipe data was used$`, func() error {
		src, _ := st.view["source"].(map[string]any)
		if src["structuredData"] != true {
			return fail("source = %v", src)
		}
		return nil
	})
	sc.Step(`^the model was called (\d+) times?$`, func(n int) error {
		if got := len(st.fake.Messages()); got != n {
			return fmt.Errorf("the model was called %d times, want %d", got, n)
		}
		return nil
	})
	sc.Step(`^every call used the model "([^"]*)"$`, func(model string) error {
		for _, m := range st.fake.Messages() {
			if m.JSON()["model"] != model {
				return fmt.Errorf("a call used %v", m.JSON()["model"])
			}
		}
		return nil
	})
	sc.Step(`^the model was given structured data before the page text$`, func() error {
		t := strings.Join(st.fake.Messages()[0].UserTexts(), "\n")
		i, j := strings.Index(t, "<structured_data>"), strings.Index(t, "<page_text>")
		if i < 0 || j < i {
			return fmt.Errorf("user turn: %.200s", t)
		}
		return nil
	})
	sc.Step(`^the model was given the page text only$`, func() error {
		t := strings.Join(st.fake.Messages()[0].UserTexts(), "\n")
		if strings.Contains(t, "<structured_data>") || !strings.Contains(t, "<page_text>") {
			return fmt.Errorf("user turn: %.200s", t)
		}
		return nil
	})
	sc.Step(`^a recipe page "([^"]*)" (with|without) recipe data$`, func(path, with string) {
		hookFetch(w, st)
		ld := ""
		if with == "with" {
			ld = `<script type="application/ld+json">{"@type":"Recipe","name":"Tikka","recipeIngredient":["500 g chicken"],"recipeInstructions":["Bake"]}</script>`
		}
		html := `<html><head><title>Page</title>` + ld + `</head><body><main>200 g flour, 2 eggs. Mix and fry.</main></body></html>`
		srv := httptest.NewTLSServer(http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
			rw.Header().Set("Content-Type", "text/html; charset=utf-8")
			_, _ = io.WriteString(rw, html)
		}))
		st.servers = append(st.servers, srv.Close)
		st.page = srv
	})
	sc.Step(`^I read the page "([^"]*)"$`, func(path string) {
		if r := start(map[string]any{"url": st.page.URL + path}); r.Status != 202 {
			panic(fmt.Sprintf("starting the read: %d %s", r.Status, r.Body))
		}
		poll(st.readID)
	})

	// ---- review and Recipes ----
	sc.Step(`^I confirm the review$`, func() {
		remember(w.Client.Post("/api/imports/"+st.reviewID+"/confirm", map[string]any{"decisions": map[string]any{}}))
	})
	sc.Step(`^I confirm the review choosing photo (\d+) for Recipe (\d+)$`, func(photo, recipe int) {
		remember(w.Client.Post("/api/imports/"+st.reviewID+"/confirm", map[string]any{"decisions": map[string]any{}, "photo": map[string]any{"index": photo - 1, "recipe": recipe - 1}}))
	})
	sc.Step(`^I close the review$`, func() { remember(w.Client.Delete("/api/imports/" + st.reviewID)) })
	recipes := func() []map[string]any {
		var list []map[string]any
		r := w.Client.Get("/api/recipes?archived=all")
		_ = json.Unmarshal(r.Body, &list)
		return list
	}
	sc.Step(`^(\d+) Recipes exist$`, func(n int) error {
		if got := len(recipes()); got != n {
			return fmt.Errorf("%d Recipes exist, want %d", got, n)
		}
		return nil
	})
	sc.Step(`^no Recipe has an image or a source address$`, func() error {
		for _, r := range recipes() {
			full := w.Client.Get(fmt.Sprintf("/api/recipes/%v", r["id"]))
			var rec struct {
				Image  string
				Source *struct{ URL string }
			}
			_ = json.Unmarshal(full.Body, &rec)
			if rec.Image != "" || (rec.Source != nil && rec.Source.URL != "") {
				return fmt.Errorf("Recipe %v: %s", r["id"], full.Body)
			}
		}
		return nil
	})
	sc.Step(`^Recipe (\d+) has one WebP image and Recipe (\d+) has none$`, func(with, without int) error {
		var done struct {
			Recipes []struct {
				Index int
				ID    int64
			}
		}
		_ = json.Unmarshal(w.Last.Body, &done)
		if w.Last.Status != 200 {
			return fail("confirm failed")
		}
		for _, r := range done.Recipes {
			var rec struct{ Image, ImageURL string }
			_ = json.Unmarshal(w.Client.Get(fmt.Sprintf("/api/recipes/%d", r.ID)).Body, &rec)
			switch r.Index {
			case with - 1:
				img := w.Client.Get(rec.ImageURL)
				if rec.Image == "" || img.Status != 200 || img.Header.Get("Content-Type") != "image/webp" {
					return fmt.Errorf("Recipe %d image = %q (%d %s)", with, rec.Image, img.Status, img.Header.Get("Content-Type"))
				}
			case without - 1:
				if rec.Image != "" {
					return fmt.Errorf("Recipe %d has an image", without)
				}
			}
		}
		return nil
	})

	// ---- photos ----
	gradient := func(wd, ht int) []byte {
		img := image.NewRGBA(image.Rect(0, 0, wd, ht))
		for y := 0; y < ht; y++ {
			for x := 0; x < wd; x++ {
				img.Set(x, y, color.RGBA{uint8(x * 255 / wd), uint8(y * 255 / ht), 120, 255})
			}
		}
		var b bytes.Buffer
		_ = jpeg.Encode(&b, img, &jpeg.Options{Quality: 85})
		return b.Bytes()
	}
	dataURL := func(wd, ht int) map[string]any {
		return map[string]any{"dataUrl": "data:image/jpeg;base64," + base64.StdEncoding.EncodeToString(gradient(wd, ht))}
	}
	photos := func(n int) []map[string]any {
		out := []map[string]any{dataURL(3000, 2000), dataURL(800, 600)}
		for len(out) < n {
			out = append(out, dataURL(100, 100))
		}
		return out[:n]
	}
	sc.Step(`^I read (\d+) photos$`, func(n int) {
		if r := start(map[string]any{"photos": photos(n)}); r.Status != 202 {
			panic(fmt.Sprintf("starting the photo read: %d %s", r.Status, r.Body))
		}
		poll(st.readID)
	})
	sc.Step(`^I start a read of (\d+) photos$`, func(n int) { start(map[string]any{"photos": photos(n)}) })
	sc.Step(`^I start a read of a 9 MB photo$`, func() {
		start(map[string]any{"photos": []map[string]any{{"dataUrl": "data:image/jpeg;base64," + base64.StdEncoding.EncodeToString(bytes.Repeat([]byte{1}, 9<<20))}}})
	})
	sc.Step(`^I read the photo address "([^"]*)"$`, func(u string) {
		if r := start(map[string]any{"photos": []map[string]any{{"url": u}}}); r.Status != 202 {
			panic(fmt.Sprintf("starting the read: %d %s", r.Status, r.Body))
		}
		poll(st.readID)
	})
	// ---- photo read: order, formats, links (photo-read design, section 12.3) ----
	sizes := func(list string) [][2]int {
		var out [][2]int
		for _, m := range regexp.MustCompile(`(\d+)x(\d+)`).FindAllStringSubmatch(list, -1) {
			wd, _ := strconv.Atoi(m[1])
			ht, _ := strconv.Atoi(m[2])
			out = append(out, [2]int{wd, ht})
		}
		return out
	}
	fixture := func(name string) []byte {
		b, err := os.ReadFile(filepath.Join("..", "internal", "imaging", "testdata", name))
		if err != nil {
			panic(err)
		}
		return b
	}
	readOne := func(dataURL string) {
		if r := start(map[string]any{"photos": []map[string]any{{"dataUrl": dataURL}}}); r.Status != 202 {
			panic(fmt.Sprintf("starting the photo read: %d %s", r.Status, r.Body))
		}
		poll(st.readID)
	}
	photoServer := func(body func(path string) []byte) *httptest.Server {
		hookFetch(w, st)
		srv := httptest.NewTLSServer(http.HandlerFunc(func(rw http.ResponseWriter, r *http.Request) {
			rw.Header().Set("Content-Type", "image/jpeg")
			_, _ = rw.Write(body(r.URL.Path))
		}))
		st.servers = append(st.servers, srv.Close)
		st.page = srv
		return srv
	}
	sc.Step(`^I read photos of ((?:\d+x\d+(?:, | and )?)+) px$`, func(list string) {
		var ps []map[string]any
		for _, sz := range sizes(list) {
			ps = append(ps, dataURL(sz[0], sz[1]))
		}
		if r := start(map[string]any{"photos": ps}); r.Status != 202 {
			panic(fmt.Sprintf("starting the photo read: %d %s", r.Status, r.Body))
		}
		poll(st.readID)
	})
	sc.Step(`^I start a read of no photos$`, func() { start(map[string]any{"photos": []map[string]any{}}) })
	sc.Step(`^the model received image blocks of ((?:\d+x\d+(?:, | and )?)+) px, in that order$`, func(list string) error {
		ms := st.fake.Messages()
		if len(ms) != 1 {
			return fmt.Errorf("calls = %d", len(ms))
		}
		imgs := ms[0].Images()
		want := sizes(list)
		if len(imgs) != len(want) {
			return fmt.Errorf("%d image blocks, want %d", len(imgs), len(want))
		}
		for i, im := range imgs {
			if im.Width != want[i][0] || im.Height != want[i][1] {
				return fmt.Errorf("block %d is %dx%d, want %dx%d", i+1, im.Width, im.Height, want[i][0], want[i][1])
			}
		}
		return nil
	})
	sc.Step(`^I read the (?:HEIC )?photo "([^"]*)"(?: declared as "([^"]*)")?$`, func(name, declared string) {
		if declared == "" {
			declared = "image/jpeg"
			if strings.HasSuffix(name, ".heic") {
				declared = "image/heic"
			}
		}
		readOne("data:" + declared + ";base64," + base64.StdEncoding.EncodeToString(fixture(name)))
	})
	sc.Step(`^I start a read of the photo "([^"]*)" declared as "([^"]*)"$`, func(name, declared string) {
		start(map[string]any{"photos": []map[string]any{{"dataUrl": "data:" + declared + ";base64," + base64.StdEncoding.EncodeToString(fixture(name))}}})
		if w.Last.Status == 202 {
			poll(st.readID)
		}
	})
	sc.Step(`^I start a read of a photo of text declared as "([^"]*)"$`, func(declared string) {
		start(map[string]any{"photos": []map[string]any{{"dataUrl": "data:" + declared + ";base64," + base64.StdEncoding.EncodeToString([]byte("not a picture, just words"))}}})
		if w.Last.Status == 202 {
			poll(st.readID)
		}
	})
	sc.Step(`^I start a read of a photo that is both a data URL and a link$`, func() {
		p := dataURL(100, 100)
		p["url"] = "https://example.test/card.jpg"
		start(map[string]any{"photos": []map[string]any{p}})
	})
	sc.Step(`^a photo link "([^"]*)" of (\d+)x(\d+) px$`, func(path string, wd, ht int) {
		jp := gradient(wd, ht)
		photoServer(func(p string) []byte {
			if p == path {
				return jp
			}
			return nil
		})
	})
	sc.Step(`^a photo link "([^"]*)" of 9 MB$`, func(path string) {
		photoServer(func(p string) []byte {
			if p == path {
				return bytes.Repeat([]byte{1}, 9<<20)
			}
			return nil
		})
	})
	sc.Step(`^a photo link "([^"]*)" that holds text$`, func(path string) {
		photoServer(func(p string) []byte {
			if p == path {
				return []byte("not a picture, just words")
			}
			return nil
		})
	})
	sc.Step(`^I read the photo link "([^"]*)"$`, func(path string) {
		if r := start(map[string]any{"photos": []map[string]any{{"url": st.page.URL + path}}}); r.Status != 202 {
			panic(fmt.Sprintf("starting the read: %d %s", r.Status, r.Body))
		}
		poll(st.readID)
	})
	sc.Step(`^I start a read of the photo link "([^"]*)"$`, func(path string) {
		start(map[string]any{"photos": []map[string]any{{"url": st.page.URL + path}}})
		if st.readID != "" && w.Last.Status == 202 {
			poll(st.readID)
		}
	})
	sc.Step(`^I read a photo of (\d+)x(\d+) px, then the photo link "([^"]*)", then a photo of (\d+)x(\d+) px$`, func(w1, h1 int, path string, w2, h2 int) {
		ps := []map[string]any{dataURL(w1, h1), {"url": st.page.URL + path}, dataURL(w2, h2)}
		if r := start(map[string]any{"photos": ps}); r.Status != 202 {
			panic(fmt.Sprintf("starting the photo read: %d %s", r.Status, r.Body))
		}
		poll(st.readID)
	})
	sc.Step(`^the model received (\d+) JPEG image blocks before the text, each at most (\d+) px$`, func(n, max int) error {
		ms := st.fake.Messages()
		if len(ms) != 1 {
			return fmt.Errorf("calls = %d", len(ms))
		}
		imgs := ms[0].Images()
		if len(imgs) != n {
			return fmt.Errorf("%d image blocks, want %d", len(imgs), n)
		}
		for i, im := range imgs {
			if im.MediaType != "image/jpeg" || im.Width > max || im.Height > max || im.Index != i {
				return fmt.Errorf("image %d = %+v", i, im)
			}
		}
		return nil
	})
	sc.Step(`^the read result has no images$`, func() error {
		r := w.Client.Post("/api/imports/"+st.reviewID+"/plan", map[string]any{"decisions": map[string]any{}})
		if strings.Contains(string(r.Body), "image_not_in_source") || strings.Contains(string(r.Body), `"image":"http`) {
			return fmt.Errorf("plan mentions images: %s", r.Body)
		}
		return nil
	})
	sc.Step(`^the review's photo (\d+) answers (\d+)$`, func(n, want int) error {
		r := w.Client.Get(fmt.Sprintf("/api/imports/%s/photos/%d", st.reviewID, n-1))
		if r.Status != want {
			return fmt.Errorf("photo %d = %d, want %d", n, r.Status, want)
		}
		return nil
	})
	sc.Step(`^I send a 40 MB photo request body$`, func() {
		var sent atomic.Int64
		prefix := `{"photos":[{"dataUrl":"data:image/jpeg;base64,`
		rd := io.MultiReader(strings.NewReader(prefix), io.LimitReader(countingFiller{&sent}, 40<<20))
		req, _ := http.NewRequest("POST", w.Env.URL()+"/api/recipe-assistant/reads", rd)
		req.ContentLength = int64(len(prefix)) + 40<<20
		req.Header.Set("Content-Type", "application/json")
		req.AddCookie(w.Client.Cookie(auth.CookieName))
		cl := &http.Client{Transport: &http.Transport{DisableKeepAlives: true}, Timeout: 30 * time.Second}
		resp, err := cl.Do(req)
		if err != nil {
			panic(err)
		}
		defer resp.Body.Close()
		b, _ := io.ReadAll(resp.Body)
		remember(&testkit.Response{Status: resp.StatusCode, Header: resp.Header, Body: b})
		st.view = map[string]any{"sent": float64(sent.Load())}
	})
	sc.Step(`^less than half of the body was consumed$`, func() error {
		if sent, _ := st.view["sent"].(float64); sent > 20<<20 {
			return fmt.Errorf("%d MiB of 40 MiB were consumed before the refusal", int64(sent)>>20)
		}
		return nil
	})
}

type countingFiller struct{ n *atomic.Int64 }

func (c countingFiller) Read(p []byte) (int, error) {
	for i := range p {
		p[i] = 'a'
	}
	c.n.Add(int64(len(p)))
	return len(p), nil
}

func lastBody(w *World) string {
	if w.Last == nil {
		return "<none>"
	}
	return string(w.Last.Body)
}

// resolve maps the placeholders used in Examples tables: {fake}, {second}, with an optional variant after a colon:
// localhost (host spelled localhost), https (scheme changed).
func (s *raState) resolve(token string) string {
	if !strings.HasPrefix(token, "{") {
		return token
	}
	name, variant, _ := strings.Cut(strings.Trim(token, "{}"), ":")
	base := s.fake.URL
	if name == "second" {
		base = s.second.URL
	}
	switch variant {
	case "localhost":
		return strings.Replace(base, "127.0.0.1", "localhost", 1)
	case "https":
		return strings.Replace(base, "http://", "https://", 1)
	}
	return base
}

func routeBody(method, base, key string) map[string]any {
	m := map[string]any{"baseUrl": base}
	if method == "PUT" {
		m["enabled"] = true
		m["model"] = "claude-haiku-5-5"
	}
	if key != "" {
		m["apiKey"] = key
	}
	return m
}

func keysSeen(f *fakeanthropic.Server, want, never string) error {
	keys := f.Keys()
	var ok bool
	for _, k := range keys {
		if k == never {
			return fmt.Errorf("the saved key reached the other origin")
		}
		if k == want {
			ok = true
		}
	}
	if !ok {
		return fmt.Errorf("the other server saw keys %v, want %q", keys, want)
	}
	return nil
}

// hookFetch lets page and photo-URL fetches reach httptest TLS servers (once per scenario).
func hookFetch(w *World, st *raState) {
	if st.hooked {
		return
	}
	st.hooked = true
	service.SetTestHooks(w.TB, w.Env.DataDir, service.Hooks{Safehttp: safehttp.Options{
		LookupIP: func(context.Context, string) ([]netip.Addr, error) {
			return []netip.Addr{netip.MustParseAddr("127.0.0.1")}, nil
		},
		Allow:     func(netip.AddrPort) bool { return true },
		TLSConfig: &tls.Config{InsecureSkipVerify: true},
	}})
}
