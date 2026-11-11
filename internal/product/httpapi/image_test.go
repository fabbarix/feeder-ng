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

// PP: the Product Picture in the API (docs/dev/design/pp-product-pictures.md).

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

func ingredient(t *testing.T, c *testkit.Client) int64 {
	t.Helper()
	var ing struct {
		ID int64 `json:"id"`
	}
	r := c.Post("/api/ingredients", map[string]any{"name": "passata", "baseUnit": "g"})
	r.MustJSON(t, &ing)
	if r.Status != 201 {
		t.Fatalf("ingredient = %d %s", r.Status, r.Body)
	}
	return ing.ID
}

func TestCreateAProductWithAPicture(t *testing.T) {
	env := testkit.Start(t)
	u := env.LoginUser(t)
	ing, id := ingredient(t, u), upload(t, u)
	var got pictured
	r := u.Post("/api/products", map[string]any{"name": "Mutti passata 700 g", "ingredientId": ing, "packSize": 700, "barcodes": []string{"8000500310427"}, "image": id})
	r.MustJSON(t, &got)
	if r.Status != 201 || got.Image != id || got.ImageURL != "/api/images/"+id {
		t.Fatalf("create = %d %+v", r.Status, got)
	}
	var detail pictured
	u.Get(fmt.Sprintf("/api/products/%d", got.ID)).MustJSON(t, &detail)
	if detail.Image != id || detail.ImageURL != "/api/images/"+id {
		t.Errorf("GET detail = %+v", detail)
	}
	var list []pictured
	u.Get("/api/products").MustJSON(t, &list)
	if len(list) != 1 || list[0].ImageURL != "/api/images/"+id {
		t.Errorf("the list must carry the picture for thumbnails: %+v", list)
	}
	var resolved struct {
		Product pictured `json:"product"`
	}
	u.Get("/api/resolve?barcode=8000500310427").MustJSON(t, &resolved)
	if resolved.Product.ImageURL != "/api/images/"+id {
		t.Errorf("resolve = %+v; a scan needs the picture", resolved.Product)
	}
}

func TestAProductWithoutAPictureAnswersEmptyImageFields(t *testing.T) {
	env := testkit.Start(t)
	u := env.LoginUser(t)
	r := u.Post("/api/products", map[string]any{"name": "Rice", "ingredientId": ingredient(t, u), "packSize": 1000})
	if r.Status != 201 || !strings.Contains(string(r.Body), `"image":""`) || !strings.Contains(string(r.Body), `"imageUrl":""`) {
		t.Errorf("body = %s; image and imageUrl are always present", r.Body)
	}
}

func TestPatchSetsKeepsAndClearsThePicture(t *testing.T) {
	env := testkit.Start(t)
	u := env.LoginUser(t)
	var p pictured
	u.Post("/api/products", map[string]any{"name": "Passata", "ingredientId": ingredient(t, u), "packSize": 700}).MustJSON(t, &p)
	url := fmt.Sprintf("/api/products/%d", p.ID)
	id := upload(t, u)

	var got pictured
	if r := u.Patch(url, map[string]any{"image": id}); r.Status != 200 {
		t.Fatalf("set = %d %s", r.Status, r.Body)
	} else {
		r.MustJSON(t, &got)
	}
	if got.Image != id || got.ImageURL != "/api/images/"+id {
		t.Fatalf("set = %+v", got)
	}
	u.Patch(url, map[string]any{"name": "Passata rustica"}).MustJSON(t, &got)
	if got.Image != id {
		t.Errorf("a PATCH without image must keep it: %+v", got)
	}
	u.Patch(url, map[string]any{"packSize": 500, "image": id}).MustJSON(t, &got)
	if got.Image != id {
		t.Errorf("a PATCH may carry the same picture again: %+v", got)
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
	ing := ingredient(t, u)
	for name, image := range map[string]string{"malformed": "jar.png", "never uploaded": strings.Repeat("c", 32)} {
		r := u.Post("/api/products", map[string]any{"name": "Passata " + name, "ingredientId": ing, "packSize": 700, "image": image})
		if r.Status != 400 || r.ErrorCode() != "invalid_product" || !strings.Contains(string(r.Body), "image") {
			t.Errorf("create, %s: %d %s", name, r.Status, r.Body)
		}
	}
	var p pictured
	u.Post("/api/products", map[string]any{"name": "Passata", "ingredientId": ing, "packSize": 700}).MustJSON(t, &p)
	r := u.Patch(fmt.Sprintf("/api/products/%d", p.ID), map[string]any{"image": strings.Repeat("c", 32)})
	if r.Status != 400 || r.ErrorCode() != "invalid_product" {
		t.Errorf("patch: %d %s", r.Status, r.Body)
	}
}

func TestARefusedPictureLeavesTheRestOfThePatchUnapplied(t *testing.T) {
	env := testkit.Start(t)
	u := env.LoginUser(t)
	var p pictured
	u.Post("/api/products", map[string]any{"name": "Passata", "ingredientId": ingredient(t, u), "packSize": 700}).MustJSON(t, &p)
	url := fmt.Sprintf("/api/products/%d", p.ID)
	r := u.Patch(url, map[string]any{"name": "Passata rustica", "image": strings.Repeat("c", 32)})
	if r.Status != 400 {
		t.Fatalf("patch = %d %s", r.Status, r.Body)
	}
	var got struct{ Name string }
	u.Get(url).MustJSON(t, &got)
	if got.Name != "Passata" {
		t.Errorf("name = %q; a refused PATCH must change nothing", got.Name)
	}
}

func TestDeletingAProductRemovesItsPictureFile(t *testing.T) {
	env := testkit.Start(t)
	u := env.LoginUser(t)
	id := upload(t, u)
	var p pictured
	u.Post("/api/products", map[string]any{"name": "Passata", "ingredientId": ingredient(t, u), "packSize": 700, "image": id}).MustJSON(t, &p)
	if r := u.Delete(fmt.Sprintf("/api/products/%d", p.ID)); r.Status != 204 {
		t.Fatalf("delete = %d %s", r.Status, r.Body)
	}
	if g := u.Get("/api/images/" + id); g.Status != 404 {
		t.Errorf("the picture file is removed with its Product: %d", g.Status)
	}
}

func TestArchivingAProductKeepsItsPicture(t *testing.T) {
	env := testkit.Start(t)
	u := env.LoginUser(t)
	id := upload(t, u)
	var p pictured
	u.Post("/api/products", map[string]any{"name": "Passata", "ingredientId": ingredient(t, u), "packSize": 700, "image": id}).MustJSON(t, &p)
	if r := u.Post(fmt.Sprintf("/api/products/%d/archive", p.ID), map[string]any{}); r.Status != 200 {
		t.Fatalf("archive = %d %s", r.Status, r.Body)
	}
	var list []pictured
	u.Get("/api/products?includeArchived=1").MustJSON(t, &list)
	if len(list) != 1 || list[0].Image != id || u.Get("/api/images/"+id).Status != 200 {
		t.Errorf("list = %+v; an archived Product keeps its picture", list)
	}
}

// Guarded: the store drops a file when no Product uses it, but another record kind may still hold the id.
func TestClearingAPictureNeverDeletesAFileAnIngredientStillUses(t *testing.T) {
	env := testkit.Start(t)
	u := env.LoginUser(t)
	id := upload(t, u)
	ing := ingredient(t, u)
	if r := u.Patch(fmt.Sprintf("/api/ingredients/%d", ing), map[string]any{"image": id}); r.Status != 200 {
		t.Fatalf("ingredient picture = %d %s", r.Status, r.Body)
	}
	var p pictured
	u.Post("/api/products", map[string]any{"name": "Passata", "ingredientId": ing, "packSize": 700, "image": id}).MustJSON(t, &p)
	// A hand-made request gives the Product the Ingredient's picture, then clears it.
	if r := u.Patch(fmt.Sprintf("/api/products/%d", p.ID), map[string]any{"image": ""}); r.Status != 200 {
		t.Fatalf("clear = %d %s", r.Status, r.Body)
	}
	if g := u.Get("/api/images/" + id); g.Status != 200 {
		t.Errorf("the Ingredient's picture file must survive: %d", g.Status)
	}
}

func TestDeletingAnIngredientPictureNeverDeletesAFileAProductStillUses(t *testing.T) {
	env := testkit.Start(t)
	u := env.LoginUser(t)
	id := upload(t, u)
	ing := ingredient(t, u)
	u.Post("/api/products", map[string]any{"name": "Passata", "ingredientId": ing, "packSize": 700, "image": id})
	url := fmt.Sprintf("/api/ingredients/%d", ing)
	u.Patch(url, map[string]any{"image": id})
	u.Patch(url, map[string]any{"image": ""})
	if g := u.Get("/api/images/" + id); g.Status != 200 {
		t.Errorf("the Product's picture file must survive an Ingredient clearing the same id: %d (the Ingredient store must see products.image through refs.Default)", g.Status)
	}
}
