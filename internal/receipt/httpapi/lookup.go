package httpapi

import (
	"context"
	"errors"

	"github.com/fabbarix/feeder-ng/internal/receipt/service"
)

// readLookup is the apply's ReadLookup over the read service's jobs (design §7.2 step 1): the module's mount sets it
// with SetReadLookup, so the apply finds the reads the read routes made.
type readLookup struct{ svc *service.Service }

// Lookup maps the read service's answers to the apply's: gone, not done, unavailable, or the done read.
func (l readLookup) Lookup(ctx context.Context, userID int64, readID string) (ApplyRead, error) {
	v, err := l.svc.DoneRead(ctx, userID, readID)
	var un *service.Unavailable
	switch {
	case errors.Is(err, service.ErrReadGone):
		return ApplyRead{}, ErrReadGone
	case errors.Is(err, service.ErrReadNotDone):
		return ApplyRead{}, ErrReadNotDone
	case errors.As(err, &un):
		return ApplyRead{}, &UnavailableError{Reason: un.Reason}
	case err != nil:
		return ApplyRead{}, err
	}
	return ApplyRead{ID: v.ID, ShopID: v.ShopID, Fingerprint: v.Fingerprint, Rows: v.Rows, Ctx: v.Ctx,
		Proposals: v.Result.Proposals}, nil
}
