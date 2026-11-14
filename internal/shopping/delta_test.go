package shopping_test

import (
	"testing"

	"github.com/fabbarix/feeder-ng/internal/shopping"
)

// B9-23, extra 1 (PC-01 "What changed"): shopping.Diff(before, after) lists the Lines a plan change added to the Shopping
// List and removed from it. The plan side (B9-11, internal/plan) derives the list before and after the write with
// shopping/service.Service.Snapshot and puts the Delta in the write's `shoppingDelta {added, removed}`.

func dl(ing int64, name string, q float64) shopping.Line {
	return shopping.Line{IngredientID: ing, Name: name, BaseUnit: "g", Quantity: q, Need: q}
}

func ids(ls []shopping.DeltaLine) []int64 {
	out := []int64{}
	for _, l := range ls {
		out = append(out, l.IngredientID)
	}
	return out
}

func sameIDs(a, b []int64) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

func TestDiffListsTheLinesAddedAndRemoved(t *testing.T) {
	before := shopping.List{Lines: []shopping.Line{dl(rice, "rice", 400), dl(milk, "milk", 1000)}}
	after := shopping.List{Lines: []shopping.Line{dl(milk, "milk", 1000), dl(chicken, "chicken thighs", 800), dl(passata, "Passata", 700)}}
	d := shopping.Diff(before, after)
	if got := ids(d.Added); !sameIDs(got, []int64{chicken, passata}) {
		t.Errorf("Added = %v, want chicken thighs then Passata (by name)", got)
	}
	if got := ids(d.Removed); !sameIDs(got, []int64{rice}) {
		t.Errorf("Removed = %v, want rice", got)
	}
	if len(d.Added) == 2 {
		if a := d.Added[0]; a.Name != "chicken thighs" || a.BaseUnit != "g" || a.Quantity != 800 {
			t.Errorf("Added[0] = %+v, want name, Base Unit and the quantity to buy", a)
		}
	}
	if len(d.Removed) == 1 && d.Removed[0].Quantity != 400 {
		t.Errorf("Removed[0].Quantity = %v, want 400 (what it was)", d.Removed[0].Quantity)
	}
}

func TestDiffIgnoresAChangedAmountAndALineThatGotTicked(t *testing.T) {
	ticked := dl(milk, "milk", 0)
	ticked.Ticked = true
	before := shopping.List{Lines: []shopping.Line{dl(rice, "rice", 400), dl(milk, "milk", 1000)}}
	after := shopping.List{Lines: []shopping.Line{dl(rice, "rice", 900), ticked}}
	if d := shopping.Diff(before, after); len(d.Added) != 0 || len(d.Removed) != 0 {
		t.Errorf("Delta = %+v, want none: PC-01's Review lists Lines added and removed only", d)
	}
}

func TestDiffIgnoresExtrasAndNotNeededLines(t *testing.T) {
	before := shopping.List{Lines: []shopping.Line{dl(rice, "rice", 400)}}
	after := shopping.List{
		Lines:     []shopping.Line{},
		NotNeeded: []shopping.Line{dl(rice, "rice", 400)}, // the User took it off: not the plan's doing
		Extras:    []shopping.ExtraLine{{ID: 1, IngredientID: milk, Name: "milk"}},
	}
	d := shopping.Diff(before, after)
	if len(d.Added) != 0 {
		t.Errorf("Added = %v, want none: extras are not plan lines", ids(d.Added))
	}
	if got := ids(d.Removed); !sameIDs(got, []int64{rice}) {
		t.Errorf("Removed = %v, want rice: a Line that left the Lines left the list (Not needed is judged by the caller)", got)
	}
}

func TestDiffOfTwoEqualListsIsEmpty(t *testing.T) {
	l := shopping.List{Lines: []shopping.Line{dl(rice, "rice", 400)}}
	if d := shopping.Diff(l, l); len(d.Added)+len(d.Removed) != 0 {
		t.Errorf("Delta = %+v, want empty", d)
	}
	if d := shopping.Diff(shopping.List{}, shopping.List{}); len(d.Added)+len(d.Removed) != 0 {
		t.Errorf("Delta of two empty lists = %+v", d)
	}
}

func TestDiffOrdersByNameThenId(t *testing.T) {
	after := shopping.List{Lines: []shopping.Line{dl(passata, "passata", 1), dl(chicken, "Chicken", 1), dl(rice, "chicken", 1)}}
	d := shopping.Diff(shopping.List{}, after)
	// "Chicken" (id 1) and "chicken" (id 4) are the same name ignoring case: lower id first.
	if got := ids(d.Added); !sameIDs(got, []int64{chicken, rice, passata}) {
		t.Errorf("Added order = %v, want case-insensitive name, then id", got)
	}
}
