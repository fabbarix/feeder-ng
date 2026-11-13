package runner

import (
	"context"
	"database/sql"
	"errors"

	"github.com/fabbarix/feeder-ng/internal/plan"
	"github.com/fabbarix/feeder-ng/internal/plan/store"
)

// Leftovers by hand (ADR 0012, docs/dev/design/b5-lo.md §5): Had it, Threw it out, Freeze it, Take out, the answers to
// a Leftover past its Use-by, and picking a Leftover for a Planned Meal. Each action is one write: its change, the
// unpinning of the Planned Meals that lose their portions, and one planning run, in one transaction.

// Errors of the Leftover actions; httpapi maps them to the codes of the plan's API table.
var (
	// ErrLeftoverPastUseBy: Freeze it, or picking a Leftover for a day after its Use-by. API 409 leftover_past_use_by.
	ErrLeftoverPastUseBy = errors.New("planning: the Leftover is past its Use-by")
	// ErrLeftoverFrozen: Freeze it on a Leftover that is already frozen. API 409 leftover_frozen.
	ErrLeftoverFrozen = errors.New("planning: the Leftover is already frozen")
	// ErrLeftoverNotFrozen: Take out of a Leftover that is not frozen. API 409 leftover_not_frozen.
	ErrLeftoverNotFrozen = errors.New("planning: the Leftover is not frozen")
	// ErrLeftoverNotToAnswer: an answer for a Leftover that is not past its Use-by with portions left. API 409 leftover_not_to_answer.
	ErrLeftoverNotToAnswer = errors.New("planning: the Leftover is not waiting for an answer")
	// ErrStoragePlaceNotFreezer: Freeze it into a Storage Place that is not a Freezer. API 422 storage_place_not_freezer.
	ErrStoragePlaceNotFreezer = errors.New("planning: that Storage Place is not a Freezer")
	// ErrStoragePlaceFreezer: Take out into a Freezer. API 422 storage_place_freezer.
	ErrStoragePlaceFreezer = errors.New("planning: a Leftover taken out cannot go to a Freezer")
	// ErrUnknownStoragePlace: no such Storage Place. API 422 storage_place_unknown (proposed, see the design note).
	ErrUnknownStoragePlace = errors.New("planning: unknown Storage Place")
	// ErrInvalidAnswer: not had_it, threw_out or wasnt_there. API 422 validation_failed on "answer".
	ErrInvalidAnswer = errors.New("planning: the answer must be had_it, threw_out or wasnt_there")
	// ErrLeftoverTooSmall: picking a Leftover that has fewer portions than the cell needs (after the Planned Meals
	// already served from it). API 422 leftover_too_small (proposed).
	ErrLeftoverTooSmall = errors.New("planning: the Leftover has too few portions for that meal")
)

// LeftoverView is a Leftover as the API lists it: the stored row plus what the Pantry, Today and the plan need.
type LeftoverView struct {
	plan.Leftover
	StoragePlaceName string  // "" when it has no Storage Place
	ToAnswer         bool    // plan.IsToAnswer on the household date
	PlannedPortions  float64 // plan.PlannedClaims of the planned meals served from it
}

// LeftoverResult is the answer of Had it, Threw it out and Take out: the Leftover after the action (portions may be
// 0), and the Planned Meals that lost their portions, unpinned and replanned.
type LeftoverResult struct {
	Leftover  plan.Leftover
	Replanned []plan.Key
}

// FreezeResult is the answer of Freeze it. Frozen is the Leftover now in the Freezer: the same row when all of it was
// frozen, a NEW row (new id) when part was. Left is the part that stayed, with its id, Use-by and claims; nil when all
// was frozen.
type FreezeResult struct {
	Frozen    plan.Leftover
	Left      *plan.Leftover
	Replanned []plan.Key
}

// ErrDryRun is what a write answers when its context is Dry: the action was checked and its result is in the returned
// value, but nothing was written.
var ErrDryRun = errors.New("planning: dry run, nothing written")

// dryKey marks a context as a preview.
type dryKey struct{}

// Dry returns ctx marked as a preview: the Leftover actions run every check and compute what they would replan, then
// answer ErrDryRun (with their result) and write nothing (?dryRun=1).
func Dry(ctx context.Context) context.Context { return context.WithValue(ctx, dryKey{}, true) }

func isDry(ctx context.Context) bool {
	dry, _ := ctx.Value(dryKey{}).(bool)
	return dry
}

// LeftoverViews lists the available Leftovers with portions left, soonest Use-by first: frozen ones and ones to answer too.
func (r *Runner) LeftoverViews(ctx context.Context) ([]LeftoverView, error) {
	in, err := r.info(ctx)
	if err != nil {
		return nil, err
	}
	ls, err := r.d.Store.Leftovers(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]LeftoverView, 0, len(ls))
	for _, l := range ls {
		v, err := r.viewOf(ctx, in, l)
		if err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, nil
}

// LeftoverView is the view of one Leftover after an action, whatever its portions (0 included); ErrNotFound if the row is gone.
func (r *Runner) LeftoverView(ctx context.Context, id int64) (LeftoverView, error) {
	in, err := r.info(ctx)
	if err != nil {
		return LeftoverView{}, err
	}
	l, err := r.d.Store.Leftover(ctx, id)
	if err != nil {
		return LeftoverView{}, mapStoreErr(err)
	}
	return r.viewOf(ctx, in, l)
}

func (r *Runner) viewOf(ctx context.Context, in info, l plan.Leftover) (LeftoverView, error) {
	name, err := r.placeName(ctx, l.StoragePlaceID)
	if err != nil {
		return LeftoverView{}, err
	}
	deps, err := r.d.Store.DependantsOfLeftover(ctx, l.ID)
	if err != nil {
		return LeftoverView{}, err
	}
	return LeftoverView{Leftover: l, StoragePlaceName: name, ToAnswer: plan.IsToAnswer(l, in.today),
		PlannedPortions: claimsOf(deps)}, nil
}

// LosingOut lists the Planned Meals, Pinned or not, served from the Leftover that would lose their portions if only
// remaining portions stayed on it (plan.MisfitDependants), in the order they are served. It writes nothing: the sheets
// and the API's ?dryRun=1 name these meals before the User confirms. ErrNotFound.
func (r *Runner) LosingOut(ctx context.Context, id int64, remaining float64) ([]plan.Key, error) {
	if _, err := r.d.Store.Leftover(ctx, id); err != nil {
		return nil, mapStoreErr(err)
	}
	in, err := r.info(ctx)
	if err != nil {
		return nil, err
	}
	return r.leftoverMisfits(ctx, r.d.Store, id, remaining, in)
}

// HadIt takes portions off a Leftover: portions had outside the plan, not waste. ErrNotFound, plan.ErrPortionsInvalid.
func (r *Runner) HadIt(ctx context.Context, id int64, portions float64, userID int64) (LeftoverResult, error) {
	var res LeftoverResult
	_, err := r.write(ctx, plan.ReasonLeftoversChanged, runOpts{}, func(_ *sql.Tx, st *store.Store) (func(), error) {
		in, err := r.info(ctx)
		if err != nil {
			return nil, err
		}
		l, err := availableLeftover(ctx, st, id)
		if err != nil {
			return nil, err
		}
		if err := plan.CheckPortions(portions, l.Portions); err != nil {
			return nil, err
		}
		left, err := takeOff(ctx, st, l, portions, plan.EventHadIt, userID, in.today)
		if err != nil {
			return nil, err
		}
		res.Replanned, err = r.unpinLeftoverMisfits(ctx, st, id, left, in)
		if err != nil {
			return nil, err
		}
		res.Leftover, err = reload(ctx, st, id)
		return nil, err
	})
	return res, err
}

// ThrewOut takes portions off a Leftover and records them as waste dated plan.ThrownOutOn. ErrNotFound, plan.ErrPortionsInvalid.
func (r *Runner) ThrewOut(ctx context.Context, id int64, portions float64, userID int64) (LeftoverResult, error) {
	var res LeftoverResult
	_, err := r.write(ctx, plan.ReasonLeftoversChanged, runOpts{}, func(tx *sql.Tx, st *store.Store) (func(), error) {
		in, err := r.info(ctx)
		if err != nil {
			return nil, err
		}
		l, err := availableLeftover(ctx, st, id)
		if err != nil {
			return nil, err
		}
		if err := plan.CheckPortions(portions, l.Portions); err != nil {
			return nil, err
		}
		rec := r.newWasteRecorder(tx)
		if err := rec.wasteOf(ctx, plan.AnswerThrewOut, l, portions, in.today); err != nil {
			return nil, err
		}
		left, err := takeOff(ctx, st, l, portions, plan.EventThrewOut, userID, in.today)
		if err != nil {
			return nil, err
		}
		res.Replanned, err = r.unpinLeftoverMisfits(ctx, st, id, left, in)
		if err != nil {
			return nil, err
		}
		res.Leftover, err = reload(ctx, st, id)
		return rec.after(ctx), err
	})
	return res, err
}

// Freeze moves a Leftover (portions nil: all of it) to a Freezer. ErrNotFound, plan.ErrPortionsInvalid,
// ErrLeftoverPastUseBy, ErrLeftoverFrozen, ErrUnknownStoragePlace, ErrStoragePlaceNotFreezer.
//
// Freezing all of it updates the row. Freezing part leaves the original row with the part that stays (same Use-by,
// not frozen) and inserts a new row for the frozen part, with the Frozen Use-by. The Planned Meals served from the
// original row are checked against what stays.
func (r *Runner) Freeze(ctx context.Context, id, storagePlaceID int64, portions *float64, userID int64) (FreezeResult, error) {
	var res FreezeResult
	_, err := r.write(ctx, plan.ReasonLeftoversChanged, runOpts{}, func(_ *sql.Tx, st *store.Store) (func(), error) {
		in, err := r.info(ctx)
		if err != nil {
			return nil, err
		}
		l, err := availableLeftover(ctx, st, id)
		if err != nil {
			return nil, err
		}
		if l.Frozen() {
			return nil, ErrLeftoverFrozen
		}
		if l.UseBy < in.today {
			return nil, ErrLeftoverPastUseBy
		}
		if storagePlaceID == 0 {
			return nil, ErrUnknownStoragePlace
		}
		place, err := storagePlaceOf(ctx, st, storagePlaceID)
		if err != nil {
			return nil, err
		}
		if place.Kind != "freezer" {
			return nil, ErrStoragePlaceNotFreezer
		}
		if portions == nil {
			if err := plan.CheckPortions(l.Portions, l.Portions); err != nil {
				return nil, err
			}
		}
		frozenN, stays, err := plan.SplitForFreeze(l.Portions, portions)
		if err != nil {
			return nil, err
		}
		recipeDays, houseDays, err := st.FrozenUseByDays(ctx, l.RecipeID)
		if err != nil {
			return nil, mapStoreErr(err)
		}
		useBy := plan.FreezeUseBy(in.today, recipeDays, houseDays)

		frozenID := id
		if stays == 0 {
			if err := st.SaveLeftoverState(ctx, id, l.Portions, useBy, storagePlaceID, in.today); err != nil {
				return nil, mapStoreErr(err)
			}
		} else {
			if err := st.SaveLeftoverState(ctx, id, stays, l.UseBy, 0, ""); err != nil {
				return nil, mapStoreErr(err)
			}
			part, err := st.AddLeftover(ctx, plan.Leftover{RecipeID: l.RecipeID, From: l.From, Portions: frozenN,
				CookedOn: l.CookedOn, UseBy: useBy, StoragePlaceID: storagePlaceID, FrozenOn: in.today})
			if err != nil {
				return nil, err
			}
			frozenID = part.ID
		}
		if err := st.AddLeftoverEvent(ctx, plan.LeftoverEvent{LeftoverID: frozenID, RecipeID: l.RecipeID, Kind: plan.EventFroze,
			Portions: frozenN, On: in.today, StoragePlaceID: storagePlaceID, UserID: userID}); err != nil {
			return nil, err
		}
		res.Replanned, err = r.unpinLeftoverMisfits(ctx, st, id, stays, in)
		if err != nil {
			return nil, err
		}
		if res.Frozen, err = reload(ctx, st, frozenID); err != nil {
			return nil, err
		}
		if stays > 0 {
			left, err := reload(ctx, st, id)
			if err != nil {
				return nil, err
			}
			res.Left = &left
		}
		return nil, nil
	})
	return res, err
}

// TakeOut takes a frozen Leftover out of the Freezer into storagePlaceID (0: Not sorted). ErrNotFound,
// ErrLeftoverNotFrozen, ErrUnknownStoragePlace, ErrStoragePlaceFreezer.
//
// Its Use-by is today plus the Recipe's Use-by days (the Household's default otherwise). A Leftover whose Frozen
// Use-by has already passed keeps that date, so it is to answer at once (docs/dev/design/b5-lo.md §9, PM answer 1).
func (r *Runner) TakeOut(ctx context.Context, id, storagePlaceID int64, userID int64) (LeftoverResult, error) {
	var res LeftoverResult
	_, err := r.write(ctx, plan.ReasonLeftoversChanged, runOpts{}, func(_ *sql.Tx, st *store.Store) (func(), error) {
		in, err := r.info(ctx)
		if err != nil {
			return nil, err
		}
		l, err := availableLeftover(ctx, st, id)
		if err != nil {
			return nil, err
		}
		if !l.Frozen() {
			return nil, ErrLeftoverNotFrozen
		}
		if storagePlaceID != 0 {
			place, err := storagePlaceOf(ctx, st, storagePlaceID)
			if err != nil {
				return nil, err
			}
			if place.Kind == "freezer" {
				return nil, ErrStoragePlaceFreezer
			}
		}
		recipes, err := r.d.Source.Recipes(ctx)
		if err != nil {
			return nil, err
		}
		var days *int
		if rc, ok := recipeOf(recipes, l.RecipeID); ok {
			days = rc.UseByDays
		}
		useBy := l.UseBy // already passed: stays, and the Leftover is to answer at once
		if useBy >= in.today {
			useBy = plan.TakeOutUseBy(in.today, days, in.settings.DefaultUseByDays)
		}
		if err := st.SaveLeftoverState(ctx, id, l.Portions, useBy, storagePlaceID, ""); err != nil {
			return nil, mapStoreErr(err)
		}
		if err := st.AddLeftoverEvent(ctx, plan.LeftoverEvent{LeftoverID: id, RecipeID: l.RecipeID, Kind: plan.EventTookOut,
			Portions: l.Portions, On: in.today, StoragePlaceID: storagePlaceID, UserID: userID}); err != nil {
			return nil, err
		}
		res.Leftover, err = reload(ctx, st, id)
		return nil, err
	})
	return res, err
}

// Answer settles a Leftover that is past its Use-by. ErrNotFound, ErrInvalidAnswer, ErrLeftoverNotToAnswer.
// Had it takes every portion left with no waste; Threw it out does the same and records the waste (plan.ThrownOutOn);
// Wasn't there removes the row. Every Planned Meal served from it is unpinned and planned again.
func (r *Runner) Answer(ctx context.Context, id int64, answer plan.LeftoverAnswer, userID int64) error {
	if !answer.Valid() {
		return ErrInvalidAnswer
	}
	_, err := r.write(ctx, plan.ReasonLeftoversChanged, runOpts{}, func(tx *sql.Tx, st *store.Store) (func(), error) {
		in, err := r.info(ctx)
		if err != nil {
			return nil, err
		}
		l, err := availableLeftover(ctx, st, id)
		if err != nil {
			return nil, err
		}
		if !plan.IsToAnswer(l, in.today) {
			return nil, ErrLeftoverNotToAnswer
		}
		rec := r.newWasteRecorder(tx)
		if err := rec.wasteOf(ctx, answer, l, l.Portions, in.today); err != nil {
			return nil, err
		}
		switch answer {
		case plan.AnswerWasntThere:
			// Unpin first: the link to the Planned Meals goes with the row.
			if _, err := r.unpinLeftoverMisfits(ctx, st, id, 0, in); err != nil {
				return nil, err
			}
			if err := st.AddLeftoverEvent(ctx, plan.LeftoverEvent{LeftoverID: id, RecipeID: l.RecipeID, Kind: plan.EventWasntThere,
				Portions: l.Portions, On: in.today, UserID: userID}); err != nil {
				return nil, err
			}
			if err := st.DeleteLeftover(ctx, id); err != nil {
				return nil, mapStoreErr(err)
			}
		default:
			kind := plan.EventHadIt
			if answer == plan.AnswerThrewOut {
				kind = plan.EventThrewOut
			}
			if _, err := takeOff(ctx, st, l, l.Portions, kind, userID, in.today); err != nil {
				return nil, err
			}
			if _, err := r.unpinLeftoverMisfits(ctx, st, id, 0, in); err != nil {
				return nil, err
			}
		}
		return rec.after(ctx), nil
	})
	return err
}

// UseLeftover pins a Leftover, frozen or not, as the Planned Meal of a Course ("From the freezer" in Choose a Recipe).
// The rest of SetCourseMeal's checks apply (ErrUnknownSlot, ErrInPast, ErrNotServed, ErrAlreadyResolved,
// ErrCourseNotInSlot, ErrRecipeNotInCourse, ErrRecipeInSlot) plus ErrNotFound, ErrLeftoverPastUseBy (the Use-by is
// before the meal's date) and ErrLeftoverTooSmall.
func (r *Runner) UseLeftover(ctx context.Context, key plan.Key, leftoverID int64) (plan.Meal, error) {
	res, err := r.setCell(ctx, key, 0, nil, leftoverID)
	return res.Meal, err
}

// availableLeftover is the Leftover of id when it is still available; ErrNotFound otherwise.
func availableLeftover(ctx context.Context, st *store.Store, id int64) (plan.Leftover, error) {
	l, err := st.Leftover(ctx, id)
	if err != nil {
		return plan.Leftover{}, mapStoreErr(err)
	}
	if l.Status != plan.LeftoverAvailable {
		return plan.Leftover{}, ErrNotFound
	}
	return l, nil
}

// reload reads a Leftover after the action changed it, inside its transaction.
func reload(ctx context.Context, st *store.Store, id int64) (plan.Leftover, error) {
	l, err := st.Leftover(ctx, id)
	return l, mapStoreErr(err)
}

// storagePlaceOf is the Storage Place of id; ErrUnknownStoragePlace when there is none.
func storagePlaceOf(ctx context.Context, st *store.Store, id int64) (plan.StoragePlace, error) {
	p, err := st.StoragePlace(ctx, id)
	if errors.Is(err, store.ErrNotFound) {
		return plan.StoragePlace{}, ErrUnknownStoragePlace
	}
	return p, err
}

// placeName is the name of a Storage Place for a view; "" when it has none or it no longer exists.
func (r *Runner) placeName(ctx context.Context, id int64) (string, error) {
	if id == 0 {
		return "", nil
	}
	p, err := r.d.Store.StoragePlace(ctx, id)
	if errors.Is(err, store.ErrNotFound) {
		return "", nil
	}
	return p.Name, err
}

// takeOff takes portions off a Leftover and records the hand action as an event dated on. It returns what stays.
func takeOff(ctx context.Context, st *store.Store, l plan.Leftover, portions float64, kind plan.LeftoverEventKind,
	userID int64, on string) (float64, error) {
	left := l.Portions - portions
	if left < 1e-9 {
		left = 0
	}
	if err := st.SetLeftoverPortions(ctx, l.ID, left); err != nil {
		return 0, mapStoreErr(err)
	}
	if err := st.AddLeftoverEvent(ctx, plan.LeftoverEvent{LeftoverID: l.ID, RecipeID: l.RecipeID, Kind: kind,
		Portions: portions, On: on, UserID: userID}); err != nil {
		return 0, err
	}
	return left, nil
}

// leftoverMisfits lists the Planned Meals served from the Leftover id that no longer get their portions when only
// remaining stay on it, in the order they are served (plan.MisfitDependants). Pinned or not.
func (r *Runner) leftoverMisfits(ctx context.Context, st *store.Store, id int64, remaining float64, in info) ([]plan.Key, error) {
	deps, err := st.DependantsOfLeftover(ctx, id)
	if err != nil {
		return nil, err
	}
	ds := make([]plan.Dependant, 0, len(deps))
	for _, m := range deps {
		at, _, err := r.slotAt(ctx, in, m.Key)
		if err != nil {
			return nil, err
		}
		ds = append(ds, plan.Dependant{Key: m.Key, At: at, Portions: m.Portions, Pinned: m.Pinned})
	}
	return plan.MisfitDependants(remaining, ds), nil
}

// unpinLeftoverMisfits unpins the misfits of leftoverMisfits; the planning run that follows the write plans them again.
// It returns them.
func (r *Runner) unpinLeftoverMisfits(ctx context.Context, st *store.Store, id int64, remaining float64, in info) ([]plan.Key, error) {
	ks, err := r.leftoverMisfits(ctx, st, id, remaining, in)
	if err != nil {
		return nil, err
	}
	for _, k := range ks {
		if err := st.SetPinned(ctx, k, false); err != nil && !errors.Is(err, store.ErrNotFound) {
			return nil, err
		}
	}
	return ks, nil
}

// claimsOf is the portions the Planned Meals served from a Leftover are planned to use.
func claimsOf(deps []plan.Meal) float64 {
	ds := make([]plan.Dependant, 0, len(deps))
	for _, m := range deps {
		ds = append(ds, plan.Dependant{Key: m.Key, Portions: m.Portions})
	}
	return plan.PlannedClaims(ds)
}

// wasteRecorder records the waste of a Leftover action: inside the action's transaction when the Stock adapter can
// (TxWaster, then the runner publishes the stock change after the commit), else after the commit.
type wasteRecorder struct {
	r        *Runner
	tx       *sql.Tx
	txWaster TxWaster
	inTx     bool
	deferred []LeftoverWaste
}

func (r *Runner) newWasteRecorder(tx *sql.Tx) *wasteRecorder {
	w := &wasteRecorder{r: r, tx: tx}
	w.txWaster, _ = r.d.Stock.(TxWaster)
	return w
}

// wasteOf records the waste of portions of l answered or thrown out on today, if plan.ThrownOutOn says it is waste.
func (w *wasteRecorder) wasteOf(ctx context.Context, answer plan.LeftoverAnswer, l plan.Leftover, portions float64, today string) error {
	on, waste := plan.ThrownOutOn(answer, l.UseBy, today)
	if !waste {
		return nil
	}
	lw := LeftoverWaste{LeftoverID: l.ID, RecipeID: int64(l.RecipeID), Portions: portions, On: on}
	if w.txWaster != nil {
		if err := w.txWaster.RecordLeftoverWasteTx(ctx, w.tx, lw); err != nil {
			return err
		}
		w.inTx = true
		return nil
	}
	w.deferred = append(w.deferred, lw)
	return nil
}

// after returns what runs once the transaction is committed: the stock change of the in-transaction waste, and the
// waste the adapter records after the commit (a failure there is logged; the Leftover action stays done).
func (w *wasteRecorder) after(ctx context.Context) func() {
	return func() {
		if w.inTx && w.r.d.Events != nil {
			w.r.d.Events.Publish("stock", map[string]any{"changed": "waste"})
		}
		for _, lw := range w.deferred {
			if err := w.r.d.Stock.RecordLeftoverWaste(ctx, lw); err != nil {
				w.r.d.Logger.Error("recording Leftover waste failed", "leftover", lw.LeftoverID, "err", err)
			}
		}
	}
}
