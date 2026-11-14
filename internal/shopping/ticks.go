package shopping

import (
	"time"

	"github.com/fabbarix/feeder-ng/internal/stock"
)

// Addition is one tick of a Line that put a Stock Lot (or none) into Stock (B9-23, ADR 0024). A Line ticked twice has two.
// A Scan's tick is an addition with By "scan" and the scanned Lot.
type Addition struct {
	ClientUUID string // "" for a tick from before beta.9
	UserID     int64  // 0 = unknown
	Who        string // the User's display name; "" unknown. Filled by the service, never stored
	By         string // "hand" | "scan"
	LotID      int64  // 0 = no Stock Lot (Tick without adding, or taken back and not restored)
	Quantity   float64
	Covers     float64   // the Line quantity the tick covered when it was made (Q0)
	TickedAt   time.Time // when the User ticked (the phone's time for a queued tick)
	SyncedAt   time.Time // zero when ticked online; the sync time of a queued tick
}

// PackPrice is a pack Price: cents, the date it was recorded on and the Shop it belongs to.
type PackPrice struct {
	Cents  int
	Date   stock.Date
	ShopID int64
}

// DeltaLine is a Line that a plan change added to the Shopping List or removed from it.
type DeltaLine struct {
	IngredientID   int64
	Name, BaseUnit string
	Quantity       float64 // the Line's quantity still to buy (Need for a ticked Line)
}

// Delta is what a plan change did to the Shopping List (PC-01 `shoppingDelta {added, removed}`).
type Delta struct{ Added, Removed []DeltaLine }

// Diff compares the Shopping List before and after a plan change. NOT IMPLEMENTED (B9-23 test stub).
func Diff(before, after List) Delta { return Delta{} }

// moreSinceTick is what reappears in To get after a tick (SSP-02). NOT IMPLEMENTED (B9-23 test stub).
func moreSinceTick(q0, added, q2 float64) float64 { return -1 }
