package bdd

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"image"
	"image/png"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/cucumber/godog"

	"github.com/fabbarix/feeder-ng/internal/images/httpapi"
)

func init() { RegisterSteps("images", imagesSteps) }

// bddFetcher stands in for the internet: it serves only what a step put there.
type bddFetcher struct{ byURL map[string]fetched }

type fetched struct {
	data []byte
	ct   string
}

func (f *bddFetcher) Fetch(_ context.Context, u string) ([]byte, string, error) {
	if r, ok := f.byURL[u]; ok {
		return r.data, r.ct, nil
	}
	return nil, "", fmt.Errorf("connection refused: %s", u)
}

func imagesSteps(sc *godog.ScenarioContext, w *World) {
	srv := &bddFetcher{byURL: map[string]fetched{}}
	installed := false
	install := func() {
		if !installed {
			installed = true
			w.TB.Cleanup(httpapi.UseFetcher(srv))
		}
	}
	remember := func(name string) {
		var v struct {
			ID string `json:"id"`
		}
		if json.Unmarshal(w.Last.Body, &v) == nil && v.ID != "" {
			w.Vars["image:"+name] = v.ID
			w.Vars["image:last"] = v.ID
		}
	}
	idOfImage := func(name string) (string, error) {
		id, ok := w.Vars["image:"+name].(string)
		if !ok {
			return "", fmt.Errorf("no image named %q was added", name)
		}
		return id, nil
	}
	pngOf := func(wd, ht int) []byte {
		var b bytes.Buffer
		if err := png.Encode(&b, image.NewRGBA(image.Rect(0, 0, wd, ht))); err != nil {
			panic(err)
		}
		return b.Bytes()
	}

	sc.Step(`^a web server serves a (\d+)x(\d+) PNG at "([^"]*)"$`, func(wd, ht int, url string) {
		install()
		srv.byURL[url] = fetched{pngOf(wd, ht), "image/png"}
	})
	sc.Step(`^a web server serves the text "([^"]*)" as an image at "([^"]*)"$`, func(text, url string) {
		install()
		srv.byURL[url] = fetched{[]byte(text), "image/png"}
	})
	sc.Step(`^a web server serves a (\d+) MB image at "([^"]*)"$`, func(mb int, url string) {
		install()
		srv.byURL[url] = fetched{make([]byte, mb<<20), "image/png"}
	})
	sc.Step(`^I add the image from the link "([^"]*)"$`, func(link string) {
		w.Last = w.Client.Do("POST", "/api/images/from-url", map[string]string{"url": link})
		remember("link")
	})
	sc.Step(`^I add a (\d+)x(\d+) PNG image named "([^"]*)"$`, func(wd, ht int, name string) {
		body := map[string]string{"dataUrl": "data:image/png;base64," + b64(pngOf(wd, ht))}
		w.Last = w.Client.Do("POST", "/api/images", body)
		remember(name)
	})
	addFixture := func(file, mime, name string) error {
		data, err := os.ReadFile(filepath.Join("..", "internal", "imaging", "testdata", file))
		if err != nil {
			return err
		}
		w.Last = w.Client.Do("POST", "/api/images", map[string]string{"dataUrl": "data:" + mime + ";base64," + b64(data)})
		remember(name)
		return nil
	}
	sc.Step(`^I add the iPhone photo "([^"]*)"$`, func(name string) error {
		return addFixture("pantry-128x96.heic", "image/heic", name)
	})
	sc.Step(`^I add the sideways photo "([^"]*)"$`, func(name string) error {
		return addFixture("sideways-6.jpg", "image/jpeg", name)
	})
	sc.Step(`^I save the Recipe "([^"]*)" with the image "([^"]*)"$`, func(recipe, name string) error {
		id, err := idOfImage(name)
		if err != nil {
			return err
		}
		body := map[string]any{
			"name": recipe, "yield": 2, "image": id,
			"lines": []map[string]any{{"ingredientId": w.Vars["ingredient:flour"], "quantity": 100, "unit": "g"}},
			"steps": []map[string]any{{"text": "Cook", "kind": "active", "durationMinutes": 5}},
		}
		if r := w.Client.Do("POST", "/api/recipes", body); r.Status != http.StatusCreated {
			return fmt.Errorf("saving the Recipe: %d %s", r.Status, r.Body)
		}
		return nil
	})
	sc.Step(`^I discard the image "([^"]*)"$`, func(name string) error {
		id, err := idOfImage(name)
		if err != nil {
			return err
		}
		w.Last = w.Client.Do("DELETE", "/api/images/"+id, nil)
		return nil
	})
	sc.Step(`^(\d+) hours pass$`, func(h int) { w.Ensure().Clock.Advance(timeHours(h)) })
	sc.Step(`^the image "([^"]*)" is (gone|still there)$`, func(name, which string) error {
		id, err := idOfImage(name)
		if err != nil {
			return err
		}
		got := w.Client.Get("/api/images/" + id).Status
		if which == "gone" && got != http.StatusNotFound {
			return fmt.Errorf("image %q: status %d, want 404", name, got)
		}
		if which == "still there" && got != http.StatusOK {
			return fmt.Errorf("image %q: status %d, want 200", name, got)
		}
		return nil
	})
}

func b64(b []byte) string { return base64.StdEncoding.EncodeToString(b) }

func timeHours(h int) time.Duration { return time.Duration(h) * time.Hour }
