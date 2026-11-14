package service

import (
	"context"
	"errors"
	"math"

	"github.com/fabbarix/feeder-ng/internal/auth"
	"github.com/fabbarix/feeder-ng/internal/shopping"
	"github.com/fabbarix/feeder-ng/internal/shopping/store"
	"github.com/fabbarix/feeder-ng/internal/stock"
)

// ErrNotByHand: Change or Take back was asked for a tick that a Scan made (a Scan's Lot is undone from the Scanned list).
var ErrNotByHand = errors.New("shopping: the tick was made by a Scan")

// Adjuster sets a Stock Lot's quantity (0 removes it): the stock service's AdjustLot.
type Adjuster interface {
	AdjustLot(ctx context.Context, lotID int64, quantity float64) error
}

// Users resolves User ids to display names; an unknown id is absent.
type Users interface {
	Names(ctx context.Context, ids []int64) (map[int64]string, error)
}

// ChangeInput changes the quantity one tick addition put into Stock (SSP-01 Change, RES-03 Take back). ClientUUID
// addresses one addition of the Line (any User's, by hand); empty means the User's own latest addition by hand.
// Quantity 0 is Take back (ADR 0019): what is left of that addition's Lot goes, the tick stays.
type ChangeInput struct {
	IngredientID int64
	To           stock.Date
	ShopID       *int64
	Quantity     float64
	ClientUUID   string
	UserID       int64
}

// ChangeResult is the addition after the change. LotID is nil when it has no Stock Lot.
type ChangeResult struct {
	LotID    *int64
	Quantity float64
}

// ErrNotYours would refuse Change or Take back of another User's addition (403). Not used while any User may take back
// any addition by hand: see mayChange.
var ErrNotYours = errors.New("shopping: the addition is another User's")

// mayChange says whether the User may change or take back the addition. PRODUCT QUESTION (B9-23 ruling 4b): the Line
// sheet offers Take back on every row, so any User may change any addition by hand. To keep it to the User's own,
// return ErrNotYours here when a.UserID != 0 && a.UserID != userID (the API already answers it with 403 not_yours).
func mayChange(a shopping.Addition, userID int64) error {
	return nil
}

// ChangeTick changes what one tick addition of a Line put into Stock (SSP-01 Change; 0 is Take back, ADR 0019, and the
// tick stays). The addition is the one with in.ClientUUID (any User's, by hand), else the User's own latest addition by
// hand (an addition from before beta.9, whose User is unknown, counts as the User's). The Stock Lot moves by the
// difference, so Stock a Cooked Planned Meal used stays used; with no Lot left a fresh Lot is added. The same quantity
// changes nothing. Errors: ErrInvalid (negative, not finite, no Adjust port), ErrNotFound (no such tick or addition),
// ErrNotByHand (a Scan's).
func (s *Service) ChangeTick(ctx context.Context, in ChangeInput) (ChangeResult, error) {
	if !validAmount(in.Quantity) || s.ports.Adjust == nil {
		return ChangeResult{}, ErrInvalid
	}
	today, horizon, err := s.household(ctx)
	if err != nil {
		return ChangeResult{}, err
	}
	to := shopping.ClampTo(today, horizon, in.To)
	a, err := s.lineAddition(ctx, to, in)
	if err != nil {
		return ChangeResult{}, err
	}
	c, err := s.changeAddition(ctx, a, in.IngredientID, in.Quantity, in.ShopID, func(lotID int64) error {
		return s.recordTick(ctx, today, to, lotID, in.ShopID)
	})
	if err != nil {
		return ChangeResult{}, err
	}
	if c.changed {
		s.publish("ticks")
	}
	return c.result, nil
}

// lineAddition finds the addition ChangeTick acts on.
func (s *Service) lineAddition(ctx context.Context, to stock.Date, in ChangeInput) (store.Addition, error) {
	if in.ClientUUID != "" {
		a, ok, err := s.st.AdditionByUUID(ctx, in.ClientUUID)
		if err != nil {
			return store.Addition{}, err
		}
		if !ok || a.ExtraID != 0 || a.IngredientID != in.IngredientID || a.RangeTo != to {
			return store.Addition{}, ErrNotFound
		}
		if a.By != "hand" {
			return store.Addition{}, ErrNotByHand
		}
		return a, mayChange(a.Addition, in.UserID)
	}
	adds, err := s.st.LineAdditions(ctx, to, in.IngredientID)
	if err != nil {
		return store.Addition{}, err
	}
	if a, ok := ownLatest(adds, in.UserID); ok {
		return a, nil
	}
	if len(adds) == 0 {
		ticks, err := s.st.Ticks(ctx, to)
		if err != nil {
			return store.Addition{}, err
		}
		if t, ok := ticks[in.IngredientID]; ok && t.By == "scan" {
			return store.Addition{}, ErrNotByHand
		}
		return store.Addition{}, ErrNotFound
	}
	return store.Addition{}, noneByHand(adds)
}

// ownLatest is the User's latest addition by hand, else the latest by hand whose User is unknown (before beta.9).
func ownLatest(adds []store.Addition, userID int64) (store.Addition, bool) {
	for _, want := range []int64{userID, 0} {
		for i := len(adds) - 1; i >= 0; i-- {
			if adds[i].By == "hand" && adds[i].UserID == want {
				return adds[i], true
			}
		}
	}
	return store.Addition{}, false
}

// noneByHand is ErrNotByHand when every addition is a Scan's, else ErrNotFound (the User has none of their own).
func noneByHand(adds []store.Addition) error {
	for _, a := range adds {
		if a.By == "hand" {
			return ErrNotFound
		}
	}
	return ErrNotByHand
}

// changed is what changeAddition did: the result, whether anything changed, and what Stock took back on a Take back.
type changed struct {
	result  ChangeResult
	changed bool
	taken   float64
	delta   float64 // the change of what the addition says it added (0 when unknown)
}

// changeAddition sets what the addition put into Stock to q. added runs for a fresh Stock Lot (records what it was
// bought for).
func (s *Service) changeAddition(ctx context.Context, a store.Addition, ingredientID int64, q float64, shopID *int64,
	added func(lotID int64) error) (changed, error) {
	const eps = 1e-9
	cur, lotID := a.Quantity, a.LotID
	unknown := math.IsInf(cur, 0)
	if !unknown && math.Abs(q-cur) <= eps {
		return changed{result: changeResult(lotID, cur)}, nil
	}
	out := changed{changed: true}
	if !unknown {
		out.delta = q - cur
	}
	if q <= eps { // Take back: what is left of the Lot, up to what the addition added
		if lotID != 0 {
			taken, err := s.takeBackTaken(ctx, lotID, cur)
			if err != nil {
				return changed{}, err
			}
			out.taken = taken
		}
		if err := s.st.SetAdditionLot(ctx, a.ID, 0, 0); err != nil {
			return changed{}, mapStoreErr(err)
		}
		out.result = changeResult(0, 0)
		return out, nil
	}
	have, exists, err := s.lotQuantity(ctx, lotID)
	if err != nil {
		return changed{}, err
	}
	switch {
	case exists:
		// Move the Lot by the difference; for a tick from before migration 1560 the Lot is what it added.
		target := q
		if !unknown {
			target = have + (q - cur)
		}
		if target <= eps {
			target = 0
		}
		if err := s.ports.Adjust.AdjustLot(ctx, lotID, target); err != nil {
			return changed{}, err
		}
		if target == 0 {
			if err := s.ForgetLot(ctx, lotID); err != nil {
				return changed{}, err
			}
		}
	default:
		// No Lot (Tick without adding, taken back) or the Lot is gone (used up): a fresh Lot for what is new.
		more := q
		if lotID != 0 && !unknown {
			more = q - cur
		}
		if more > eps {
			id, _, err := s.ports.Stock.AddLot(ctx, StockAdd{IngredientID: ingredientID, Quantity: more, ShopID: shopID})
			if err != nil {
				return changed{}, err
			}
			if added != nil {
				if err := added(id); err != nil {
					return changed{}, err
				}
			}
			lotID = id
		}
	}
	if err := s.st.SetAdditionLot(ctx, a.ID, lotID, q); err != nil {
		return changed{}, mapStoreErr(err)
	}
	out.result = changeResult(lotID, q)
	return out, nil
}

func changeResult(lotID int64, q float64) ChangeResult {
	r := ChangeResult{Quantity: finite(q)}
	if lotID != 0 {
		r.LotID = &lotID
	}
	return r
}

// lotQuantity is the Stock Lot's quantity now; exists is false for no Lot (0) or one that is gone.
func (s *Service) lotQuantity(ctx context.Context, lotID int64) (float64, bool, error) {
	if lotID == 0 {
		return 0, false, nil
	}
	lots, err := s.ports.Stock.Lots(ctx)
	if err != nil {
		return 0, false, err
	}
	for _, l := range lots {
		if l.ID == lotID {
			return l.Quantity, true, nil
		}
	}
	return 0, false, nil
}

// ChangeExtraTick is ChangeTick for a ticked Ingredient extra: its latest addition by hand. What the change adds or
// takes back moves the extra's got with it. ErrNotFound for an unknown, open or text extra.
func (s *Service) ChangeExtraTick(ctx context.Context, id int64, quantity float64) (ChangeResult, error) {
	if !validAmount(quantity) || s.ports.Adjust == nil {
		return ChangeResult{}, ErrInvalid
	}
	today, _, err := s.household(ctx)
	if err != nil {
		return ChangeResult{}, err
	}
	extra, err := s.openExtra(ctx, today, id)
	if err != nil {
		return ChangeResult{}, err
	}
	if !extra.Ticked || extra.IngredientID == 0 {
		return ChangeResult{}, ErrNotFound
	}
	adds, err := s.st.ExtraAdditions(ctx, id)
	if err != nil {
		return ChangeResult{}, err
	}
	var a store.Addition
	found := false
	for i := len(adds) - 1; i >= 0 && !found; i-- {
		if adds[i].By == "hand" {
			a, found = adds[i], true
		}
	}
	if !found {
		if len(adds) == 0 {
			return ChangeResult{}, ErrNotFound
		}
		return ChangeResult{}, ErrNotByHand
	}
	u, _ := auth.UserFrom(ctx)
	if err := mayChange(a.Addition, u.ID); err != nil {
		return ChangeResult{}, err
	}
	c, err := s.changeAddition(ctx, a, extra.IngredientID, quantity, nil, nil)
	if err != nil {
		return ChangeResult{}, err
	}
	if !c.changed {
		return c.result, nil
	}
	got := c.delta
	if quantity == 0 {
		got = -c.taken
	}
	if got != 0 {
		if _, err := s.st.AddGot(ctx, id, got); err != nil {
			return ChangeResult{}, mapStoreErr(err)
		}
	}
	s.publish("extras")
	return c.result, nil
}

// UntickAddition takes back the addition by hand with that client UUID and removes it; the tick goes when it was the
// last one (RES-03 shop_untick). An unknown UUID, or a Scan's, changes nothing.
func (s *Service) UntickAddition(ctx context.Context, clientUUID string) error {
	a, ok, err := s.st.AdditionByUUID(ctx, clientUUID)
	if err != nil || !ok || a.By != "hand" {
		return err
	}
	taken := 0.0
	if a.LotID != 0 {
		if taken, err = s.takeBackTaken(ctx, a.LotID, a.Quantity); err != nil {
			return err
		}
	}
	gone, err := s.st.DeleteAddition(ctx, a.ID)
	if err != nil {
		return err
	}
	if a.ExtraID == 0 {
		s.publish("ticks")
		return nil
	}
	if taken > 0 {
		if _, err := s.st.AddGot(ctx, a.ExtraID, -taken); err != nil && !errors.Is(err, store.ErrNotFound) {
			return err
		}
	}
	if gone {
		if err := s.st.UntickExtra(ctx, a.ExtraID); err != nil && !errors.Is(err, store.ErrNotFound) {
			return err
		}
	}
	s.publish("extras")
	return nil
}

// Snapshot derives the Shopping List for the range ending on `to` (the default when empty, clamped like List) without
// prices, Packs, the Scan ledger or the currency: the smallest read the plan side needs to take shopping.Diff before and
// after a write (PC-01 `shoppingDelta`).
func (s *Service) Snapshot(ctx context.Context, to stock.Date) (shopping.List, error) {
	today, horizon, err := s.household(ctx)
	if err != nil {
		return shopping.List{}, err
	}
	in, _, err := s.baseInput(ctx, today, shopping.ClampTo(today, horizon, to))
	if err != nil {
		return shopping.List{}, err
	}
	return shopping.Derive(in), nil
}
