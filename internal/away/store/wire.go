package store

import (
	"context"
	"database/sql"

	"github.com/fabbarix/feeder-ng/internal/away"
	"github.com/fabbarix/feeder-ng/internal/clock"
	householdstore "github.com/fabbarix/feeder-ng/internal/household/store"
)

// Wire is an Away as every API shows it (the Away routes, GET /api/plan "away", Who's eating): its Member, its dates,
// its Meal Slots (null for the whole day), and whether its first Meal Slot missed has started.
type Wire struct {
	ID                int64   `json:"id"`
	MemberID          int64   `json:"memberId"`
	MemberName        string  `json:"memberName"`
	From              string  `json:"from"`
	FromMealSlotID    *int64  `json:"fromMealSlotId"`
	Through           *string `json:"through"`
	ThroughMealSlotID *int64  `json:"throughMealSlotId"`
	Started           bool    `json:"started"`

	away away.Away
}

// Away is the domain Away the Wire shows.
func (w Wire) Away() away.Away { return w.away }

// WireOf shows an Away.
func WireOf(a away.Away, memberName string, started bool) Wire {
	w := Wire{ID: a.ID, MemberID: a.MemberID, MemberName: memberName, From: a.From, Started: started, away: a}
	if a.FromSlot != 0 {
		id := a.FromSlot
		w.FromMealSlotID = &id
	}
	if a.Through != "" {
		t := a.Through
		w.Through = &t
	}
	if a.ThroughSlot != 0 {
		id := a.ThroughSlot
		w.ThroughMealSlotID = &id
	}
	return w
}

// Store reads the Aways as the APIs show them.
type Store struct {
	db  *sql.DB
	clk clock.Clock
	hh  *householdstore.Store
}

// New returns a Store over an open, migrated database.
func New(db *sql.DB, clk clock.Clock) *Store {
	return &Store{db: db, clk: clk, hh: householdstore.New(db, clk)}
}

// Wires shows every Away, soonest first.
func (s *Store) Wires(ctx context.Context) ([]Wire, error) {
	loc, err := Zone(ctx, s.db)
	if err != nil {
		return nil, err
	}
	all, err := All(ctx, s.db, loc)
	if err != nil {
		return nil, err
	}
	hs, err := s.hh.Slots(ctx)
	if err != nil {
		return nil, err
	}
	slots := SlotsOf(hs)
	names, err := MemberNames(ctx, s.db)
	if err != nil {
		return nil, err
	}
	now := s.clk.Now().In(loc)
	out := make([]Wire, 0, len(all))
	for _, a := range all {
		out = append(out, WireOf(a, names[a.MemberID], away.Started(a, now, slots)))
	}
	return out, nil
}
