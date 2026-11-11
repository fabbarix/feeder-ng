package bdd

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"image"
	"image/png"
	"net/http"
	"os"
	"path/filepath"

	"github.com/cucumber/godog"

	"github.com/fabbarix/feeder-ng/internal/recipefile"
	"github.com/fabbarix/feeder-ng/internal/units"
)

func init() { RegisterSteps("im3", im3Steps) }

// im3Steps: Recipe File pictures for Ingredients the household already has (docs/dev/design/im3-import-pictures.md).
func im3Steps(sc *godog.ScenarioContext, w *World) {
	sc.Step(`^I review a Recipe File whose Ingredient "([^"]*)" has a picture$`, func(name string) error {
		var b bytes.Buffer
		if err := png.Encode(&b, image.NewRGBA(image.Rect(0, 0, 32, 24))); err != nil {
			return err
		}
		file := map[string]any{
			"format": "feeder-recipe-file", "version": 1,
			"ingredients": []map[string]any{{"name": name, "baseUnit": "g", "image": "data:image/png;base64," + base64.StdEncoding.EncodeToString(b.Bytes())}},
			"recipes": []map[string]any{{
				"name": "Garlic bread", "yield": 2,
				"ingredients": []map[string]any{{"ingredient": name, "quantity": 5, "unit": "g"}},
				"steps":       []map[string]any{{"text": "Bake", "kind": "active", "durationMinutes": 5}},
			}},
		}
		text, _ := json.Marshal(file)
		w.Last = w.Client.Do("POST", "/api/imports", map[string]any{"text": string(text)})
		if w.Last.Status == http.StatusCreated {
			saveReview(w)
		}
		return nil
	})
	addsImage := func(name string) (bool, error) {
		p, _ := w.Vars["rf-plan"].(recipefile.Plan)
		for _, m := range p.Ingredients {
			if m.Key == units.NormalizeName(name) {
				return m.AddsImage, nil
			}
		}
		return false, fmt.Errorf("no row for the Ingredient %q in the review", name)
	}
	sc.Step(`^the review says it adds a picture to the Ingredient "([^"]*)"$`, func(name string) error {
		if ok, err := addsImage(name); err != nil || !ok {
			return fmt.Errorf("%q: addsImage=%v %v", name, ok, err)
		}
		return nil
	})
	sc.Step(`^the review adds no picture to the Ingredient "([^"]*)"$`, func(name string) error {
		if ok, err := addsImage(name); err != nil || ok {
			return fmt.Errorf("%q: addsImage=%v %v", name, ok, err)
		}
		return nil
	})
	sc.Step(`^the household stores (\d+) images?$`, func(n int) error {
		entries, err := os.ReadDir(filepath.Join(w.Ensure().DataDir, "images"))
		if err != nil && !os.IsNotExist(err) {
			return err
		}
		if len(entries) != n {
			return fmt.Errorf("%d image files, want %d", len(entries), n)
		}
		return nil
	})
}
