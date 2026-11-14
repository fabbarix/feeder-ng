package shopping

import "testing"

// B9-23 (SSP-02): moreSinceTick(q0, added, q2). A tick covers an amount: the Line quantity when it was ticked (q0). What
// the tick left uncovered is max(0, q0 - added). The Line's quantity now (q2, after the Stock the tick added) is more than
// that when the need grew: the difference reappears in To get as "More since your tick".
func TestMoreSinceTick(t *testing.T) {
	for _, c := range []struct {
		name          string
		q0, added, q2 float64
		want          float64
	}{
		{"need grew by 750 after a tick that added what it covered", 800, 800, 750, 750},
		{"nothing grew", 800, 800, 0, 0},
		{"Tick without adding: the Line is still open by what it covered", 800, 0, 800, 0},
		{"Tick without adding, then the need grew by 750", 800, 0, 1550, 750},
		{"a pack smaller than the need left 300 uncovered", 800, 500, 300, 0},
		{"a pack smaller than the need, then the need grew by 750", 800, 500, 1050, 750},
		{"the need shrank", 800, 800, 0, 0},
		{"a second purchase made the tick over-cover: the extra is all more", 800, 1000, 550, 550},
		{"added less than covered, quantity now equals what is uncovered", 800, 300, 500, 0},
		{"one more gram than what is uncovered", 800, 300, 501, 1},
		{"float dust below 1e-9 is no more", 800, 800, 1e-12, 0},
		{"float dust on the uncovered part", 0.3, 0.1, 0.2 + 1e-12, 0},
		{"a tick of a Line that was not on the list covers nothing", 0, 0, 100, 100},
		{"added more than covered with nothing left", 100, 500, 0, 0},
	} {
		if got := moreSinceTick(c.q0, c.added, c.q2); got < c.want-1e-6 || got > c.want+1e-6 {
			t.Errorf("%s: moreSinceTick(%v, %v, %v) = %v, want %v", c.name, c.q0, c.added, c.q2, got, c.want)
		}
	}
}
