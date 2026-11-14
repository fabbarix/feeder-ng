package stock

import "testing"

// Beta.8 (undo): TakeBack is what Undo of a tick does to the Stock Lot the tick added (docs/dev/design/b8-undo.md, ADR 0019).
// It takes back what is left of the Lot, never more than the tick added, and never touches another Lot.
//
//	func TakeBack(lots []Lot, lotID int64, added float64) TakeBackResult
//	type TakeBackResult struct { Lots []Lot; Taken float64; Removed bool }

func quantities(lots []Lot) map[int64]float64 {
	out := map[int64]float64{}
	for _, l := range lots {
		out[l.ID] = l.Quantity
	}
	return out
}

func TestTakeBack(t *testing.T) {
	tests := []struct {
		name        string
		lots        []Lot
		lotID       int64
		added       float64
		wantTaken   float64
		wantRemoved bool
		wantAfter   map[int64]float64
	}{
		{"an untouched Lot goes whole", []Lot{lot(1, 400, "2026-11-09", None)}, 1, 400, 400, true, map[int64]float64{}},
		{"a Lot partly used takes back what is left", []Lot{lot(1, 150, "2026-11-09", None)}, 1, 400, 150, true, map[int64]float64{}},
		{"a Lot used up has nothing to take back", []Lot{lot(2, 90, "2026-11-01", None)}, 1, 400, 0, false, map[int64]float64{2: 90}},
		{"a Lot edited up gives back only what the tick added", []Lot{lot(1, 600, "2026-11-09", None)}, 1, 400, 400, false, map[int64]float64{1: 200}},
		{"a Lot edited down below what was added goes whole", []Lot{lot(1, 100, "2026-11-09", None)}, 1, 400, 100, true, map[int64]float64{}},
		{"another Lot of the same Ingredient is never touched", []Lot{lot(1, 400, "2026-11-09", None), lot(2, 800, "2026-11-01", None)}, 1, 400, 400, true, map[int64]float64{2: 800}},
		{"an unknown Lot is a no-op", []Lot{lot(2, 90, "2026-11-01", None)}, 9, 400, 0, false, map[int64]float64{2: 90}},
		{"nothing added takes nothing", []Lot{lot(1, 400, "2026-11-09", None)}, 1, 0, 0, false, map[int64]float64{1: 400}},
		{"a negative amount takes nothing", []Lot{lot(1, 400, "2026-11-09", None)}, 1, -5, 0, false, map[int64]float64{1: 400}},
		{"a float rest below the tolerance counts as gone", []Lot{lot(1, 400.0000000001, "2026-11-09", None)}, 1, 400, 400.0000000001, true, map[int64]float64{}},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			res := TakeBack(tc.lots, tc.lotID, tc.added)
			if !near(res.Taken, tc.wantTaken) || res.Removed != tc.wantRemoved {
				t.Fatalf("Taken %v Removed %v, want %v %v", res.Taken, res.Removed, tc.wantTaken, tc.wantRemoved)
			}
			got := quantities(res.Lots)
			if len(got) != len(tc.wantAfter) {
				t.Fatalf("Lots after = %v, want %v", got, tc.wantAfter)
			}
			for id, q := range tc.wantAfter {
				if !near(got[id], q) {
					t.Errorf("Lot %d = %v, want %v", id, got[id], q)
				}
			}
		})
	}
}

func TestTakeBackDoesNotChangeItsInput(t *testing.T) {
	in := []Lot{lot(1, 600, "2026-11-09", None)}
	TakeBack(in, 1, 400)
	if in[0].Quantity != 600 {
		t.Fatalf("input Lot changed to %v", in[0].Quantity)
	}
}
