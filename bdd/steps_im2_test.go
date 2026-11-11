package bdd

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"image"
	"image/png"
	"net/http"
	"strings"

	"github.com/cucumber/godog"

	"github.com/fabbarix/feeder-ng/internal/recipefile"
	"github.com/fabbarix/feeder-ng/internal/units"
)

func init() { RegisterSteps("im2", im2Steps) }

// im2Steps drives Ingredient pictures and Member photos over HTTP (docs/dev/design/im2-image-fields.md). Images are added with the
// steps of the "images" set ("I add a 40x30 PNG image named ..."), which remember the id under w.Vars["image:<name>"].
func im2Steps(sc *godog.ScenarioContext, w *World) {
	imageID := func(name string) (string, error) {
		id, ok := w.Vars["image:"+name].(string)
		if !ok {
			return "", fmt.Errorf("no image named %q was added", name)
		}
		return id, nil
	}
	type pic struct {
		ID       int64  `json:"id"`
		Name     string `json:"name"`
		Image    string `json:"image"`
		ImageURL string `json:"imageUrl"`
	}
	ingredientNamed := func(name string) (pic, error) {
		var all []pic
		r := w.Client.Get("/api/ingredients")
		if err := r.JSON(&all); err != nil {
			return pic{}, fmt.Errorf("listing Ingredients: %v %s", err, r.Body)
		}
		for _, i := range all {
			if strings.EqualFold(i.Name, name) {
				return i, nil
			}
		}
		return pic{}, fmt.Errorf("no Ingredient %q", name)
	}
	createIngredient := func(name, imageID string) {
		body := map[string]any{"name": name, "baseUnit": "g"}
		if imageID != "" {
			body["image"] = imageID
		}
		w.Last = w.Client.Do("POST", "/api/ingredients", body)
		if w.Last.Status == http.StatusCreated { // so the steps of the "ingredients" set (merge, ...) find it by name
			var created pic
			if w.Last.JSON(&created) == nil {
				w.Vars["ingredient:"+name] = created.ID
				w.Vars["rf-ingredient:"+units.NormalizeName(name)] = created.ID // the Recipe File steps look it up here
			}
		}
	}

	// --- Ingredients ---
	sc.Step(`^I create the Ingredient "([^"]*)" with the image "([^"]*)"$`, func(name, img string) error {
		id, err := imageID(img)
		if err != nil {
			return err
		}
		createIngredient(name, id)
		return nil
	})
	sc.Step(`^I create the Ingredient "([^"]*)" with the image id "([^"]*)"$`, func(name, id string) { createIngredient(name, id) })
	sc.Step(`^I create the Ingredient "([^"]*)" with no picture$`, func(name string) { createIngredient(name, "") })
	setPicture := func(name, id string) error {
		ing, err := ingredientNamed(name)
		if err != nil {
			return err
		}
		w.Last = w.Client.Do("PATCH", fmt.Sprintf("/api/ingredients/%d", ing.ID), map[string]any{"image": id})
		return nil
	}
	sc.Step(`^I set the picture of the Ingredient "([^"]*)" to the image "([^"]*)"$`, func(name, img string) error {
		id, err := imageID(img)
		if err != nil {
			return err
		}
		return setPicture(name, id)
	})
	sc.Step(`^I remove the picture of the Ingredient "([^"]*)"$`, func(name string) error { return setPicture(name, "") })
	sc.Step(`^I rename the Ingredient "([^"]*)" to "([^"]*)"$`, func(name, to string) error {
		ing, err := ingredientNamed(name)
		if err != nil {
			return err
		}
		w.Last = w.Client.Do("PATCH", fmt.Sprintf("/api/ingredients/%d", ing.ID), map[string]any{"name": to})
		return nil
	})
	sc.Step(`^the Ingredient "([^"]*)" shows the picture "([^"]*)"$`, func(name, img string) error {
		want, err := imageID(img)
		if err != nil {
			return err
		}
		ing, err := ingredientNamed(name)
		if err != nil {
			return err
		}
		if ing.Image != want || ing.ImageURL != "/api/images/"+want {
			return fmt.Errorf("Ingredient %q: image %q url %q, want %q", name, ing.Image, ing.ImageURL, want)
		}
		return nil
	})
	sc.Step(`^the Ingredient "([^"]*)" has no picture$`, func(name string) error {
		ing, err := ingredientNamed(name)
		if err != nil {
			return err
		}
		if ing.Image != "" || ing.ImageURL != "" {
			return fmt.Errorf("Ingredient %q has image %q", name, ing.Image)
		}
		return nil
	})

	// --- Recipe File ---
	sc.Step(`^the downloaded Recipe File gives the Ingredient "([^"]*)" an embedded picture$`, func(name string) error {
		data, _ := w.Vars["rf-download"].([]byte)
		f, err := recipefile.Parse(data)
		if err != nil {
			return fmt.Errorf("the download does not validate: %v", err)
		}
		for _, i := range f.Ingredients {
			if strings.EqualFold(i.Name, name) {
				if !strings.HasPrefix(i.Image, "data:image/webp;base64,") {
					return fmt.Errorf("image = %.40q", i.Image)
				}
				return nil
			}
		}
		return fmt.Errorf("no Ingredient %q in the download", name)
	})
	sc.Step(`^I review a Recipe File whose new Ingredient "([^"]*)" has a picture$`, func(name string) error {
		var b bytes.Buffer
		if err := png.Encode(&b, image.NewRGBA(image.Rect(0, 0, 32, 24))); err != nil {
			return err
		}
		file := map[string]any{
			"format": "feeder-recipe-file", "version": 1,
			"ingredients": []map[string]any{{"name": name, "baseUnit": "g", "image": "data:image/png;base64," + base64.StdEncoding.EncodeToString(b.Bytes())}},
			"recipes": []map[string]any{{
				"name": "Golden rice", "yield": 2,
				"ingredients": []map[string]any{{"ingredient": name, "quantity": 1, "unit": "g"}},
				"steps":       []map[string]any{{"text": "Soak", "kind": "active", "durationMinutes": 5}},
			}},
		}
		text, _ := json.Marshal(file)
		w.Last = w.Client.Do("POST", "/api/imports", map[string]any{"text": string(text)})
		if w.Last.Status == http.StatusCreated {
			saveReview(w)
		}
		return nil
	})
	sc.Step(`^the Ingredient "([^"]*)" shows an imported picture$`, func(name string) error {
		ing, err := ingredientNamed(name)
		if err != nil {
			return err
		}
		if ing.Image == "" {
			return fmt.Errorf("Ingredient %q has no picture after the import", name)
		}
		if got := w.Client.Get("/api/images/" + ing.Image).Status; got != http.StatusOK {
			return fmt.Errorf("the picture is not served: %d", got)
		}
		return nil
	})

	// --- Members ---
	type member struct {
		ID            int64   `json:"id"`
		Name          string  `json:"name"`
		Colour        string  `json:"colour"`
		Avatar        string  `json:"avatar"`
		PortionFactor float64 `json:"portionFactor"`
		Photo         string  `json:"photo"`
		PhotoURL      string  `json:"photoUrl"`
	}
	memberNamed := func(name string) (member, error) {
		var all []member
		r := w.Client.Get("/api/members")
		if err := r.JSON(&all); err != nil {
			return member{}, fmt.Errorf("listing Members: %v %s", err, r.Body)
		}
		for _, m := range all {
			if m.Name == name {
				return m, nil
			}
		}
		return member{}, fmt.Errorf("no Member %q", name)
	}
	addMember := func(name, photo string) {
		body := map[string]any{"name": name, "colour": "#3366cc", "portionFactor": 1}
		if photo != "" {
			body["photo"] = photo
		}
		w.Last = w.Client.Do("POST", "/api/members", body)
	}
	sc.Step(`^I add the Member "([^"]*)" with the photo "([^"]*)"$`, func(name, img string) error {
		id, err := imageID(img)
		if err != nil {
			return err
		}
		addMember(name, id)
		return nil
	})
	sc.Step(`^I add the Member "([^"]*)" with the photo id "([^"]*)"$`, func(name, id string) { addMember(name, id) })
	sc.Step(`^I add the Member "([^"]*)" with no photo$`, func(name string) { addMember(name, "") })
	changePhoto := func(name, photo string) error {
		m, err := memberNamed(name)
		if err != nil {
			return err
		}
		body := map[string]any{"name": m.Name, "colour": m.Colour, "avatar": m.Avatar, "portionFactor": m.PortionFactor}
		if photo != "" {
			body["photo"] = photo
		}
		w.Last = w.Client.Do("PATCH", fmt.Sprintf("/api/members/%d", m.ID), body)
		return nil
	}
	sc.Step(`^I change the photo of the Member "([^"]*)" to the image "([^"]*)"$`, func(name, img string) error {
		id, err := imageID(img)
		if err != nil {
			return err
		}
		return changePhoto(name, id)
	})
	sc.Step(`^I change the Member "([^"]*)" to have no photo$`, func(name string) error { return changePhoto(name, "") })
	sc.Step(`^the Member "([^"]*)" shows the photo "([^"]*)"$`, func(name, img string) error {
		want, err := imageID(img)
		if err != nil {
			return err
		}
		m, err := memberNamed(name)
		if err != nil {
			return err
		}
		if m.Photo != want || m.PhotoURL != "/api/images/"+want {
			return fmt.Errorf("Member %q: photo %q url %q, want %q", name, m.Photo, m.PhotoURL, want)
		}
		return nil
	})
	sc.Step(`^the Member "([^"]*)" has no photo$`, func(name string) error {
		m, err := memberNamed(name)
		if err != nil {
			return err
		}
		if m.Photo != "" || m.PhotoURL != "" {
			return fmt.Errorf("Member %q has photo %q", name, m.Photo)
		}
		return nil
	})
}
