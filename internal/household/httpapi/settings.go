package httpapi

import (
	"net/http"

	"github.com/fabbarix/feeder-ng/internal/household"
	"github.com/fabbarix/feeder-ng/internal/httpx"
)

type locationBody struct {
	City      string   `json:"city,omitempty"`
	Latitude  *float64 `json:"latitude,omitempty"`
	Longitude *float64 `json:"longitude,omitempty"`
}

type quietHoursBody struct {
	Start string `json:"start"`
	End   string `json:"end"`
}

// settingsBody is the Household's settings as the API shows them.
type settingsBody struct {
	TimeZone                 string         `json:"timeZone"`
	TimeZoneConfigured       bool           `json:"timeZoneConfigured"`
	PlanningHorizonDays      int            `json:"planningHorizonDays"`
	DefaultCooldownDays      int            `json:"defaultCooldownDays"`
	DefaultLeftoverUseByDays int            `json:"defaultLeftoverUseByDays"`
	FrozenUseByDays          int            `json:"frozenUseByDays"`
	QuietHours               quietHoursBody `json:"quietHours"`
	PlannerStyle             float64        `json:"plannerStyle"`
	Location                 *locationBody  `json:"location"`
	Currency                 string         `json:"currency"`
}

func settingsOut(s household.Settings) settingsBody {
	out := settingsBody{
		TimeZone:                 s.TimeZone,
		TimeZoneConfigured:       s.TimeZoneConfigured,
		PlanningHorizonDays:      s.PlanningHorizonDays,
		DefaultCooldownDays:      s.DefaultCooldownDays,
		DefaultLeftoverUseByDays: s.DefaultLeftoverUseByDays,
		FrozenUseByDays:          s.FrozenUseByDays,
		QuietHours:               quietHoursBody{Start: s.QuietHours.Start, End: s.QuietHours.End},
		PlannerStyle:             s.PlannerStyle,
		Currency:                 s.Currency,
	}
	if loc := s.Location; loc != nil {
		out.Location = &locationBody{City: loc.City, Latitude: loc.Latitude, Longitude: loc.Longitude}
	}
	return out
}

// settingsIn is what an Admin sends. timeZoneConfigured is not accepted: saving marks it. FrozenUseByDays is a pointer:
// a save without it (a client older than beta.5) keeps the stored value.
type settingsIn struct {
	TimeZone                 string         `json:"timeZone"`
	PlanningHorizonDays      int            `json:"planningHorizonDays"`
	DefaultCooldownDays      int            `json:"defaultCooldownDays"`
	DefaultLeftoverUseByDays int            `json:"defaultLeftoverUseByDays"`
	FrozenUseByDays          *int           `json:"frozenUseByDays"`
	QuietHours               quietHoursBody `json:"quietHours"`
	PlannerStyle             float64        `json:"plannerStyle"`
	Location                 *locationBody  `json:"location"`
	Currency                 string         `json:"currency"`
}

func (in settingsIn) toDomain() household.Settings {
	s := household.Settings{
		TimeZone:                 in.TimeZone,
		TimeZoneConfigured:       true,
		PlanningHorizonDays:      in.PlanningHorizonDays,
		DefaultCooldownDays:      in.DefaultCooldownDays,
		DefaultLeftoverUseByDays: in.DefaultLeftoverUseByDays,
		QuietHours:               household.QuietHours{Start: in.QuietHours.Start, End: in.QuietHours.End},
		PlannerStyle:             in.PlannerStyle,
		Currency:                 in.Currency,
	}
	if in.Location != nil {
		s.Location = &household.Location{City: in.Location.City, Latitude: in.Location.Latitude, Longitude: in.Location.Longitude}
	}
	return s
}

func (a *api) getSettings(w http.ResponseWriter, r *http.Request) {
	s, err := a.st.Settings(r.Context())
	if err != nil {
		writeErr(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, settingsOut(s))
}

func (a *api) putSettings(w http.ResponseWriter, r *http.Request) {
	var in settingsIn
	if err := httpx.DecodeJSON(r, &in); err != nil {
		writeErr(w, err)
		return
	}
	current, err := a.st.Settings(r.Context())
	if err != nil {
		writeErr(w, err)
		return
	}
	s := in.toDomain()
	s.FrozenUseByDays = current.FrozenUseByDays
	if in.FrozenUseByDays != nil {
		s.FrozenUseByDays = *in.FrozenUseByDays
	}
	s = s.Normalized()
	if err := s.Validate(); err != nil {
		writeErr(w, err)
		return
	}
	if err := a.st.SaveSettings(r.Context(), s); err != nil {
		writeErr(w, err)
		return
	}
	a.changed("settings")
	httpx.WriteJSON(w, http.StatusOK, settingsOut(s))
}
