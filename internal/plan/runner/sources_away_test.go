package runner_test

import "testing"

// B9-24 (PC-08): DBSources leaves a Member out of the Attendance of the dates an Away covers, and only those.

func TestDBSourcesLeaveOutAMemberOnlyOnTheDatesTheirAwayCovers(t *testing.T) {
	h := newRealHousehold(t)
	if _, err := h.db.Exec(`INSERT INTO member_away (member_id, from_date, through_date) VALUES (?, '2026-11-16', '2026-11-16')`, h.ben); err != nil {
		t.Fatal(err)
	}
	for _, c := range []struct {
		date string
		want int
	}{{"2026-11-09", 2}, {"2026-11-16", 1}, {"2026-11-23", 2}} {
		att, err := h.src.Attendance(ctx, h.slot, c.date)
		if err != nil {
			t.Fatal(err)
		}
		if len(att) != c.want {
			t.Errorf("%s: Attendance = %+v, want %d", c.date, att, c.want)
		}
		courses, err := h.src.SlotCourses(ctx, h.slot, c.date)
		if err != nil {
			t.Fatal(err)
		}
		for _, sc := range courses {
			for _, a := range sc.Attendance {
				if c.want == 1 && a.MemberID == h.ben {
					t.Errorf("%s: Course %d keeps Ben, who is away", c.date, sc.CourseID)
				}
			}
		}
	}
}
