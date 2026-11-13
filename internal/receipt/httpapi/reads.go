package httpapi

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"time"

	"github.com/fabbarix/feeder-ng/internal/auth"
	"github.com/fabbarix/feeder-ng/internal/httpx"
	"github.com/fabbarix/feeder-ng/internal/receipt/service"
	"github.com/fabbarix/feeder-ng/internal/recipeassistant"
	rasvc "github.com/fabbarix/feeder-ng/internal/recipeassistant/service"
)

// photoBodyLimit is the most a read request body may be (design §7.1): 4 photos of at most 8 MB, as data URLs.
const (
	photoBodyLimit = 45 << 20
	// drainBytes and drainTime bound how much of a refused body is swallowed after the answer went out.
	drainBytes = 8 << 20
	drainTime  = 2 * time.Second
)

func caller(r *http.Request) recipeassistant.Caller {
	u, _ := auth.UserFrom(r.Context())
	return recipeassistant.Caller{UserID: u.ID, HouseholdID: 1, Admin: u.IsAdmin}
}

// startBody is POST /api/scan/receipt/reads.
type startBody struct {
	ShopID      int64     `json:"shopId"`
	ClientUUIDs []string  `json:"clientUuids"`
	Photos      []photoIn `json:"photos"`
}

// photoIn is one photo: a data URL. An address is parsed so that it is refused as photo_unsupported (422), not as a
// malformed body.
type photoIn struct {
	DataURL string `json:"dataUrl"`
	URL     string `json:"url"`
}

// start handles POST /api/scan/receipt/reads. Before the body is read: the assistant can read (409) and the User may
// start a read (409, 429). Then the body, the photos and the session (in the service).
func (a *api) start(w http.ResponseWriter, r *http.Request) {
	// A refusal is sent before the body is read. Reading on while answering (full duplex) and swallowing a bounded
	// part of the rest after the answer lets the client receive the refusal instead of a reset connection.
	rc := http.NewResponseController(w)
	_ = rc.EnableFullDuplex()
	defer func() {
		if f, ok := w.(http.Flusher); ok {
			f.Flush()
		}
		_ = rc.SetReadDeadline(time.Now().Add(drainTime))
		_, _ = io.CopyN(io.Discard, r.Body, drainBytes)
	}()
	c := caller(r)
	if err := a.svc.Available(r.Context()); err != nil {
		writeStartError(w, err)
		return
	}
	if err := a.svc.Check(c); err != nil {
		writeStartError(w, err)
		return
	}
	if r.ContentLength > photoBodyLimit {
		httpx.WriteError(w, http.StatusRequestEntityTooLarge, "request_too_large", "The request is too large")
		return
	}
	raw, err := io.ReadAll(io.LimitReader(r.Body, photoBodyLimit+1))
	if err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "bad_request", "The request body must be JSON")
		return
	}
	if len(raw) > photoBodyLimit {
		httpx.WriteError(w, http.StatusRequestEntityTooLarge, "request_too_large", "The request is too large")
		return
	}
	var body startBody
	if err := json.Unmarshal(raw, &body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "bad_request", "The request body must be JSON")
		return
	}
	in := service.ReadInput{ShopID: body.ShopID, ClientUUIDs: body.ClientUUIDs}
	for _, p := range body.Photos {
		in.Photos = append(in.Photos, rasvc.PhotoInput{DataURL: p.DataURL, URL: p.URL})
	}
	jv, err := a.svc.Start(c, in)
	if err != nil {
		writeStartError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusAccepted, map[string]string{"id": jv.ID, "status": string(jv.Status)})
}

// writeStartError answers a refusal: 409 with the reason when the assistant cannot read, 409 or 429 for the Limiter,
// 422 for a photo or the session, and 500 for anything else.
func writeStartError(w http.ResponseWriter, err error) {
	var u *service.Unavailable
	if errors.As(err, &u) {
		httpx.WriteJSON(w, http.StatusConflict, map[string]any{"error": map[string]any{
			"code": service.CodeAssistantUnavailable, "message": service.Message(service.CodeAssistantUnavailable), "reason": u.Reason,
		}})
		return
	}
	var ae *recipeassistant.Error
	if !errors.As(err, &ae) {
		httpx.WriteAPIError(w, err)
		return
	}
	body := map[string]any{"code": ae.Code, "message": service.Message(ae.Code)}
	if ae.Code == recipeassistant.CodeTooManyReads {
		body["retryAfterSeconds"] = ae.RetryAfterSeconds
	}
	httpx.WriteJSON(w, startStatus(ae.Code), map[string]any{"error": body})
}

func startStatus(code string) int {
	switch code {
	case recipeassistant.CodeReadInProgress:
		return http.StatusConflict
	case recipeassistant.CodeTooManyReads:
		return http.StatusTooManyRequests
	}
	return http.StatusUnprocessableEntity
}

// get handles GET /api/scan/receipt/reads/{id}: the read's state, and when it is done its fingerprint, rows,
// proposals, notes, totals and warnings. 404 for an unknown read or another User's.
func (a *api) get(w http.ResponseWriter, r *http.Request) {
	user, _ := auth.UserFrom(r.Context())
	jv, ok := a.svc.Job(user.ID, r.PathValue("id"))
	if !ok {
		httpx.WriteError(w, http.StatusNotFound, "not_found", "Not found")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, readBody(jv))
}

// cancel handles DELETE /api/scan/receipt/reads/{id}: 204 for a running or finished read of the caller, 404 otherwise.
func (a *api) cancel(w http.ResponseWriter, r *http.Request) {
	user, _ := auth.UserFrom(r.Context())
	if !a.svc.Cancel(user.ID, r.PathValue("id")) {
		httpx.WriteError(w, http.StatusNotFound, "not_found", "Not found")
		return
	}
	writeNoContent(w)
}
