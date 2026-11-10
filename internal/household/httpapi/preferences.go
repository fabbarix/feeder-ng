package httpapi

import (
	"net/http"

	"github.com/fabbarix/feeder-ng/internal/household"
	"github.com/fabbarix/feeder-ng/internal/httpx"
)

// prefsBody is one User's preferences as the API shows them.
type prefsBody struct {
	Scheme string `json:"scheme"`
	Accent string `json:"accent"`
	Units  string `json:"units"`
}

func prefsOut(p household.Preferences) prefsBody {
	return prefsBody{Scheme: p.Scheme, Accent: p.Accent, Units: p.Units}
}

func (a *api) getPreferences(w http.ResponseWriter, r *http.Request) {
	p, err := a.st.Preferences(r.Context(), currentUser(r).ID)
	if err != nil {
		writeErr(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, prefsOut(p))
}

func (a *api) putPreferences(w http.ResponseWriter, r *http.Request) {
	var in prefsBody
	if err := httpx.DecodeJSON(r, &in); err != nil {
		writeErr(w, err)
		return
	}
	p := household.Preferences{Scheme: in.Scheme, Accent: in.Accent, Units: in.Units}
	if err := p.Validate(); err != nil {
		writeErr(w, err)
		return
	}
	if err := a.st.SavePreferences(r.Context(), currentUser(r).ID, p); err != nil {
		writeErr(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, prefsOut(p))
}
