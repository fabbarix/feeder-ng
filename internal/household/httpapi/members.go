package httpapi

import (
	"net/http"

	"github.com/fabbarix/feeder-ng/internal/household"
	"github.com/fabbarix/feeder-ng/internal/httpx"
)

// memberBody is a Member as the API shows them.
type memberBody struct {
	ID            int64   `json:"id"`
	Name          string  `json:"name"`
	Colour        string  `json:"colour"`
	Avatar        string  `json:"avatar"`
	PortionFactor float64 `json:"portionFactor"`
	UserID        *int64  `json:"userId"`
	Email         *string `json:"email"`
}

func memberOut(m household.Member) memberBody {
	b := memberBody{ID: m.ID, Name: m.Name, Colour: m.Colour, Avatar: m.Avatar, PortionFactor: m.PortionFactor, UserID: m.UserID}
	if m.Email != "" {
		e := m.Email
		b.Email = &e
	}
	return b
}

// memberIn is what an Admin sends to create or change a Member.
type memberIn struct {
	Name          string  `json:"name"`
	Colour        string  `json:"colour"`
	Avatar        string  `json:"avatar"`
	PortionFactor float64 `json:"portionFactor"`
	Email         string  `json:"email"`
}

// input decodes and validates a memberIn, returning the normalised input.
func (in memberIn) input() (household.MemberInput, error) {
	m := household.MemberInput{Name: in.Name, Colour: in.Colour, Avatar: in.Avatar, PortionFactor: in.PortionFactor, Email: in.Email}.Normalized()
	return m, m.Validate()
}

func (a *api) listMembers(w http.ResponseWriter, r *http.Request) {
	list, err := a.st.Members(r.Context())
	if err != nil {
		writeErr(w, err)
		return
	}
	out := make([]memberBody, 0, len(list))
	for _, m := range list {
		out = append(out, memberOut(m))
	}
	httpx.WriteJSON(w, http.StatusOK, out)
}

func (a *api) createMember(w http.ResponseWriter, r *http.Request) {
	var in memberIn
	if err := httpx.DecodeJSON(r, &in); err != nil {
		writeErr(w, err)
		return
	}
	v, err := in.input()
	if err != nil {
		writeErr(w, err)
		return
	}
	if err := a.checkEmail(r.Context(), v.Email, nil); err != nil {
		memberErr(w, err)
		return
	}
	m, err := a.st.CreateMember(r.Context(), v)
	if err != nil {
		memberErr(w, err)
		return
	}
	a.changed("members")
	httpx.WriteJSON(w, http.StatusCreated, memberOut(m))
}

func (a *api) updateMember(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(r)
	if !ok {
		writeErr(w, household.ErrNotFound)
		return
	}
	var in memberIn
	if err := httpx.DecodeJSON(r, &in); err != nil {
		writeErr(w, err)
		return
	}
	v, err := in.input()
	if err != nil {
		writeErr(w, err)
		return
	}
	cur, err := a.st.Member(r.Context(), id)
	if err != nil {
		writeErr(w, err)
		return
	}
	if err := a.checkEmail(r.Context(), v.Email, cur.UserID); err != nil {
		memberErr(w, err)
		return
	}
	m, err := a.st.UpdateMember(r.Context(), id, v)
	if err != nil {
		memberErr(w, err)
		return
	}
	a.changed("members")
	httpx.WriteJSON(w, http.StatusOK, memberOut(m))
}

func (a *api) deleteMember(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(r)
	if !ok {
		writeErr(w, household.ErrNotFound)
		return
	}
	if err := a.st.DeleteMember(r.Context(), id); err != nil {
		writeErr(w, err)
		return
	}
	a.changed("members")
	w.WriteHeader(http.StatusNoContent)
}

func (a *api) linkUser(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(r)
	if !ok {
		writeErr(w, household.ErrNotFound)
		return
	}
	var in struct {
		UserID *int64 `json:"userId"`
	}
	if err := httpx.DecodeJSON(r, &in); err != nil {
		writeErr(w, err)
		return
	}
	m, err := a.st.LinkUser(r.Context(), id, in.UserID)
	if err != nil {
		writeErr(w, err)
		return
	}
	a.changed("members")
	httpx.WriteJSON(w, http.StatusOK, memberOut(m))
}
