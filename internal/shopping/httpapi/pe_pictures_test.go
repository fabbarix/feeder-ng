package httpapi_test

import (
	"fmt"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/testkit"
)

// PE: Shopping List lines and Ingredient extras carry the Ingredient's Picture URL (docs/dev/design/pe-pictures-everywhere.md).
// `imageUrl` is always sent: "/api/images/<id>" or "".

const peImage = "0123456789abcdef0123456789abcdef"

type peLine struct {
	Name     string  `json:"name"`
	ImageURL *string `json:"imageUrl"`
}

func TestShoppingLinesAndExtrasCarryTheIngredientPicture(t *testing.T) {
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	rice := seedIngredient(t, env, "rice", "g")
	salt := seedIngredient(t, env, "salt", "g")
	milk := seedIngredient(t, env, "milk", "ml")
	for _, id := range []int64{rice, milk} {
		if _, err := env.DB.Exec(`UPDATE ingredients SET image = ? WHERE id = ?`, peImage, id); err != nil {
			t.Fatal(err)
		}
	}
	var member, slot, recipe struct {
		ID int64 `json:"id"`
	}
	admin.Post("/api/members", map[string]any{"name": "Anna", "colour": "#3366cc", "portionFactor": 1}).MustJSON(t, &member)
	admin.Post("/api/meal-slots", map[string]any{"weekday": 1, "name": "Dinner", "time": "19:00", "attendance": []map[string]any{{"memberId": member.ID}}}).MustJSON(t, &slot)
	r := admin.Post("/api/recipes", map[string]any{"name": "Rice and salt", "yield": 2, "tags": []string{}, "lines": []map[string]any{
		{"ingredientId": rice, "quantity": 400, "unit": "g"}, {"ingredientId": salt, "quantity": 5, "unit": "g"}}})
	r.MustJSON(t, &recipe)
	if recipe.ID == 0 || slot.ID == 0 {
		t.Fatalf("setup: recipe %d %s, slot %d", r.Status, r.Body, slot.ID)
	}
	if p := admin.Put(fmt.Sprintf("/api/plan/2026-11-09/%d", slot.ID), map[string]any{"recipeId": recipe.ID, "batches": 1}); p.Status != 200 {
		t.Fatalf("pin = %d %s", p.Status, p.Body)
	}
	if x := admin.Post("/api/shopping/extras", map[string]any{"ingredientId": milk, "quantity": 1000}); x.Status != 201 {
		t.Fatalf("extra = %d %s", x.Status, x.Body)
	}
	var list struct {
		Lines  []peLine `json:"lines"`
		Extras []peLine `json:"extras"`
	}
	for deadline := time.Now().Add(3 * time.Second); time.Now().Before(deadline) && len(list.Lines) < 2; time.Sleep(30 * time.Millisecond) {
		admin.Get("/api/shopping/list").MustJSON(t, &list)
	}
	if len(list.Lines) != 2 || len(list.Extras) != 1 {
		t.Fatalf("list = %+v", list)
	}
	want := map[string]string{"rice": "/api/images/" + peImage, "salt": ""}
	for _, l := range list.Lines {
		if l.ImageURL == nil || *l.ImageURL != want[l.Name] {
			t.Errorf("line %q imageUrl = %v, want %q (always present)", l.Name, l.ImageURL, want[l.Name])
		}
	}
	if e := list.Extras[0]; e.ImageURL == nil || *e.ImageURL != "/api/images/"+peImage {
		t.Errorf("extra imageUrl = %v", e.ImageURL)
	}
}
