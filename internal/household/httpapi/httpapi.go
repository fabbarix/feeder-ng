// Package httpapi exposes the household module's routes (settings, Members,
// Meal Slots, Attendance, per-User preferences). Handlers only parse, call the
// household package and store, and respond.
package httpapi

import (
	"errors"
	"net/http"

	"github.com/fabbarix/feeder-ng/internal/app"
	"github.com/fabbarix/feeder-ng/internal/auth"
	"github.com/fabbarix/feeder-ng/internal/household"
	"github.com/fabbarix/feeder-ng/internal/household/store"
	"github.com/fabbarix/feeder-ng/internal/httpx"
)

func init() { app.Register(app.Module{Name: "household", Mount: mount}) }

// topic is the live-update topic for every household change.
const topic = "household"

// api bundles what the handlers need.
type api struct {
	d  app.Deps
	st *store.Store
}

func mount(r *app.Router, d app.Deps) {
	a := &api{d: d, st: store.New(d.DB, d.Clock)}

	r.User("GET /api/household/settings", a.getSettings)
	r.Admin("PUT /api/household/settings", a.putSettings)

	r.User("GET /api/members", a.listMembers)
	r.Admin("POST /api/members", a.createMember)
	r.Admin("PATCH /api/members/{id}", a.updateMember)
	r.Admin("DELETE /api/members/{id}", a.deleteMember)
	r.Admin("PUT /api/members/{id}/user", a.linkUser)

	r.User("GET /api/meal-slots", a.listSlots)
	r.Admin("POST /api/meal-slots", a.createSlot)
	r.Admin("PATCH /api/meal-slots/batch", a.updateSlotsBatch)
	r.Admin("PATCH /api/meal-slots/{id}", a.updateSlot)
	r.Admin("DELETE /api/meal-slots/{id}", a.deleteSlot)

	r.User("GET /api/meal-slots/{id}/attendance", a.getAttendance)
	r.User("PUT /api/meal-slots/{id}/attendance", a.putAttendance)
	r.User("DELETE /api/meal-slots/{id}/attendance", a.deleteAttendance)

	r.User("GET /api/me/preferences", a.getPreferences)
	r.User("PUT /api/me/preferences", a.putPreferences)
}

// writeErr maps domain, store and validation errors to the API's error codes.
func writeErr(w http.ResponseWriter, err error) {
	var ve *household.ValidationError
	switch {
	case errors.As(err, &ve):
		httpx.WriteError(w, http.StatusUnprocessableEntity, "validation_failed", ve.Error())
	case errors.Is(err, household.ErrNotFound):
		httpx.WriteError(w, http.StatusNotFound, "not_found", "Not found")
	case errors.Is(err, household.ErrDuplicateSlot):
		httpx.WriteError(w, http.StatusConflict, "duplicate_slot", "A Meal Slot with that name already exists on that weekday")
	case errors.Is(err, household.ErrNoMatchingSlot):
		httpx.WriteError(w, http.StatusUnprocessableEntity, "no_matching_slot", "No Meal Slot with that name on the chosen weekdays")
	case errors.Is(err, household.ErrUserLinked):
		httpx.WriteError(w, http.StatusConflict, "user_already_linked", "That User is already linked to another Member")
	case errors.Is(err, household.ErrUnknownMember):
		httpx.WriteError(w, http.StatusUnprocessableEntity, "unknown_member", "That Member does not exist")
	case errors.Is(err, household.ErrDuplicateAttendee):
		httpx.WriteError(w, http.StatusUnprocessableEntity, "duplicate_attendee", "A Member can only be listed once")
	case errors.Is(err, household.ErrWeekdayMismatch):
		httpx.WriteError(w, http.StatusUnprocessableEntity, "weekday_mismatch", "That date is not on this Meal Slot's weekday")
	default:
		httpx.WriteAPIError(w, err)
	}
}

// changed publishes a household change so open screens refresh.
func (a *api) changed(what string) {
	a.d.Events.Publish(topic, map[string]string{"changed": what})
}

// currentUser returns the signed-in User (routes guarded by RequireUser).
func currentUser(r *http.Request) auth.User {
	u, _ := auth.UserFrom(r.Context())
	return u
}
