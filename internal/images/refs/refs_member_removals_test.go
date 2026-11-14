package refs_test

import (
	"context"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/db"
	"github.com/fabbarix/feeder-ng/internal/images/refs"
)

// B9-04: a removed Member's photo stays in member_removals until the snapshot expires, so Undo can give it back. If
// member_removals.photo is missing from Default, the nightly sweep deletes the photo inside the Undo window.
func TestDefaultKeepsTheRemovedMembersPhotoForUndo(t *testing.T) {
	d := openDB(t)
	if err := db.MigrateEmbedded(context.Background(), d); err != nil {
		t.Fatal(err)
	}
	have := map[refs.Column]bool{}
	for _, c := range refs.Default {
		have[c] = true
	}
	if !have[(refs.Column{Table: "member_removals", Column: "photo"})] {
		t.Errorf("refs.Default lacks member_removals.photo: %+v", refs.Default)
	}
	const face = "cccccccccccccccccccccccccccccccc"
	exec(t, d, `INSERT INTO member_removals (member_id, removed_at, photo, snapshot_json) VALUES (4, '2026-11-14T12:00:00Z', ?, '{}')`, face)
	c := refs.New(d)
	got, err := c.ReferencedIDs(context.Background())
	if err != nil || !got[face] {
		t.Errorf("ReferencedIDs = %v, %v; want the removed Member's photo", got, err)
	}
	if used, err := c.IsReferenced(context.Background(), face); err != nil || !used {
		t.Errorf("IsReferenced(removed Member's photo) = %v, %v; want true", used, err)
	}
}
