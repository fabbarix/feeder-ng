package runner

import (
	"context"
	"errors"

	"github.com/fabbarix/feeder-ng/internal/plan"
)

// Leftovers by hand (ADR 0012, docs/dev/design/b5-lo.md §5). STUBS for the test commit: the Developer implements every
// method; leftover_test.go is red until then.

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

	errLeftoverNotBuilt = errors.New("b5-lo: not implemented yet")
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

// LeftoverViews lists the available Leftovers with portions left, soonest Use-by first: frozen ones and ones to answer too.
func (r *Runner) LeftoverViews(ctx context.Context) ([]LeftoverView, error) {
	return nil, errLeftoverNotBuilt
}

// LosingOut lists the Planned Meals, Pinned or not, served from the Leftover that would lose their portions if only
// remaining portions stayed on it (plan.MisfitDependants), in the order they are served. It writes nothing: the sheets
// and the API's ?dryRun=1 name these meals before the User confirms. ErrNotFound.
func (r *Runner) LosingOut(ctx context.Context, id int64, remaining float64) ([]plan.Key, error) {
	return nil, errLeftoverNotBuilt
}

// HadIt takes portions off a Leftover: portions had outside the plan, not waste. ErrNotFound, plan.ErrPortionsInvalid.
func (r *Runner) HadIt(ctx context.Context, id int64, portions float64, userID int64) (LeftoverResult, error) {
	return LeftoverResult{}, errLeftoverNotBuilt
}

// ThrewOut takes portions off a Leftover and records them as waste dated plan.ThrownOutOn. ErrNotFound, plan.ErrPortionsInvalid.
func (r *Runner) ThrewOut(ctx context.Context, id int64, portions float64, userID int64) (LeftoverResult, error) {
	return LeftoverResult{}, errLeftoverNotBuilt
}

// Freeze moves a Leftover (portions nil: all of it) to a Freezer. ErrNotFound, plan.ErrPortionsInvalid,
// ErrLeftoverPastUseBy, ErrLeftoverFrozen, ErrUnknownStoragePlace, ErrStoragePlaceNotFreezer.
func (r *Runner) Freeze(ctx context.Context, id, storagePlaceID int64, portions *float64, userID int64) (FreezeResult, error) {
	return FreezeResult{}, errLeftoverNotBuilt
}

// TakeOut takes a frozen Leftover out of the Freezer into storagePlaceID (0: Not sorted). ErrNotFound,
// ErrLeftoverNotFrozen, ErrUnknownStoragePlace, ErrStoragePlaceFreezer.
func (r *Runner) TakeOut(ctx context.Context, id, storagePlaceID int64, userID int64) (LeftoverResult, error) {
	return LeftoverResult{}, errLeftoverNotBuilt
}

// Answer settles a Leftover that is past its Use-by. ErrNotFound, ErrInvalidAnswer, ErrLeftoverNotToAnswer.
func (r *Runner) Answer(ctx context.Context, id int64, answer plan.LeftoverAnswer, userID int64) error {
	return errLeftoverNotBuilt
}

// UseLeftover pins a Leftover, frozen or not, as the Planned Meal of a Course ("From the freezer" in Choose a Recipe).
// The rest of SetCourseMeal's checks apply (ErrUnknownSlot, ErrInPast, ErrNotServed, ErrAlreadyResolved,
// ErrCourseNotInSlot, ErrRecipeNotInCourse, ErrRecipeInSlot) plus ErrNotFound, ErrLeftoverPastUseBy (the Use-by is
// before the meal's date) and ErrLeftoverTooSmall.
func (r *Runner) UseLeftover(ctx context.Context, key plan.Key, leftoverID int64) (plan.Meal, error) {
	return plan.Meal{}, errLeftoverNotBuilt
}
