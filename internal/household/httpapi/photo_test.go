package httpapi_test

import (
	"bytes"
	"encoding/base64"
	"image"
	"image/png"
	"strings"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/testkit"
)

// IM2: the Member photo in the API.

type photoMember struct {
	ID       int64  `json:"id"`
	Name     string `json:"name"`
	Avatar   string `json:"avatar"`
	Photo    string `json:"photo"`
	PhotoURL string `json:"photoUrl"`
}

func uploadPNG(t *testing.T, c *testkit.Client) string {
	t.Helper()
	var b bytes.Buffer
	if err := png.Encode(&b, image.NewRGBA(image.Rect(0, 0, 40, 40))); err != nil {
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

func TestMemberPhotoIsStoredShownAndCleared(t *testing.T) {
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	id := uploadPNG(t, admin)

	var sam photoMember
	r := admin.Post("/api/members", map[string]any{"name": "Sam", "colour": "#e07a5f", "portionFactor": 1, "avatar": "🦊", "photo": id})
	r.MustJSON(t, &sam)
	if r.Status != 201 || sam.Photo != id || sam.PhotoURL != "/api/images/"+id || sam.Avatar != "🦊" {
		t.Fatalf("create = %d %+v", r.Status, sam)
	}
	if g := admin.Get("/api/images/" + id); g.Status != 200 {
		t.Errorf("the photo must be served: %d", g.Status)
	}

	var list []photoMember
	env.LoginUser(t).Get("/api/members").MustJSON(t, &list)
	if len(list) != 1 || list[0].Photo != id || list[0].PhotoURL == "" {
		t.Errorf("list = %+v; any User sees the photo", list)
	}

	var cleared photoMember
	r = admin.Patch(path("/api/members/%d", sam.ID), map[string]any{"name": "Sam", "colour": "#e07a5f", "portionFactor": 1})
	r.MustJSON(t, &cleared)
	if r.Status != 200 || cleared.Photo != "" || cleared.PhotoURL != "" {
		t.Errorf("patch without a photo = %d %+v; it clears it", r.Status, cleared)
	}
}

func TestMemberWithoutAPhotoAnswersAnEmptyPhoto(t *testing.T) {
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	r := admin.Post("/api/members", map[string]any{"name": "Anna", "colour": "#3366cc", "portionFactor": 1})
	if r.Status != 201 || !strings.Contains(string(r.Body), `"photo":""`) || !strings.Contains(string(r.Body), `"photoUrl":""`) {
		t.Errorf("body = %s; photo and photoUrl are always present, empty when there is none", r.Body)
	}
}

func TestMemberPhotoMustBeAnUploadedImage(t *testing.T) {
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	for name, photo := range map[string]string{"malformed": "sam.png", "never uploaded": strings.Repeat("c", 32)} {
		r := admin.Post("/api/members", map[string]any{"name": "Sam", "colour": "#e07a5f", "portionFactor": 1, "photo": photo})
		if r.Status != 422 || r.ErrorCode() != "validation_failed" || !strings.Contains(string(r.Body), "photo") {
			t.Errorf("%s: %d %s", name, r.Status, r.Body)
		}
	}
	var list []photoMember
	admin.Get("/api/members").MustJSON(t, &list)
	if len(list) != 0 {
		t.Errorf("a refused Member was stored: %+v", list)
	}
}

func TestOnlyAnAdminSetsAMemberPhoto(t *testing.T) {
	env := testkit.Start(t)
	user := env.LoginUser(t)
	id := uploadPNG(t, user)
	if r := user.Post("/api/members", map[string]any{"name": "Sam", "colour": "#e07a5f", "portionFactor": 1, "photo": id}); r.Status != 403 {
		t.Errorf("User POST = %d", r.Status)
	}
}

func TestRemovingAMemberRemovesTheirPhotoFile(t *testing.T) {
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	id := uploadPNG(t, admin)
	var sam photoMember
	admin.Post("/api/members", map[string]any{"name": "Sam", "colour": "#e07a5f", "portionFactor": 1, "photo": id}).MustJSON(t, &sam)
	if r := admin.Delete(path("/api/members/%d", sam.ID)); r.Status != 204 {
		t.Fatalf("delete = %d", r.Status)
	}
	if g := admin.Get("/api/images/" + id); g.Status != 404 {
		t.Errorf("the photo of a removed Member is still served: %d (delete the file with the Member; the sweep is the safety net)", g.Status)
	}
}

func TestRemovingAPhotoNeverDeletesAFileAnIngredientStillUses(t *testing.T) {
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	id := uploadPNG(t, admin)
	if r := admin.Post("/api/ingredients", map[string]any{"name": "Flour", "baseUnit": "g", "image": id}); r.Status != 201 {
		t.Fatalf("ingredient = %d %s", r.Status, r.Body)
	}
	var sam photoMember
	admin.Post("/api/members", map[string]any{"name": "Sam", "colour": "#e07a5f", "portionFactor": 1, "photo": id}).MustJSON(t, &sam)
	if r := admin.Patch(path("/api/members/%d", sam.ID), map[string]any{"name": "Sam", "colour": "#e07a5f", "portionFactor": 1}); r.Status != 200 {
		t.Fatalf("clear = %d %s", r.Status, r.Body)
	}
	if g := admin.Get("/api/images/" + id); g.Status != 200 {
		t.Errorf("the Ingredient's picture file must survive: %d", g.Status)
	}
	if r := admin.Delete(path("/api/members/%d", sam.ID)); r.Status != 204 {
		t.Fatalf("delete = %d", r.Status)
	}
	if g := admin.Get("/api/images/" + id); g.Status != 200 {
		t.Errorf("deleting the Member must not remove the Ingredient's picture: %d", g.Status)
	}
}
