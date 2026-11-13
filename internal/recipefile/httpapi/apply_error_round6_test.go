package httpapi

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/recipe"
)

// BR-C commit half, round 6: a late "this Recipe is already a Base recipe" from Apply (two converts racing, or a Recipe
// turned into a Base recipe after the review) is a *recipe.ValidationError. Confirm answers it as the Recipe API does:
// 422 { error: { code: "validation_failed", message, field: "baseRecipe", reason: "base_recipe_kind" } }, never a 500.
func TestApplyAlreadyABaseRecipeIsA422LikeTheRecipeAPI(t *testing.T) {
	ve := &recipe.ValidationError{Field: "baseRecipe", Code: recipe.CodeBaseRecipeKind, Message: "this Recipe is already a Base recipe"}
	for name, err := range map[string]error{"direct": ve, "wrapped": fmt.Errorf("convert Pesto: %w", ve)} {
		rec := recorderFor(t, err)
		if rec.Code != http.StatusUnprocessableEntity {
			t.Fatalf("%s: status = %d, want 422: %s", name, rec.Code, rec.Body)
		}
		var b struct {
			Error struct{ Code, Message, Field, Reason string }
		}
		decode(t, rec, &b)
		if b.Error.Code != "validation_failed" || b.Error.Field != "baseRecipe" || b.Error.Reason != "base_recipe_kind" || b.Error.Message == "" {
			t.Errorf("%s: %+v", name, b.Error)
		}
	}
}

func recorderFor(t *testing.T, err error) *httptest.ResponseRecorder {
	t.Helper()
	rec := httptest.NewRecorder()
	writeApplyError(rec, err)
	return rec
}

func decode(t *testing.T, rec *httptest.ResponseRecorder, v any) {
	t.Helper()
	if err := json.Unmarshal(rec.Body.Bytes(), v); err != nil {
		t.Fatalf("body %q: %v", rec.Body, err)
	}
}
