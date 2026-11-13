package httpapi

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/recipe"
)

// BR-C commit half, round 5: the answer to an Apply that fails inside the Base recipe lifecycle. A late
// *recipe.TakeOverError cannot be provoked deterministically over HTTP (BuildCommit reads the data just before Apply,
// so the ask is caught as an open take-over ask unless a plain Ingredient of that name appears in between), so the
// mapping is pinned where it lives:
//
//	func writeApplyError(w http.ResponseWriter, err error)
//
// It maps what store.Apply returns for a confirm and writes the response; any other error goes through
// httpx.WriteAPIError as before. errors.As is used, so a wrapped error maps too.
//
//	*recipe.CycleError     -> 422 { error: { code: "base_recipe_cycle", message, path: [names] } }
//	*recipe.TakeOverError  -> 409 { error: { code: "base_recipe_take_over", message, ingredient: {id, name}, recipes: [{id, name, archived}], stockLots, convertible } }
//
// The TakeOverError status and shape are the Recipe API's own (internal/recipe/httpapi writeErr), so the web handles
// them once. In both cases confirm leaves the Review open (`done` stays false) and nothing is written.

type applyErrorBody struct {
	Error struct {
		Code       string   `json:"code"`
		Message    string   `json:"message"`
		Path       []string `json:"path"`
		Ingredient struct {
			ID   int64  `json:"id"`
			Name string `json:"name"`
		} `json:"ingredient"`
		Recipes []struct {
			ID       int64  `json:"id"`
			Name     string `json:"name"`
			Archived bool   `json:"archived"`
		} `json:"recipes"`
		StockLots   int  `json:"stockLots"`
		Convertible bool `json:"convertible"`
	} `json:"error"`
}

func applyError(t *testing.T, err error) (int, applyErrorBody) {
	t.Helper()
	rec := httptest.NewRecorder()
	writeApplyError(rec, err)
	var b applyErrorBody
	if jerr := json.Unmarshal(rec.Body.Bytes(), &b); jerr != nil {
		t.Fatalf("body %q is not JSON: %v", rec.Body.String(), jerr)
	}
	return rec.Code, b
}

func TestApplyCycleErrorIs422BaseRecipeCycleWithThePath(t *testing.T) {
	path := []string{"Roux", "Béchamel", "Roux"}
	for name, err := range map[string]error{
		"direct":  &recipe.CycleError{Field: "lines[1]", Path: path},
		"wrapped": fmt.Errorf("write Roux: %w", &recipe.CycleError{Field: "lines[1]", Path: path}),
	} {
		status, b := applyError(t, err)
		if status != http.StatusUnprocessableEntity || b.Error.Code != "base_recipe_cycle" {
			t.Errorf("%s: %d %+v, want 422 base_recipe_cycle", name, status, b.Error)
		}
		if fmt.Sprint(b.Error.Path) != fmt.Sprint(path) {
			t.Errorf("%s: path = %v, want %v", name, b.Error.Path, path)
		}
		if b.Error.Message == "" {
			t.Errorf("%s: no message", name)
		}
	}
}

func TestApplyTakeOverErrorIs409WithTheRecipeAPIsShape(t *testing.T) {
	ask := &recipe.TakeOverError{
		Ingredient:  recipe.IngredientRef{ID: 7, Name: "béchamel"},
		Recipes:     []recipe.Ref{{ID: 3, Name: "Moussaka"}, {ID: 4, Name: "Lasagne", Archived: true}},
		StockLots:   2,
		Convertible: true,
	}
	for name, err := range map[string]error{"direct": ask, "wrapped": fmt.Errorf("write Béchamel: %w", ask)} {
		status, b := applyError(t, err)
		if status != http.StatusConflict || b.Error.Code != "base_recipe_take_over" {
			t.Fatalf("%s: %d %+v, want 409 base_recipe_take_over", name, status, b.Error)
		}
		if b.Error.Ingredient.ID != 7 || b.Error.Ingredient.Name != "béchamel" || b.Error.StockLots != 2 || !b.Error.Convertible {
			t.Errorf("%s: %+v", name, b.Error)
		}
		if len(b.Error.Recipes) != 2 || b.Error.Recipes[0].Name != "Moussaka" || !b.Error.Recipes[1].Archived {
			t.Errorf("%s: recipes = %+v, want Moussaka and the archived Lasagne", name, b.Error.Recipes)
		}
	}
}

func TestApplyKeepsTheOtherMappingsAndAnUnknownErrorIsStillA500(t *testing.T) {
	if status, _ := applyError(t, errors.New("boom")); status != http.StatusInternalServerError {
		t.Errorf("unknown error = %d, want 500", status)
	}
}
