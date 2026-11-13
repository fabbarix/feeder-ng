package recipefile_test

import (
	"errors"
	"strings"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/ingredient"
	"github.com/fabbarix/feeder-ng/internal/recipefile"
)

// H3 (ADR 0017, docs/dev/design/household-items.md §2 guard 7, §4.9): Import Review matches food only. A name a Supply
// holds is a row the User must resolve (status "supply", Problem code "supply_name_taken", "<name> is one of your
// Supplies"): pick another Ingredient or rename. It is never an exact match, never a suggestion, never a target.
// Existing.Ingredients carries both kinds; the review reads Ingredient.IsSupply().

const codeSupplyNameTaken = "supply_name_taken"

func supplyIng(id int64, name, base string) ingredientT {
	i := ing(id, name, base)
	i.Kind = ingredient.KindSupply
	return i
}

func problemAt(p recipefile.Plan, code string) *recipefile.Problem {
	for i := range p.Problems {
		if p.Problems[i].Code == code {
			return &p.Problems[i]
		}
	}
	return nil
}

func TestANameASupplyHoldsIsNeverAnExactMatchAndBlocksConfirm(t *testing.T) {
	ex := recipefile.Existing{Ingredients: []ingredientT{supplyIng(7, "  Red   Pepper ", "piece")}}
	p := plan(t, exampleFile(t), ex, recipefile.Decisions{})
	m := matchOf(t, p, "red pepper")
	if m.Status != recipefile.StatusSupply || recipefile.StatusSupply != "supply" {
		t.Fatalf("status = %q, want %q", m.Status, "supply")
	}
	if m.Match != nil || m.Resolved || m.Effective != nil && m.Effective.Action == recipefile.ActionUse {
		t.Fatalf("row = %+v: a Supply is never matched, and the row is not resolved by itself", m)
	}
	if len(m.Suggestions) != 0 {
		t.Fatalf("suggestions = %+v: a Supply is never suggested", m.Suggestions)
	}
	if p.Ready {
		t.Fatal("a name a Supply holds blocks Confirm")
	}
	pb := problemAt(p, codeSupplyNameTaken)
	if pb == nil || !strings.Contains(pb.Message, "is one of your Supplies") || !strings.Contains(strings.ToLower(pb.Message), "red pepper") {
		t.Fatalf("problems = %+v, want %q naming the Ingredient and saying it is one of your Supplies", p.Problems, codeSupplyNameTaken)
	}
	if len(m.UsedBy) == 0 || pb.Path != m.UsedBy[0] {
		t.Fatalf("problem path = %q, want the first line that uses it (%v)", pb.Path, m.UsedBy)
	}
	if _, err := recipefile.BuildCommit(exampleFile(t), ex, recipefile.Decisions{}, noImages); !errors.Is(err, recipefile.ErrNotReady) {
		t.Fatalf("BuildCommit = %v, want ErrNotReady", err)
	}
}

func TestOtherRowsAreUnaffectedByASupply(t *testing.T) {
	ex := recipefile.Existing{Ingredients: []ingredientT{supplyIng(7, "red pepper", "piece")}}
	p := plan(t, exampleFile(t), ex, recipefile.Decisions{})
	if m := matchOf(t, p, "spinach"); m.Status != recipefile.StatusNew || !m.Resolved {
		t.Fatalf("spinach = %+v, want new and resolved", m)
	}
}

func TestARowNamedLikeASupplyIsResolvedByRenamingItNotByCreatingUnderTheSameName(t *testing.T) {
	ex := recipefile.Existing{Ingredients: []ingredientT{supplyIng(7, "red pepper", "piece")}}
	t.Run("create under the same name stays refused", func(t *testing.T) {
		d := recipefile.Decisions{Ingredients: []recipefile.IngredientDecision{{Key: "red pepper", Action: recipefile.ActionCreate}}}
		if p := plan(t, exampleFile(t), ex, d); p.Ready || matchOf(t, p, "red pepper").Resolved {
			t.Fatal("the name is held by a Supply: create without a new name does not resolve")
		}
	})
	t.Run("create under another name resolves it", func(t *testing.T) {
		d := recipefile.Decisions{Ingredients: []recipefile.IngredientDecision{{Key: "red pepper", Action: recipefile.ActionCreate, Name: "red pepper (fresh)"}}}
		p := plan(t, exampleFile(t), ex, d)
		if !p.Ready || !matchOf(t, p, "red pepper").Resolved {
			t.Fatalf("plan = %+v", p)
		}
		c, err := recipefile.BuildCommit(exampleFile(t), ex, d, noImages)
		if err != nil {
			t.Fatal(err)
		}
		var created bool
		for _, n := range c.NewIngredients {
			created = created || n.Key == "red pepper" && n.Input.Name == "red pepper (fresh)" && n.Input.Kind != ingredient.KindSupply
		}
		if !created {
			t.Fatalf("new Ingredients = %+v, want a food Ingredient named red pepper (fresh)", c.NewIngredients)
		}
	})
	t.Run("using the Supply is not a pick", func(t *testing.T) {
		d := recipefile.Decisions{Ingredients: []recipefile.IngredientDecision{{Key: "red pepper", Action: recipefile.ActionUse, IngredientID: 7}}}
		if p := plan(t, exampleFile(t), ex, d); p.Ready || matchOf(t, p, "red pepper").Resolved {
			t.Fatal("a Supply is never a target, even when the User names its id")
		}
	})
	t.Run("using a food Ingredient instead is a pick", func(t *testing.T) {
		ex := recipefile.Existing{Ingredients: []ingredientT{supplyIng(7, "red pepper", "piece"), ing(8, "capsicum", "piece")}}
		d := recipefile.Decisions{Ingredients: []recipefile.IngredientDecision{{Key: "red pepper", Action: recipefile.ActionUse, IngredientID: 8}}}
		p := plan(t, exampleFile(t), ex, d)
		if m := matchOf(t, p, "red pepper"); !m.Resolved || m.Effective == nil || m.Effective.IngredientID != 8 {
			t.Fatalf("row = %+v, want it resolved on the food Ingredient 8", m)
		}
	})
}

func TestFuzzySuggestionsNeverOfferASupply(t *testing.T) {
	// "chicken thighs" is close to the food "chicken thigh" (suggested, see TestFuzzyMatchOffersSuggestions...) and to a Supply
	// of the same name: only the food is offered.
	ex := recipefile.Existing{Ingredients: []ingredientT{supplyIng(3, "chicken thigh", "g")}}
	p := plan(t, exampleFile(t), ex, recipefile.Decisions{})
	m := matchOf(t, p, "chicken thighs")
	if m.Status != recipefile.StatusNew || len(m.Suggestions) != 0 {
		t.Fatalf("row = %+v, want new with no suggestion: the only close name is a Supply", m)
	}
	ex.Ingredients = append(ex.Ingredients, ing(4, "chicken thigh fillet", "g"))
	p = plan(t, exampleFile(t), ex, recipefile.Decisions{})
	for _, s := range matchOf(t, p, "chicken thighs").Suggestions {
		if s.ID == 3 {
			t.Fatalf("suggestions = %+v: the Supply 3 is offered", s)
		}
	}
}

func TestAReadyMealsPackNamedLikeASupplyIsNotReusedNorCreated(t *testing.T) {
	f := recipefile.File{
		Format: recipefile.Format, Version: recipefile.Version,
		Recipes: []recipefile.Recipe{{
			Name: "Lasagne pack", Yield: 2, ReadyMeal: true,
			Ingredients: []recipefile.Line{{Ingredient: "lasagne pack", Quantity: 1, Unit: "piece"}},
		}},
	}
	ex := recipefile.Existing{Ingredients: []ingredientT{supplyIng(9, "Lasagne pack", "piece")}}
	p := plan(t, f, ex, recipefile.Decisions{})
	if m := matchOf(t, p, "lasagne pack"); m.Status != recipefile.StatusSupply || m.Match != nil || m.Resolved {
		t.Fatalf("row = %+v, want status supply, no match, unresolved", m)
	}
	if p.Ready || problemAt(p, codeSupplyNameTaken) == nil {
		t.Fatalf("plan = %+v, want not ready with %s", p, codeSupplyNameTaken)
	}
}

func TestAFoodIngredientOfTheSameNameStillMatchesExactly(t *testing.T) {
	ex := recipefile.Existing{Ingredients: []ingredientT{ing(7, "red pepper", "piece")}}
	if m := matchOf(t, plan(t, exampleFile(t), ex, recipefile.Decisions{}), "red pepper"); m.Status != recipefile.StatusExact {
		t.Fatalf("status = %q, want exact", m.Status)
	}
}

func TestABaseRecipeNamedLikeASupplyIsAProblemNeverATakeOver(t *testing.T) {
	// The store refuses it (supply_name_taken on Apply); the review says so first, so Confirm is never offered.
	yes := true
	f := recipefile.File{
		Format: recipefile.Format, Version: recipefile.Version,
		Recipes: []recipefile.Recipe{{Name: "Dish soap", Yield: 1, BaseRecipe: &yes, YieldUnit: "l",
			Ingredients: []recipefile.Line{{Ingredient: "milk", Quantity: 1, Unit: "l"}}}},
	}
	ex := recipefile.Existing{Ingredients: []ingredientT{supplyIng(7, "dish  Soap", "ml"), ing(8, "milk", "ml")}}
	p := plan(t, f, ex, recipefile.Decisions{})
	if p.Ready || len(p.TakeOvers) != 0 {
		t.Fatalf("ready = %v, take-overs = %+v: want not ready and no take-over ask for a Supply", p.Ready, p.TakeOvers)
	}
	pb := problemAt(p, codeSupplyNameTaken)
	if pb == nil || pb.Path != "$.recipes[0]" || !strings.Contains(pb.Message, "Dish soap is one of your Supplies") {
		t.Fatalf("problems = %+v, want %s at $.recipes[0]", p.Problems, codeSupplyNameTaken)
	}
	skip := recipefile.Decisions{Recipes: []recipefile.RecipeDecision{{Index: 0, Action: recipefile.ActionSkip}}}
	if p := plan(t, f, ex, skip); problemAt(p, codeSupplyNameTaken) != nil {
		t.Fatalf("problems = %+v: skipping the Recipe resolves it", p.Problems)
	}
}
