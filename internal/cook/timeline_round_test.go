package cook

import "testing"

// The rounding offset of the cooking timeline (crs-c2 §5.1): the API counts from slot time less whole minutes.
// The HTTP tests only produce whole-minute timelines, so this is their unit test.
func TestRoundToMinutesMovesEveryItemByTheOffsetSoTheLastEndsAtTheSlot(t *testing.T) {
	cases := []struct {
		name       string
		in         Result
		wantMin    int
		wantOffset int
	}{
		{"whole minutes", Result{TotalSeconds: 1200, Items: []Item{{StartSeconds: 0, EndSeconds: 600}, {StartSeconds: 600, EndSeconds: 1200}}}, 20, 0},
		{"seconds round up", Result{TotalSeconds: 1250, Items: []Item{{StartSeconds: 0, EndSeconds: 610}, {StartSeconds: 610, EndSeconds: 1250}}}, 21, 10},
		{"one second over", Result{TotalSeconds: 601, Items: []Item{{StartSeconds: 0, EndSeconds: 601}}}, 11, 59},
		{"nothing", Result{}, 0, 0},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got, minutes := RoundToMinutes(c.in)
			if minutes != c.wantMin || got.TotalSeconds != c.wantMin*60 {
				t.Fatalf("minutes %d total %d, want %d and %d", minutes, got.TotalSeconds, c.wantMin, c.wantMin*60)
			}
			if len(got.Items) != len(c.in.Items) {
				t.Fatalf("items %d, want %d", len(got.Items), len(c.in.Items))
			}
			for i, it := range got.Items {
				want := c.in.Items[i]
				if it.StartSeconds != want.StartSeconds+c.wantOffset || it.EndSeconds != want.EndSeconds+c.wantOffset {
					t.Errorf("item %d = %d..%d, want %d..%d", i, it.StartSeconds, it.EndSeconds,
						want.StartSeconds+c.wantOffset, want.EndSeconds+c.wantOffset)
				}
			}
			if n := len(got.Items); n > 0 && got.Items[n-1].EndSeconds != c.wantMin*60 {
				t.Errorf("last item ends at %d, want the slot time %d", got.Items[n-1].EndSeconds, c.wantMin*60)
			}
			if n := len(c.in.Items); n > 0 && c.in.Items[0].StartSeconds == got.Items[0].StartSeconds && c.wantOffset != 0 {
				t.Errorf("the input was modified or the offset was not applied")
			}
		})
	}
}
