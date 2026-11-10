package stock

import "testing"

// R11c: KeepOn is Keep that also records the household date of the Keep.
func TestKeepOnPushesGoOffAndRecordsTheKeepDate(t *testing.T) {
	l := lot(1, 100, "2026-11-01", "2026-11-05")
	kept := KeepOn(l, "2026-11-09")
	if kept.GoesOff != "2026-11-06" {
		t.Errorf("GoesOff = %s, want 2026-11-06 (one day from the existing date, not from today)", kept.GoesOff)
	}
	if kept.KeptOn != "2026-11-09" {
		t.Errorf("KeptOn = %q, want 2026-11-09", kept.KeptOn)
	}
	if kept.ID != l.ID || kept.Quantity != l.Quantity || kept.Purchased != l.Purchased {
		t.Errorf("KeepOn changed more than GoesOff and KeptOn: %+v", kept)
	}
	if l.KeptOn != None || l.GoesOff != "2026-11-05" {
		t.Error("KeepOn modified its argument")
	}
	if again := KeepOn(kept, "2026-11-10"); again.GoesOff != "2026-11-07" || again.KeptOn != "2026-11-10" {
		t.Errorf("second Keep = %+v", again)
	}
	undated := lot(3, 100, "2026-11-01", None)
	if got := KeepOn(undated, "2026-11-09"); got != undated {
		t.Errorf("undated lot changed: %+v", got)
	}
}
