package store_test

import (
	"testing"

	"github.com/fabbarix/feeder-ng/internal/stock"
	"github.com/fabbarix/feeder-ng/internal/stock/store"
)

// Beta.5 ST: Delete of a Lot is a correction, like the Undo of a scan. A Lot that left Stock earlier has a go-off
// record; deleting by hand takes the Lot's record with it (and only that one's).
func TestDeleteLotForgetsItsGoOffRecord(t *testing.T) {
	f := setup(t)
	l := f.add(t, f.thighs, 100, "2026-11-01", "2026-11-03")
	other := f.add(t, f.thighs, 100, "2026-11-01", "2026-11-03")
	for _, id := range []int64{l.ID, other.ID} {
		if _, err := f.db.Exec(`INSERT INTO stock_go_offs (lot_id, goes_off, recorded_on) VALUES (?, '2026-11-03', '2026-11-09')`, id); err != nil {
			t.Fatal(err)
		}
	}
	if err := f.st.DeleteLot(ctx, l.ID); err != nil {
		t.Fatal(err)
	}
	got := f.goOffs(t)
	if len(got) != 1 || got[0].LotID != other.ID {
		t.Fatalf("go-offs = %+v, want only the record of lot %d", got, other.ID)
	}
}

func TestDeleteLotOfAnUnknownLotIsNotFoundAndKeepsGoOffs(t *testing.T) {
	f := setup(t)
	if _, err := f.db.Exec(`INSERT INTO stock_go_offs (lot_id, goes_off, recorded_on) VALUES (999, '2026-11-03', '2026-11-09')`); err != nil {
		t.Fatal(err)
	}
	if err := f.st.DeleteLot(ctx, 999); err != store.ErrNotFound {
		t.Fatalf("err = %v, want ErrNotFound", err)
	}
	if got := f.goOffs(t); len(got) != 1 {
		t.Fatalf("go-offs = %+v, want the untouched record", got)
	}
}

// Editing the Good until of a Lot to a later day removes its go-off record in the same transaction.
func TestUpdateForgetsTheGoOffRecordsItIsToldTo(t *testing.T) {
	f := setup(t)
	l := f.add(t, f.thighs, 100, "2026-11-01", "2026-11-03")
	keep := f.add(t, f.thighs, 100, "2026-11-01", "2026-11-03")
	for _, id := range []int64{l.ID, keep.ID} {
		if _, err := f.db.Exec(`INSERT INTO stock_go_offs (lot_id, goes_off, recorded_on) VALUES (?, '2026-11-03', '2026-11-09')`, id); err != nil {
			t.Fatal(err)
		}
	}
	_, err := f.st.Update(ctx, f.thighs, func(lots []stock.Lot) (store.Mutation, error) {
		for i := range lots {
			if lots[i].ID == l.ID {
				lots[i].GoesOff = "2026-11-30"
			}
		}
		return store.Mutation{Lots: lots, ForgetGoOffs: []int64{l.ID, 12345}}, nil
	})
	if err != nil {
		t.Fatal(err)
	}
	got := f.goOffs(t)
	if len(got) != 1 || got[0].LotID != keep.ID {
		t.Fatalf("go-offs = %+v, want only the record of lot %d", got, keep.ID)
	}
	if lot, _ := f.st.Lot(ctx, l.ID); lot.GoesOff != "2026-11-30" {
		t.Fatalf("lot = %+v", lot)
	}
}
