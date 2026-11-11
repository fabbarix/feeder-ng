package httpapi_test

import (
	"fmt"
	"strings"
	"testing"
)

// PE: a scan names the Ingredient with its Picture too, so the feedback can fall back to it when the Product has none
// (docs/dev/design/pe-pictures-everywhere.md). `scan.ingredientImageUrl` is omitted when the Ingredient has no Picture;
// offline data carries `ingredientImageUrl` on each Product the same way.

const peIngredientImage = "0123456789abcdef0123456789abcdef"

func (f fixture) pictureTheIngredient(t *testing.T) {
	t.Helper()
	if _, err := f.env.DB.Exec(`UPDATE ingredients SET image = ? WHERE id = ?`, peIngredientImage, f.ingr); err != nil {
		t.Fatal(err)
	}
}

func TestAScanCarriesTheIngredientPicture(t *testing.T) {
	f := newFixture(t)
	f.pictureTheIngredient(t)
	var res struct {
		Scan struct {
			ProductImageURL    string `json:"productImageUrl"`
			IngredientImageURL string `json:"ingredientImageUrl"`
		} `json:"scan"`
	}
	f.user.Post("/api/scan", f.op("scan-0001")).MustJSON(t, &res)
	if res.Scan.IngredientImageURL != "/api/images/"+peIngredientImage || res.Scan.ProductImageURL != "" {
		t.Errorf("scan = %+v; the Ingredient's Picture is sent beside the (absent) Product's", res.Scan)
	}
}

func TestAScanOfAnIngredientWithoutAPictureHasNoIngredientPictureKey(t *testing.T) {
	f := newFixture(t)
	r := f.user.Post("/api/scan", f.op("scan-0001"))
	if r.Status != 200 || strings.Contains(string(r.Body), "ingredientImageUrl") {
		t.Errorf("scan = %d %s", r.Status, r.Body)
	}
}

func TestThePhonesOfflineDataCarriesTheIngredientPictures(t *testing.T) {
	f := newFixture(t)
	f.pictureTheIngredient(t)
	var data struct {
		Products []struct {
			IngredientImageURL string `json:"ingredientImageUrl"`
		} `json:"products"`
	}
	f.user.Get(fmt.Sprintf("/api/scan/offline?shop=%d", f.shop)).MustJSON(t, &data)
	if len(data.Products) != 1 || data.Products[0].IngredientImageURL != "/api/images/"+peIngredientImage {
		t.Errorf("offline data = %+v", data)
	}
}
