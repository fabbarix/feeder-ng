package httpapi

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/recipe/store"
)

// R14b: a lost Ready Meal name race reaches the client as 409 name_taken, also when wrapped.
func TestWriteErrReadyMealNameTaken(t *testing.T) {
	rec := httptest.NewRecorder()
	writeErr(rec, fmt.Errorf("create: %w", store.ErrReadyMealNameTaken))
	if rec.Code != http.StatusConflict {
		t.Fatalf("status = %d, want 409", rec.Code)
	}
	var body struct {
		Error struct{ Code string }
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body.Error.Code != "name_taken" {
		t.Fatalf("code = %q, want name_taken", body.Error.Code)
	}
}
