package runner_test

import (
	"context"
	"database/sql"
	"errors"
	"reflect"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/plan"
	"github.com/fabbarix/feeder-ng/internal/plan/plantest"
	"github.com/fabbarix/feeder-ng/internal/plan/runner"
	"github.com/fabbarix/feeder-ng/internal/planner"
)

// Used from in the runner (ADR 0011, docs/dev/design/b5-ufr.md). The Stock port is a fake that also implements the
// optional runner.PickedDeducter and runner.CookPreviewer; the plan store is the real one.

// pickedStock is the fakeStock plus the picked deduction and the preview.
type pickedStock struct {
	*fakeStock
	picked      [][]runner.CookedMeal
	pickedInTx  []bool
	pickedWarns []runner.Warning
	refuse      error
	preview     []runner.NeedPreview
	previewed   [][]runner.Need
}

func (p *pickedStock) DeductCookedPickedTx(_ context.Context, tx *sql.Tx, meals []runner.CookedMeal) (runner.Deduction, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.refuse != nil {
		return runner.Deduction{}, p.refuse
	}
	p.picked = append(p.picked, append([]runner.CookedMeal(nil), meals...))
	p.pickedInTx = append(p.pickedInTx, tx != nil)
	return runner.Deduction{Warnings: p.pickedWarns, Handle: "picked"}, nil
}

func (p *pickedStock) PreviewCooked(_ context.Context, needs []runner.Need) ([]runner.NeedPreview, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.previewed = append(p.previewed, append([]runner.Need(nil), needs...))
	return p.preview, nil
}

// ufEnv is the standard env with a pickedStock.
func ufEnv(t *testing.T) (*env, *pickedStock) {
	t.Helper()
	var ps *pickedStock
	e := newEnvWith(t, func(d *runner.Deps) {
		ps = &pickedStock{fakeStock: d.Stock.(*fakeStock)}
		d.Stock = ps
	})
	return e, ps
}

var chickenPick = []runner.UsedFrom{{IngredientID: 11, Picks: []runner.Pick{{LotID: 101, Quantity: 150}, {LotID: 102, Quantity: 250}}}}

func TestCookedWithoutUsedFromKeepsTheDefaultDeduction(t *testing.T) {
	for name, usedFrom := range map[string][]runner.UsedFrom{"absent": nil, "empty": {}} {
		t.Run(name, func(t *testing.T) {
			e, ps := ufEnv(t)
			chickenOnMonday(t, e)
			if _, err := e.r.CookedUsing(ctx, e.key(9), nil, usedFrom); err != nil {
				t.Fatal(err)
			}
			if want := [][]runner.Need{{{IngredientID: 11, Quantity: 400}, {IngredientID: 13, Quantity: 250}}}; !reflect.DeepEqual(e.stock.deductions, want) {
				t.Errorf("deductions = %+v, want the default DeductCookedTx call %+v", e.stock.deductions, want)
			}
			if len(ps.picked) != 0 {
				t.Errorf("the picked deduction was called %d times without picks", len(ps.picked))
			}
		})
	}
}

func TestCookedWithUsedFromDeductsThePickedLotsInTheSameTransaction(t *testing.T) {
	e, ps := ufEnv(t)
	chickenOnMonday(t, e)
	warning := runner.Warning{IngredientID: 13, Name: "rice", BaseUnit: "g", Have: 100, Need: 250, Shortfall: 150, Message: "short"}
	ps.pickedWarns = []runner.Warning{warning}
	events := e.bus.count("plan")

	res, err := e.r.CookedUsing(ctx, e.key(9), nil, chickenPick)
	if err != nil {
		t.Fatal(err)
	}
	want := [][]runner.CookedMeal{{{Needs: []runner.Need{{IngredientID: 11, Quantity: 400}, {IngredientID: 13, Quantity: 250}}, UsedFrom: chickenPick}}}
	if !reflect.DeepEqual(ps.picked, want) {
		t.Errorf("picked deductions = %+v, want one CookedMeal with the Recipe's needs and the picks: %+v", ps.picked, want)
	}
	if len(e.stock.deductions) != 0 {
		t.Errorf("the plain deduction ran as well: %+v", e.stock.deductions)
	}
	if len(ps.pickedInTx) != 1 || !ps.pickedInTx[0] {
		t.Error("the picked deduction must run inside the planning transaction (a non-nil tx)")
	}
	if len(e.stock.published) != 1 {
		t.Errorf("PublishDeduction called %d times, want once, after the commit", len(e.stock.published))
	}
	if !reflect.DeepEqual(res.Warnings, []runner.Warning{warning}) {
		t.Errorf("Warnings = %+v, want the picked deduction's", res.Warnings)
	}
	if res.Meal.State != plan.StateCooked || res.Leftover == nil || e.bus.count("plan") <= events {
		t.Errorf("Cooked = %+v, want the meal Cooked, a Leftover and a plan event", res)
	}
}

func TestCookedRefusesAnInvalidPickAndWritesNothing(t *testing.T) {
	e, ps := ufEnv(t)
	chickenOnMonday(t, e)
	before := e.planMeals()
	published := e.bus.count("plan")
	ps.refuse = runner.ErrUsedFromInvalid
	if _, err := e.r.CookedUsing(ctx, e.key(9), nil, chickenPick); !errors.Is(err, runner.ErrUsedFromInvalid) {
		t.Fatalf("err = %v, want ErrUsedFromInvalid", err)
	}
	if !reflect.DeepEqual(e.planMeals(), before) {
		t.Error("a meal changed although the pick was refused")
	}
	if ls, _ := e.r.Leftovers(ctx); len(ls) != 0 {
		t.Errorf("a Leftover was recorded: %+v", ls)
	}
	if len(e.stock.published) != 0 || e.bus.count("plan") != published {
		t.Error("something was published for a refused Cooked")
	}
}

func TestCookedRefusesPicksOnAMealServedFromALeftover(t *testing.T) {
	e, ps := ufEnv(t)
	chickenOnMonday(t, e)
	if _, err := e.r.Cooked(ctx, e.key(9), nil); err != nil {
		t.Fatal(err)
	}
	e.clk.Set(time.Date(2026, 11, 10, 10, 0, 0, 0, time.UTC)) // Tuesday: the Leftover meal may be Cooked
	before := e.planMeals()
	_, err := e.r.CookedUsing(ctx, e.key(10), nil, chickenPick)
	if !errors.Is(err, runner.ErrUsedFromInvalid) {
		t.Fatalf("err = %v, want ErrUsedFromInvalid (a Leftover meal has no Ingredient lines to pick for)", err)
	}
	if len(ps.picked) != 0 {
		t.Error("the Stock was asked to deduct picks for a Leftover meal")
	}
	if !reflect.DeepEqual(e.planMeals(), before) {
		t.Error("the Leftover meal changed although the pick was refused")
	}
}

func TestCookPreviewListsTheLotsOfEveryNeed(t *testing.T) {
	e, ps := ufEnv(t)
	chickenOnMonday(t, e)
	ps.preview = []runner.NeedPreview{
		{IngredientID: 11, BaseUnit: "g", Lots: []runner.PreviewLot{
			{ID: 102, Quantity: 250, Purchased: "2026-11-05", GoesOff: "2026-11-11", StoragePlaceName: "Garage Fridge"},
			{ID: 101, Quantity: 200, Purchased: "2026-11-01", GoesOff: "", StoragePlaceName: ""}}},
		{IngredientID: 13, BaseUnit: "g"},
	}
	p, err := e.r.CookPreview(ctx, e.key(9))
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(p.Stock, ps.preview) {
		t.Errorf("Stock = %+v, want the Stock port's preview %+v", p.Stock, ps.preview)
	}
	if want := [][]runner.Need{{{IngredientID: 11, Quantity: 400}, {IngredientID: 13, Quantity: 250}}}; !reflect.DeepEqual(ps.previewed, want) {
		t.Errorf("PreviewCooked was asked for %+v, want the Recipe's needs %+v", ps.previewed, want)
	}
}

func TestCookPreviewHasNoLotsWithoutAPreviewingStockOrForALeftoverMeal(t *testing.T) {
	plain := newEnv(t)
	chickenOnMonday(t, plain)
	if p, err := plain.r.CookPreview(ctx, plain.key(9)); err != nil || p.Stock != nil {
		t.Errorf("plain Stock: Stock = %+v, err = %v; want none", p.Stock, err)
	}
	e, ps := ufEnv(t)
	chickenOnMonday(t, e)
	if p, err := e.r.CookPreview(ctx, e.key(10)); err != nil || p.Fresh || p.Stock != nil || len(ps.previewed) != 0 {
		t.Errorf("Leftover meal: Fresh %v Stock %+v err %v previews %d; want no preview", p.Fresh, p.Stock, err, len(ps.previewed))
	}
}

// --- Mark all Cooked: a Main of 400 g chicken and a Side of 100 g beans on Monday ---

func slotWithMainAndSide(t *testing.T) (*cenv, *pickedStock) {
	t.Helper()
	var ps *pickedStock
	base := newEnvWith(t, func(d *runner.Deps) {
		ps = &pickedStock{fakeStock: d.Stock.(*fakeStock)}
		d.Stock = ps
	})
	base.src.recipes = nil
	c := &cenv{env: base}
	c.main = base.main
	c.side = plantest.CourseID(t, base.db, "Side")
	c.oneDay()
	roast := c.recipe("roast", false, c.main)
	beans := c.recipe("beans", false, c.side)
	for i := range c.src.recipes {
		switch int64(c.src.recipes[i].ID) {
		case roast:
			c.src.recipes[i].Needs = []planner.Need{{IngredientID: 11, Quantity: 400}}
		case beans:
			c.src.recipes[i].Needs = []planner.Need{{IngredientID: 12, Quantity: 100}}
		}
	}
	c.serve(cspec{course: c.main}, cspec{course: c.side})
	c.mustPlan()
	if c.mustMeal(9, c.main).State != plan.StatePlanned || c.mustMeal(9, c.side).State != plan.StatePlanned {
		t.Fatal("set-up: a Main and a Side should be planned on Monday")
	}
	return c, ps
}

func TestCookedAllWithoutPicksStaysOneCombinedDeduction(t *testing.T) {
	c, ps := slotWithMainAndSide(t)
	if _, err := c.r.CookedAll(ctx, "2026-11-09", c.slotIDs[1], nil); err != nil {
		t.Fatal(err)
	}
	if want := [][]runner.Need{{{IngredientID: 11, Quantity: 400}, {IngredientID: 12, Quantity: 100}}}; !reflect.DeepEqual(c.stock.deductions, want) {
		t.Errorf("deductions = %+v, want one combined call %+v", c.stock.deductions, want)
	}
	if len(ps.picked) != 0 {
		t.Errorf("the picked deduction was called without picks: %+v", ps.picked)
	}
}

func TestCookedAllPassesEachCoursesPicksInCourseOrder(t *testing.T) {
	c, ps := slotWithMainAndSide(t)
	beanPick := []runner.UsedFrom{{IngredientID: 12, Picks: []runner.Pick{{LotID: 201, Quantity: 100}}}}
	// The request lists the Side first; the Stock still gets the Courses in the slot's order (Main, Side).
	res, err := c.r.CookedAll(ctx, "2026-11-09", c.slotIDs[1], []runner.CourseLeftover{
		{CourseID: c.side, UsedFrom: beanPick},
		{CourseID: c.main, UsedFrom: chickenPick},
	})
	if err != nil {
		t.Fatal(err)
	}
	want := [][]runner.CookedMeal{{
		{Needs: []runner.Need{{IngredientID: 11, Quantity: 400}}, UsedFrom: chickenPick},
		{Needs: []runner.Need{{IngredientID: 12, Quantity: 100}}, UsedFrom: beanPick},
	}}
	if !reflect.DeepEqual(ps.picked, want) {
		t.Errorf("picked deductions = %+v, want one call, one CookedMeal per Course, Main first: %+v", ps.picked, want)
	}
	if len(c.stock.deductions) != 0 {
		t.Errorf("the plain deduction ran as well: %+v", c.stock.deductions)
	}
	if len(c.stock.published) != 1 {
		t.Errorf("PublishDeduction called %d times, want once for the slot", len(c.stock.published))
	}
	if len(res.Meals) != 2 || res.Meals[0].State != plan.StateCooked || res.Meals[1].State != plan.StateCooked {
		t.Errorf("Meals = %+v, want both Courses Cooked", res.Meals)
	}
}

func TestCookedAllWithPicksOnOneCourseGivesTheOtherNoPicks(t *testing.T) {
	c, ps := slotWithMainAndSide(t)
	if _, err := c.r.CookedAll(ctx, "2026-11-09", c.slotIDs[1], []runner.CourseLeftover{{CourseID: c.main, UsedFrom: chickenPick}}); err != nil {
		t.Fatal(err)
	}
	want := [][]runner.CookedMeal{{
		{Needs: []runner.Need{{IngredientID: 11, Quantity: 400}}, UsedFrom: chickenPick},
		{Needs: []runner.Need{{IngredientID: 12, Quantity: 100}}},
	}}
	if !reflect.DeepEqual(ps.picked, want) {
		t.Errorf("picked deductions = %+v, want the Side with its needs and no picks: %+v", ps.picked, want)
	}
}

func TestCookedAllRefusesAnInvalidPickForTheWholeSlot(t *testing.T) {
	c, ps := slotWithMainAndSide(t)
	before := c.planMeals()
	published := c.bus.count("plan")
	ps.refuse = runner.ErrUsedFromInvalid
	_, err := c.r.CookedAll(ctx, "2026-11-09", c.slotIDs[1], []runner.CourseLeftover{{CourseID: c.side, UsedFrom: chickenPick}})
	if !errors.Is(err, runner.ErrUsedFromInvalid) {
		t.Fatalf("err = %v, want ErrUsedFromInvalid", err)
	}
	var ce *runner.CourseError
	if errors.As(err, &ce) {
		t.Errorf("a refused pick is the whole request's, not one Course's: %+v", ce)
	}
	if !reflect.DeepEqual(c.planMeals(), before) {
		t.Error("a meal changed although the pick was refused (all or nothing)")
	}
	if ls, _ := c.r.Leftovers(ctx); len(ls) != 0 {
		t.Errorf("Leftovers recorded: %+v", ls)
	}
	if len(c.stock.published) != 0 || c.bus.count("plan") != published {
		t.Error("something was published for a refused Mark all Cooked")
	}
}
