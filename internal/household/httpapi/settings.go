package httpapi

import (
	"encoding/json"
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
	// EarliestStart is "HH:MM", or null when Off (PC-14).
	EarliestStart *string `json:"earliestStart"`
	// LatestStart is "HH:MM", or null when Off (A2).
	LatestStart *string `json:"latestStart"`
	SetupHidden bool    `json:"setupHidden"`
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
		SetupHidden:              s.SetupHidden,
	}
	out.EarliestStart = timeOrNull(s.EarliestStart)
	out.LatestStart = timeOrNull(s.LatestStart)
	if loc := s.Location; loc != nil {
		out.Location = &locationBody{City: loc.City, Latitude: loc.Latitude, Longitude: loc.Longitude}
	}
	return out
}

// timeOrNull is nil (JSON null, Off) for "" and the time otherwise.
func timeOrNull(hhmm string) *string {
	if hhmm == "" {
		return nil
	}
	return &hhmm
}

// optionalTime is a tri-state JSON field: left out (Set false), null (Set, Value nil: Off) or an "HH:MM" string.
type optionalTime struct {
	Set   bool
	Value *string
}

func (o *optionalTime) UnmarshalJSON(b []byte) error {
	o.Set = true
	o.Value = nil
	if string(b) == "null" {
		return nil
	}
	var v string
	if err := json.Unmarshal(b, &v); err != nil {
		return err
	}
	o.Value = &v
	return nil
}

// or is the value the save leaves: current when the field was left out, "" (Off) for null, else the sent time.
func (o optionalTime) or(current string) string {
	switch {
	case !o.Set:
		return current
	case o.Value == nil:
		return ""
	}
	return *o.Value
}

// settingsIn is what an Admin sends. timeZoneConfigured is not accepted: saving marks it. FrozenUseByDays is a pointer:
// a save without it (a client older than beta.5) keeps the stored value. EarliestStart and SetupHidden work the same
// way for a client older than beta.9, and LatestStart too; an explicit null EarliestStart or LatestStart turns it Off.
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
	EarliestStart            optionalTime   `json:"earliestStart"`
	LatestStart              optionalTime   `json:"latestStart"`
	SetupHidden              *bool          `json:"setupHidden"`
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
	s.EarliestStart = in.EarliestStart.or(current.EarliestStart)
	s.LatestStart = in.LatestStart.or(current.LatestStart)
	s.SetupHidden = current.SetupHidden
	if in.SetupHidden != nil {
		s.SetupHidden = *in.SetupHidden
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
