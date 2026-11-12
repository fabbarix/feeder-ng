package httpapi

import (
	"net/http"

	"github.com/fabbarix/feeder-ng/internal/httpx"
)

// A Meal Slot on one date (ADR 0014; spec §18; docs/dev/design/b5-sd.md):
//
//	GET   /api/meal-slots/{id}/dates/{date}            -> { date, notServed, time, usualTime, guests }
//	PATCH /api/meal-slots/{id}/dates/{date}[?dryRun=1] -> the same, or { removes: { plannedMeals: [...] } } for a dry run
//
// Every User. TEST-FIRST STUBS (team B5-SD, designer): the handlers answer 501 until the developer writes them.

func (a *api) getSlotDate(w http.ResponseWriter, r *http.Request) {
	httpx.WriteError(w, http.StatusNotImplemented, "not_implemented", "slot dates are not implemented yet")
}

func (a *api) patchSlotDate(w http.ResponseWriter, r *http.Request) {
	httpx.WriteError(w, http.StatusNotImplemented, "not_implemented", "slot dates are not implemented yet")
}
