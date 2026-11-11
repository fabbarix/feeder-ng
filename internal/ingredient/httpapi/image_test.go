package httpapi_test

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"image"
	"image/png"
	"strings"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/testkit"
)

// IM2: the Ingredient picture in the API.

type pictured struct {
	ID       int64  `json:"id"`
	Name     string `json:"name"`
	Image    string `json:"image"`
	ImageURL string `json:"imageUrl"`
}

func upload(t *testing.T, c *testkit.Client) string {
	t.Helper()
	var b bytes.Buffer
	if err := png.Encode(&b, image.NewRGBA(image.Rect(0, 0, 40, 30))); err != nil {
		t.Fatal(err)
	}
	r := c.Post("/api/images", map[string]string{"dataUrl": "data:image/png;base64," + base64.StdEncoding.EncodeToString(b.Bytes())})
	if r.Status != 201 {
		t.Fatalf("upload = %d %s", r.Status, r.Body)
	}
	var out struct {
		ID string `json:"id"`
	}
	r.MustJSON(t, &out)
	return out.ID
}

func TestCreateAnIngredientWithAPicture(t *testing.T) {
	env := testkit.Start(t)
	u := env.LoginUser(t)
	id := upload(t, u)
	var got pictured
	r := u.Post("/api/ingredients", map[string]any{"name": "Flour", "baseUnit": "g", "image": id})
	r.MustJSON(t, &got)
	if r.Status != 201 || got.Image != id || got.ImageURL != "/api/images/"+id {
		t.Fatalf("create = %d %+v", r.Status, got)
	}
	var detail pictured
	u.Get(fmt.Sprintf("/api/ingredients/%d", got.ID)).MustJSON(t, &detail)
	if detail.Image != id {
		t.Errorf("GET detail = %+v", detail)
	}
	var list []pictured
	u.Get("/api/ingredients").MustJSON(t, &list)
	if len(list) != 1 || list[0].ImageURL == "" {
		t.Errorf("the list must carry the picture for thumbnails: %+v", list)
	}
}

func TestAnIngredientWithoutAPictureAnswersEmptyImageFields(t *testing.T) {
	env := testkit.Start(t)
	r := env.LoginUser(t).Post("/api/ingredients", map[string]any{"name": "Salt", "baseUnit": "g"})
	if r.Status != 201 || !strings.Contains(string(r.Body), `"image":""`) || !strings.Contains(string(r.Body), `"imageUrl":""`) {
		t.Errorf("body = %s; image and imageUrl are always present", r.Body)
	}
}

func TestPatchSetsKeepsAndClearsThePicture(t *testing.T) {
	env := testkit.Start(t)
	u := env.LoginUser(t)
	var ing pictured
	u.Post("/api/ingredients", map[string]any{"name": "Flour", "baseUnit": "g"}).MustJSON(t, &ing)
	url := fmt.Sprintf("/api/ingredients/%d", ing.ID)
	id := upload(t, u)

	var got pictured
	if r := u.Patch(url, map[string]any{"image": id}); r.Status != 200 {
		t.Fatalf("set = %d %s", r.Status, r.Body)
	} else {
		r.MustJSON(t, &got)
	}
	if got.Image != id {
		t.Fatalf("set = %+v", got)
	}
	u.Patch(url, map[string]any{"name": "Plain flour"}).MustJSON(t, &got)
	if got.Image != id {
		t.Errorf("a PATCH without image must keep it: %+v", got)
	}
	u.Patch(url, map[string]any{"image": ""}).MustJSON(t, &got)
	if got.Image != "" || got.ImageURL != "" {
		t.Errorf("image \"\" clears it: %+v", got)
	}
	if g := u.Get("/api/images/" + id); g.Status != 404 {
		t.Errorf("the cleared picture's file is removed: %d", g.Status)
	}
}

func TestAPictureThatWasNeverUploadedIsRefused(t *testing.T) {
	env := testkit.Start(t)
	u := env.LoginUser(t)
	for name, image := range map[string]string{"malformed": "flour.png", "never uploaded": strings.Repeat("c", 32)} {
		r := u.Post("/api/ingredients", map[string]any{"name": "Flour " + name, "baseUnit": "g", "image": image})
		if r.Status != 400 || r.ErrorCode() != "invalid_ingredient" || !strings.Contains(string(r.Body), "image") {
			t.Errorf("%s: %d %s", name, r.Status, r.Body)
		}
	}
}
