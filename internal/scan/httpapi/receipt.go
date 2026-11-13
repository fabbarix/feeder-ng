package httpapi

import (
	"context"
	"database/sql"
	"sync"

	"github.com/fabbarix/feeder-ng/internal/app"
	"github.com/fabbarix/feeder-ng/internal/receipt"
	"github.com/fabbarix/feeder-ng/internal/scan/service"
)

// The receipt apply (RR3) runs its plan on the scan module's own service, so it shares the one scan lock with every
// scan route. This file holds the handle the receipt module uses; the receipt module imports this package, never the
// other way round.

var (
	servicesMu sync.Mutex
	services   = map[*sql.DB]*service.Service{}
)

// ServiceFor returns the one scan service of d.DB: the scan routes and the receipt apply share its mutex.
func ServiceFor(d app.Deps) *service.Service {
	servicesMu.Lock()
	defer servicesMu.Unlock()
	if s, ok := services[d.DB]; ok {
		return s
	}
	s := newService(d)
	services[d.DB] = s
	return s
}

// ReceiptApplier is the scan side of the receipt apply: the session's events (the read and the apply load them the same
// way) and the service that runs the plan.
type ReceiptApplier struct{ svc *service.Service }

// NewReceiptApplier returns the applier over d's scan service.
func NewReceiptApplier(d app.Deps) *ReceiptApplier {
	return &ReceiptApplier{svc: ServiceFor(d)}
}

// Service is the scan service the plan runs on (the same one as the scan routes).
func (a *ReceiptApplier) Service() *service.Service { return a.svc }

// SessionEvents are the live Shop scans of uuids at shopID, in ledger order.
func (a *ReceiptApplier) SessionEvents(ctx context.Context, shopID int64, uuids []string) ([]receipt.ScanEvent, error) {
	return a.svc.SessionEvents(ctx, shopID, uuids)
}
