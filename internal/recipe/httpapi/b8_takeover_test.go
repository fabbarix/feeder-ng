package httpapi_test

import (
	"encoding/json"
	"net/http/httptest"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/recipe"
	"github.com/fabbarix/feeder-ng/internal/recipe/httpapi"
)

// beta.8, base team (docs/dev/design/b8-base.md section 1): the 409 base_recipe_take_over carries keptLines, the count the Import
// Review's Confirm gives (recipe.TakeOverError.KeptLines int). The Recipe editor's ask leaves it 0; the field is always there.

func takeOverBody(t *testing.T, ask *recipe.TakeOverError) map[string]any {
	t.Helper()
	rec := httptest.NewRecorder()
	httpapi.WriteTakeOver(rec, ask)
	if rec.Code != 409 {
		t.Fatalf("status %d, want 409", rec.Code)
	}
	var body struct {
		Error map[string]any `json:"error"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	return body.Error
}

func TestTheTakeOverAskCarriesKeptLines(t *testing.T) {
	ask := &recipe.TakeOverError{Ingredient: recipe.IngredientRef{ID: 5, Name: "béchamel"}, Convertible: true, KeptLines: 3}
	if got := takeOverBody(t, ask)["keptLines"]; got != float64(3) {
		t.Errorf("keptLines = %v, want 3", got)
	}
}

func TestTheTakeOverAskAlwaysHasKeptLines(t *testing.T) {
	ask := &recipe.TakeOverError{Ingredient: recipe.IngredientRef{ID: 5, Name: "béchamel"}, Convertible: true}
	if got, has := takeOverBody(t, ask)["keptLines"]; !has || got != float64(0) {
		t.Errorf("keptLines = %v (present %v), want 0 and present", got, has)
	}
}
