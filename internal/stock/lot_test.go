package stock

import (
	"errors"
	"math"
	"reflect"
	"testing"
)

func near(a, b float64) bool { return math.Abs(a-b) < 1e-9 }

func ptr(n int) *int { return &n }

func lot(id int64, qty float64, purchased, goesOff Date) Lot {
	return Lot{ID: id, IngredientID: 1, Quantity: qty, Purchased: purchased, GoesOff: goesOff}
}

func TestDateAddDays(t *testing.T) {
	tests := []struct {
		in   Date
		n    int
		want Date
	}{
		{"2026-11-09", 3, "2026-11-12"},
		{"2026-11-30", 1, "2026-12-01"},
		{"2026-12-31", 1, "2027-01-01"},
		{"2028-02-28", 1, "2028-02-29"},
		{"2027-02-28", 1, "2027-03-01"},
		{"2026-11-09", 0, "2026-11-09"},
		{"2026-11-09", -9, "2026-10-31"},
	}
	for _, tc := range tests {
		if got := tc.in.AddDays(tc.n); got != tc.want {
			t.Errorf("%s.AddDays(%d) = %s, want %s", tc.in, tc.n, got, tc.want)
		}
	}
	if !None.IsNone() || Date("2026-11-09").IsNone() {
		t.Error("IsNone wrong")
	}
}

func TestNewLot(t *testing.T) {
	l := NewLot(7, 3, 800, "2026-11-09", ptr(3))
	want := Lot{ID: 7, IngredientID: 3, Quantity: 800, Purchased: "2026-11-09", GoesOff: "2026-11-12"}
	if l != want {
		t.Errorf("NewLot = %+v, want %+v", l, want)
	}
	if l := NewLot(1, 1, 500, "2026-11-09", nil); l.GoesOff != None {
		t.Errorf("no Shelf Life: GoesOff = %q, want none", l.GoesOff)
	}
	if l := NewLot(1, 1, 500, "2026-11-09", ptr(0)); l.GoesOff != "2026-11-09" {
		t.Errorf("0-day Shelf Life: GoesOff = %q, want the purchase date", l.GoesOff)
	}
}

func TestDeduct(t *testing.T) {
	tests := []struct {
		name         string
		lots         []Lot
		need         float64
		wantLots     []Lot
		wantTaken    []Taken
		wantShortfal float64
	}{
		{
			name:      "partial take from a single lot",
			lots:      []Lot{lot(1, 1000, "2026-11-01", "2026-11-10")},
			need:      800,
			wantLots:  []Lot{lot(1, 200, "2026-11-01", "2026-11-10")},
			wantTaken: []Taken{{1, 800}},
		},
		{
			name:      "lot that goes off soonest is used first",
			lots:      []Lot{lot(1, 500, "2026-11-01", "2026-11-12"), lot(2, 500, "2026-11-05", "2026-11-10")},
			need:      600,
			wantLots:  []Lot{lot(1, 400, "2026-11-01", "2026-11-12")},
			wantTaken: []Taken{{2, 500}, {1, 100}},
		},
		{
			name:      "same go-off date: oldest purchase first",
			lots:      []Lot{lot(1, 500, "2026-11-05", "2026-11-12"), lot(2, 500, "2026-11-01", "2026-11-12")},
			need:      200,
			wantLots:  []Lot{lot(1, 500, "2026-11-05", "2026-11-12"), lot(2, 300, "2026-11-01", "2026-11-12")},
			wantTaken: []Taken{{2, 200}},
		},
		{
			name:      "lots that go off come before lots that do not, even if older",
			lots:      []Lot{lot(1, 500, "2026-10-01", None), lot(2, 500, "2026-11-08", "2026-11-20")},
			need:      100,
			wantLots:  []Lot{lot(1, 500, "2026-10-01", None), lot(2, 400, "2026-11-08", "2026-11-20")},
			wantTaken: []Taken{{2, 100}},
		},
		{
			name:      "lots without a go-off date: oldest first",
			lots:      []Lot{lot(1, 500, "2026-11-05", None), lot(2, 500, "2026-11-01", None)},
			need:      700,
			wantLots:  []Lot{lot(1, 300, "2026-11-05", None)},
			wantTaken: []Taken{{2, 500}, {1, 200}},
		},
		{
			name:      "same go-off and purchase date: lowest ID first",
			lots:      []Lot{lot(5, 100, "2026-11-01", "2026-11-10"), lot(3, 100, "2026-11-01", "2026-11-10")},
			need:      50,
			wantLots:  []Lot{lot(5, 100, "2026-11-01", "2026-11-10"), lot(3, 50, "2026-11-01", "2026-11-10")},
			wantTaken: []Taken{{3, 50}},
		},
		{
			name:         "spec example: only 300 g in Stock, recipe uses 800 g",
			lots:         []Lot{lot(1, 300, "2026-11-07", "2026-11-10")},
			need:         800,
			wantLots:     nil,
			wantTaken:    []Taken{{1, 300}},
			wantShortfal: 500,
		},
		{
			name:         "shortfall across several lots",
			lots:         []Lot{lot(1, 100, "2026-11-01", "2026-11-10"), lot(2, 150, "2026-11-02", "2026-11-11")},
			need:         400,
			wantLots:     nil,
			wantTaken:    []Taken{{1, 100}, {2, 150}},
			wantShortfal: 150,
		},
		{
			name:         "no Stock at all",
			lots:         nil,
			need:         800,
			wantShortfal: 800,
		},
		{
			name:     "need exactly equals Stock empties the lot",
			lots:     []Lot{lot(1, 800, "2026-11-01", None)},
			need:     800,
			wantLots: nil, wantTaken: []Taken{{1, 800}},
		},
		{
			name:     "zero need changes nothing",
			lots:     []Lot{lot(1, 800, "2026-11-01", None)},
			need:     0,
			wantLots: []Lot{lot(1, 800, "2026-11-01", None)},
		},
		{
			name:     "negative need changes nothing",
			lots:     []Lot{lot(1, 800, "2026-11-01", None)},
			need:     -5,
			wantLots: []Lot{lot(1, 800, "2026-11-01", None)},
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := Deduct(tc.lots, tc.need)
			if len(got.Lots) != len(tc.wantLots) || (len(tc.wantLots) > 0 && !reflect.DeepEqual(got.Lots, tc.wantLots)) {
				t.Errorf("Lots = %+v, want %+v", got.Lots, tc.wantLots)
			}
			if len(got.Taken) != len(tc.wantTaken) || (len(tc.wantTaken) > 0 && !reflect.DeepEqual(got.Taken, tc.wantTaken)) {
				t.Errorf("Taken = %+v, want %+v", got.Taken, tc.wantTaken)
			}
			if !near(got.Shortfall, tc.wantShortfal) {
				t.Errorf("Shortfall = %v, want %v", got.Shortfall, tc.wantShortfal)
			}
		})
	}
}

func TestDeductDoesNotModifyInput(t *testing.T) {
	lots := []Lot{lot(1, 500, "2026-11-01", "2026-11-12"), lot(2, 500, "2026-11-05", "2026-11-10")}
	before := append([]Lot(nil), lots...)
	Deduct(lots, 700)
	if !reflect.DeepEqual(lots, before) {
		t.Errorf("Deduct modified its input: %+v", lots)
	}
}

func TestCookedNeeds(t *testing.T) {
	// Tikka traybake, one Batch, quantities already in Base Units.
	lines := []Line{
		{IngredientID: 1, Quantity: 800},                // chicken thighs
		{IngredientID: 2, Quantity: 250},                // greek yogurt
		{IngredientID: 3, Quantity: 20, Optional: true}, // optional garnish
	}
	tests := []struct {
		name    string
		batches float64
		lines   []Line
		want    []Need
	}{
		{"one batch, optional line excluded", 1, lines, []Need{{1, 800}, {2, 250}}},
		{"two batches", 2, lines, []Need{{1, 1600}, {2, 500}}},
		{"fractional batches", 0.5, lines, []Need{{1, 400}, {2, 125}}},
		{
			"lines of the same ingredient are summed, first-appearance order",
			2,
			[]Line{{IngredientID: 4, Quantity: 10}, {IngredientID: 5, Quantity: 1}, {IngredientID: 4, Quantity: 5}},
			[]Need{{4, 30}, {5, 2}},
		},
		{"only optional lines", 1, []Line{{IngredientID: 3, Quantity: 20, Optional: true}}, nil},
		{"zero batches", 0, lines, nil},
		{"no lines", 2, nil, nil},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := CookedNeeds(tc.batches, tc.lines)
			if len(got) != len(tc.want) {
				t.Fatalf("CookedNeeds = %+v, want %+v", got, tc.want)
			}
			for i := range got {
				if got[i].IngredientID != tc.want[i].IngredientID || !near(got[i].Quantity, tc.want[i].Quantity) {
					t.Errorf("need %d = %+v, want %+v", i, got[i], tc.want[i])
				}
			}
		})
	}
}

func TestSetTotal(t *testing.T) {
	a := lot(1, 300, "2026-11-01", "2026-11-10")
	b := lot(2, 500, "2026-11-02", "2026-11-12")
	today := Date("2026-11-09")

	t.Run("decrease removes from the soonest-to-spoil lot first", func(t *testing.T) {
		got, err := SetTotal([]Lot{b, a}, 1, 600, today, ptr(3))
		if err != nil {
			t.Fatal(err)
		}
		want := []Lot{b, lot(1, 100, "2026-11-01", "2026-11-10")}
		if !reflect.DeepEqual(got.Lots, want) {
			t.Errorf("Lots = %+v, want %+v", got.Lots, want)
		}
		if !reflect.DeepEqual(got.Removed, []Taken{{1, 200}}) {
			t.Errorf("Removed = %+v", got.Removed)
		}
		if got.Added != nil {
			t.Errorf("Added = %+v, want nil", got.Added)
		}
	})
	t.Run("decrease spanning lots", func(t *testing.T) {
		got, err := SetTotal([]Lot{a, b}, 1, 450, today, nil)
		if err != nil {
			t.Fatal(err)
		}
		want := []Lot{lot(2, 450, "2026-11-02", "2026-11-12")}
		if !reflect.DeepEqual(got.Lots, want) {
			t.Errorf("Lots = %+v, want %+v", got.Lots, want)
		}
		if !reflect.DeepEqual(got.Removed, []Taken{{1, 300}, {2, 50}}) {
			t.Errorf("Removed = %+v", got.Removed)
		}
	})
	t.Run("set to zero empties Stock", func(t *testing.T) {
		got, err := SetTotal([]Lot{a, b}, 1, 0, today, nil)
		if err != nil {
			t.Fatal(err)
		}
		if len(got.Lots) != 0 {
			t.Errorf("Lots = %+v, want none", got.Lots)
		}
	})
	t.Run("increase adds a new lot dated today with Shelf Life", func(t *testing.T) {
		got, err := SetTotal([]Lot{a, b}, 1, 1000, today, ptr(3))
		if err != nil {
			t.Fatal(err)
		}
		wantNew := Lot{ID: 0, IngredientID: 1, Quantity: 200, Purchased: today, GoesOff: "2026-11-12"}
		if got.Added == nil || *got.Added != wantNew {
			t.Fatalf("Added = %+v, want %+v", got.Added, wantNew)
		}
		want := []Lot{a, b, wantNew}
		if !reflect.DeepEqual(got.Lots, want) {
			t.Errorf("Lots = %+v, want %+v", got.Lots, want)
		}
		if len(got.Removed) != 0 {
			t.Errorf("Removed = %+v, want none", got.Removed)
		}
	})
	t.Run("increase without Shelf Life has no go-off date", func(t *testing.T) {
		got, err := SetTotal(nil, 9, 250, today, nil)
		if err != nil {
			t.Fatal(err)
		}
		want := Lot{ID: 0, IngredientID: 9, Quantity: 250, Purchased: today, GoesOff: None}
		if got.Added == nil || *got.Added != want || len(got.Lots) != 1 {
			t.Errorf("result = %+v, want a single new lot %+v", got, want)
		}
	})
	t.Run("same total changes nothing", func(t *testing.T) {
		got, err := SetTotal([]Lot{a, b}, 1, 800, today, ptr(3))
		if err != nil {
			t.Fatal(err)
		}
		if !reflect.DeepEqual(got.Lots, []Lot{a, b}) || got.Added != nil || len(got.Removed) != 0 {
			t.Errorf("result = %+v, want unchanged", got)
		}
	})
	t.Run("negative total is rejected", func(t *testing.T) {
		if _, err := SetTotal([]Lot{a}, 1, -1, today, nil); !errors.Is(err, ErrNegativeTotal) {
			t.Errorf("err = %v, want ErrNegativeTotal", err)
		}
	})
	t.Run("input is not modified", func(t *testing.T) {
		in := []Lot{a, b}
		SetTotal(in, 1, 100, today, nil)
		if !reflect.DeepEqual(in, []Lot{a, b}) {
			t.Error("SetTotal modified its input")
		}
	})
}

func TestTotals(t *testing.T) {
	lots := []Lot{
		{ID: 1, IngredientID: 1, Quantity: 300},
		{ID: 2, IngredientID: 2, Quantity: 5},
		{ID: 3, IngredientID: 1, Quantity: 500.5},
	}
	if got := Total(lots[:1]); !near(got, 300) {
		t.Errorf("Total = %v", got)
	}
	if got := Total(nil); got != 0 {
		t.Errorf("Total(nil) = %v", got)
	}
	got := Totals(lots)
	if len(got) != 2 || !near(got[1], 800.5) || !near(got[2], 5) {
		t.Errorf("Totals = %v", got)
	}
	if len(Totals(nil)) != 0 {
		t.Error("Totals(nil) should be empty")
	}
}

func TestSpoiled(t *testing.T) {
	today := Date("2026-11-09")
	lots := []Lot{
		lot(1, 100, "2026-11-01", "2026-11-08"), // spoiled yesterday
		lot(2, 100, "2026-11-01", "2026-11-09"), // goes off today: still fine
		lot(3, 100, "2026-11-01", None),         // never
		lot(4, 100, "2026-10-20", "2026-11-01"), // spoiled a week ago
		lot(5, 100, "2026-11-05", "2026-11-20"), // fine
	}
	got := Spoiled(lots, today)
	if len(got) != 2 || got[0].ID != 4 || got[1].ID != 1 {
		t.Errorf("Spoiled = %+v, want lots 4 then 1", got)
	}
	if got := Spoiled(nil, today); len(got) != 0 {
		t.Errorf("Spoiled(nil) = %+v", got)
	}
}

func TestKeep(t *testing.T) {
	l := lot(1, 100, "2026-11-01", "2026-11-08")
	kept := Keep(l)
	if kept.GoesOff != "2026-11-09" {
		t.Errorf("GoesOff = %s, want 2026-11-09", kept.GoesOff)
	}
	if kept.ID != l.ID || kept.Quantity != l.Quantity || kept.Purchased != l.Purchased {
		t.Errorf("Keep changed more than the go-off date: %+v", kept)
	}
	if l.GoesOff != "2026-11-08" {
		t.Error("Keep modified its argument")
	}
	if got := Keep(lot(2, 100, "2026-11-01", "2026-11-30")); got.GoesOff != "2026-12-01" {
		t.Errorf("month rollover: %s", got.GoesOff)
	}
	undated := lot(3, 100, "2026-11-01", None)
	if got := Keep(undated); got != undated {
		t.Errorf("undated lot changed: %+v", got)
	}
}

// need NaN or +-Inf is a no-op, exactly like need <= 0 (Deduct has no error
// return): nothing taken, no shortfall, lots unchanged.
func TestDeductNonFiniteNeedIsNoOp(t *testing.T) {
	lots := []Lot{lot(1, 500, "2026-11-01", "2026-11-12"), lot(2, 300, "2026-11-05", None)}
	for _, need := range []float64{math.NaN(), math.Inf(1), math.Inf(-1)} {
		res := Deduct(lots, need)
		if !reflect.DeepEqual(res.Lots, lots) || len(res.Taken) != 0 || res.Shortfall != 0 {
			t.Errorf("Deduct(need=%v) = %+v, want unchanged lots, no taken, no shortfall", need, res)
		}
	}
}

// Deduct uses the same 1e-9 tolerance as SetTotal.
func TestDeductFloatTolerance(t *testing.T) {
	t.Run("0.1 + 0.2 covers a need of 0.3", func(t *testing.T) {
		lots := []Lot{lot(1, 0.1, "2026-11-01", "2026-11-10"), lot(2, 0.2, "2026-11-02", "2026-11-11")}
		res := Deduct(lots, 0.3)
		if res.Shortfall != 0 {
			t.Errorf("Shortfall = %v, want 0", res.Shortfall)
		}
		if len(res.Lots) != 0 {
			t.Errorf("Lots = %+v, want none (no near-zero leftover lot)", res.Lots)
		}
	})
	t.Run("near-zero leftover lot is dropped", func(t *testing.T) {
		res := Deduct([]Lot{lot(1, 1, "2026-11-01", None)}, 1-1e-12)
		if len(res.Lots) != 0 || res.Shortfall != 0 {
			t.Errorf("got %+v, want empty lots and no shortfall", res)
		}
	})
	t.Run("tiny shortfall below tolerance is zero", func(t *testing.T) {
		res := Deduct([]Lot{lot(1, 1, "2026-11-01", None)}, 1+1e-12)
		if res.Shortfall != 0 || len(res.Lots) != 0 {
			t.Errorf("got %+v, want no shortfall", res)
		}
	})
	t.Run("real shortfall above tolerance is reported", func(t *testing.T) {
		res := Deduct([]Lot{lot(1, 1, "2026-11-01", None)}, 1.001)
		if !near(res.Shortfall, 0.001) {
			t.Errorf("Shortfall = %v, want 0.001", res.Shortfall)
		}
	})
	t.Run("a real leftover above tolerance is kept", func(t *testing.T) {
		res := Deduct([]Lot{lot(1, 1, "2026-11-01", None)}, 0.999)
		if len(res.Lots) != 1 || !near(res.Lots[0].Quantity, 0.001) {
			t.Errorf("Lots = %+v, want one lot of 0.001", res.Lots)
		}
	})
}
