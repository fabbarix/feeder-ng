package store_test

import (
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/household"
)

// B9-24 (PC-08): a removed Member takes their Aways and their "Eats here anyway" with them; Undo within ten minutes puts
// them back with the same ids; once the snapshot expires they are gone for good.

func TestRemoveMemberTakesTheirAwaysAndRestoreGivesThemBackWithTheSameIds(t *testing.T) {
	r := newRfx(t)
	ben := r.member("Ben", 1)
	sam := r.member("Sam", 1)
	dinner := r.slot(2, "Dinner", "19:00", household.Attendee{MemberID: ben.ID}, household.Attendee{MemberID: sam.ID})
	r.exec(`INSERT INTO member_away (id, member_id, from_date, from_slot_id, through_date, through_slot_id, applies_from, created_at)
		VALUES (41, ?, '2026-11-10', ?, '2026-11-12', NULL, '2026-11-09T12:00:00Z', '2026-11-09T12:00:00Z')`, ben.ID, dinner.ID)
	r.exec(`INSERT INTO member_away (id, member_id, from_date, applies_from) VALUES (42, ?, '2026-12-01', '2026-11-09T12:00:00Z')`, ben.ID)
	r.exec(`INSERT INTO member_away (id, member_id, from_date) VALUES (43, ?, '2026-11-20')`, sam.ID)
	if err := r.st.SetDateAttendance(r.ctx, dinner.ID, "2026-11-10", []household.Attendee{{MemberID: ben.ID, DespiteAway: true}, {MemberID: sam.ID}}); err != nil {
		t.Fatal(err)
	}

	if err := r.st.RemoveMember(r.ctx, ben.ID); err != nil {
		t.Fatal(err)
	}
	if n := r.count(`SELECT count(*) FROM member_away WHERE member_id = ?`, ben.ID); n != 0 {
		t.Errorf("%d Aways of the removed Member stay: they must not change the plan while the Member is removed", n)
	}
	if n := r.count(`SELECT count(*) FROM member_away WHERE id = 43`); n != 1 {
		t.Error("another Member's Away went with the removed Member")
	}

	if _, err := r.st.RestoreMember(r.ctx, ben.ID); err != nil {
		t.Fatal(err)
	}
	if n := r.count(`SELECT count(*) FROM member_away WHERE member_id = ? AND id IN (41, 42)`, ben.ID); n != 2 {
		t.Fatalf("after restore %d of the 2 Aways are back with their ids", n)
	}
	if n := r.count(`SELECT count(*) FROM member_away WHERE id = 41 AND from_date = '2026-11-10' AND from_slot_id = ?
		AND through_date = '2026-11-12' AND through_slot_id IS NULL AND applies_from = '2026-11-09T12:00:00Z'`, dinner.ID); n != 1 {
		t.Error("Away 41 did not come back as it was")
	}
	if n := r.count(`SELECT count(*) FROM member_away WHERE id = 42 AND through_date IS NULL`); n != 1 {
		t.Error("Away 42 lost its \"No last day yet\"")
	}
	att, _, err := r.st.DateAttendance(r.ctx, dinner.ID, "2026-11-10")
	if err != nil {
		t.Fatal(err)
	}
	var despite bool
	for _, a := range att {
		despite = despite || (a.MemberID == ben.ID && a.DespiteAway)
	}
	if !despite {
		t.Errorf("Ben's \"Eats here anyway\" did not come back: %+v", att)
	}
}

func TestARemovedMembersAwaysAreGoneWhenTheSnapshotExpires(t *testing.T) {
	r := newRfx(t)
	ben := r.member("Ben", 1)
	r.exec(`INSERT INTO member_away (id, member_id, from_date) VALUES (41, ?, '2026-11-10')`, ben.ID)
	if err := r.st.RemoveMember(r.ctx, ben.ID); err != nil {
		t.Fatal(err)
	}
	r.clk.Advance(11 * time.Minute)
	if _, err := r.st.ExpireMemberRemovals(r.ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := r.st.RestoreMember(r.ctx, ben.ID); err == nil {
		t.Fatal("restore after ten minutes worked")
	}
	if n := r.count(`SELECT count(*) FROM member_away`); n != 0 {
		t.Errorf("%d Aways left after the snapshot expired", n)
	}
}
