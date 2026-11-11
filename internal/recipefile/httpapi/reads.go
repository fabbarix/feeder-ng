package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"time"

	"github.com/fabbarix/feeder-ng/internal/auth"
	"github.com/fabbarix/feeder-ng/internal/httpx"
	"github.com/fabbarix/feeder-ng/internal/recipeassistant"
	"github.com/fabbarix/feeder-ng/internal/recipeassistant/service"
	"github.com/fabbarix/feeder-ng/internal/recipefile"
)

// Request body limits of the reads route (design §7): a body is cut at textBodyLimit unless its first JSON key
// is "photos", when photoBodyLimit applies; a Content-Length above photoBodyLimit is refused unread.
const (
	textBodyLimit  = 256 << 10
	photoBodyLimit = 45 << 20
	// drainBytes and drainTime bound how much of a refused body is swallowed after the answer went out.
	drainBytes = 8 << 20
	drainTime  = 2 * time.Second
)

func caller(r *http.Request) recipeassistant.Caller {
	u, _ := auth.UserFrom(r.Context())
	return recipeassistant.Caller{UserID: u.ID, HouseholdID: 1, Admin: u.IsAdmin}
}

// reviewSink implements service.Sink over the in-memory Import Review sessions.
type reviewSink struct{ a *api }

func (k reviewSink) OpenReview(ctx context.Context, userID int64, f recipefile.File, images recipefile.ImageSet, photos []recipefile.CandidatePhoto) (service.ReviewRef, error) {
	rv := k.a.sessions.OpenWithPhotos(userID, f, images, photos)
	plan, err := k.a.planFor(ctx, rv, recipefile.Decisions{})
	if err != nil {
		k.a.sessions.Close(userID, rv.ID)
		return service.ReviewRef{}, err
	}
	ref := service.ReviewRef{ID: rv.ID, Plan: plan}
	for i, p := range rv.Photos {
		ref.Photos = append(ref.Photos, service.PhotoRef{Index: i, Width: p.Width, Height: p.Height})
	}
	return ref, nil
}

// CloseReview drops a Review of a read that was cancelled while it opened.
func (k reviewSink) CloseReview(userID int64, reviewID string) { k.a.sessions.Close(userID, reviewID) }

// errorStatus maps the refusals of StartRead and Check to their HTTP status.
func errorStatus(code string) int {
	switch code {
	case service.CodeAssistantOff:
		return http.StatusServiceUnavailable
	case recipeassistant.CodeReadInProgress:
		return http.StatusConflict
	case recipeassistant.CodeTooManyReads:
		return http.StatusTooManyRequests
	}
	return http.StatusUnprocessableEntity
}

// writeReadError answers a refusal: 503, 409, 429 (with retryAfterSeconds) or 422; anything unexpected is a 500.
func writeReadError(w http.ResponseWriter, err error) {
	var ae *recipeassistant.Error
	if !errors.As(err, &ae) {
		httpx.WriteAPIError(w, err)
		return
	}
	body := map[string]any{"code": ae.Code, "message": service.Message(ae.Code)}
	if ae.Code == recipeassistant.CodeTooManyReads {
		body["retryAfterSeconds"] = ae.RetryAfterSeconds
	}
	httpx.WriteJSON(w, errorStatus(ae.Code), map[string]any{"error": body})
}

var errBodyTooLarge = errors.New("request body too large")

// stagedReader reads at most limit bytes, then fails with errBodyTooLarge; the limit can be raised once.
type stagedReader struct {
	r     io.Reader
	limit int64
	read  int64
}

func (s *stagedReader) Read(p []byte) (int, error) {
	if s.read >= s.limit {
		return 0, errBodyTooLarge
	}
	if left := s.limit - s.read; int64(len(p)) > left {
		p = p[:left]
	}
	n, err := s.r.Read(p)
	s.read += int64(n)
	return n, err
}

type photoBody struct {
	DataURL *string `json:"dataUrl"`
	URL     *string `json:"url"`
}

// parseReadBody reads {url}, {text} or {photos:[...]} with the staged limits and returns the ReadInput. Exactly
// one source is required; anything else is a bad request.
func parseReadBody(r *http.Request) (service.ReadInput, error) {
	bad := &httpx.APIError{Status: http.StatusBadRequest, Code: "bad_request", Message: "Send exactly one of url, text or photos as JSON"}
	tooBig := &httpx.APIError{Status: http.StatusRequestEntityTooLarge, Code: "request_too_large", Message: "The request is too large"}
	if r.Body == nil {
		return service.ReadInput{}, bad
	}
	sr := &stagedReader{r: r.Body, limit: textBodyLimit}
	dec := json.NewDecoder(sr)
	fail := func(err error) error {
		if errors.Is(err, errBodyTooLarge) {
			return tooBig
		}
		return bad
	}
	if tok, err := dec.Token(); err != nil || tok != json.Delim('{') {
		return service.ReadInput{}, fail(err)
	}
	var (
		in      service.ReadInput
		sources int
		first   = true
	)
	for dec.More() {
		keyTok, err := dec.Token()
		if err != nil {
			return service.ReadInput{}, fail(err)
		}
		key, _ := keyTok.(string)
		if first && key == "photos" {
			sr.limit = photoBodyLimit
		}
		first = false
		switch key {
		case "url":
			var v *string
			if err := dec.Decode(&v); err != nil {
				return service.ReadInput{}, fail(err)
			}
			if v != nil {
				in.Kind, in.URL = recipeassistant.KindPage, *v
				sources++
			}
		case "text":
			var v *string
			if err := dec.Decode(&v); err != nil {
				return service.ReadInput{}, fail(err)
			}
			if v != nil {
				in.Kind, in.Text = recipeassistant.KindText, *v
				sources++
			}
		case "photos":
			var v []photoBody
			if err := dec.Decode(&v); err != nil {
				return service.ReadInput{}, fail(err)
			}
			if v != nil {
				in.Kind = recipeassistant.KindPhoto
				for _, p := range v {
					if (p.DataURL == nil) == (p.URL == nil) {
						return service.ReadInput{}, bad
					}
					var pi service.PhotoInput
					if p.DataURL != nil {
						pi.DataURL = *p.DataURL
					} else {
						pi.URL = *p.URL
					}
					in.Photos = append(in.Photos, pi)
				}
				sources++
			}
		default:
			var skip json.RawMessage
			if err := dec.Decode(&skip); err != nil {
				return service.ReadInput{}, fail(err)
			}
		}
	}
	if _, err := dec.Token(); err != nil || sources != 1 {
		return service.ReadInput{}, fail(err)
	}
	return in, nil
}

// startRead handles POST /api/recipe-assistant/reads. Before any byte of the body is read: the feature is
// available (503), the User may start a read (409, 429) and the declared length is sane (413).
func (a *api) startRead(w http.ResponseWriter, r *http.Request) {
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
	if err := a.assistant.Available(r.Context()); err != nil {
		writeReadError(w, err)
		return
	}
	if err := a.assistant.Check(c); err != nil {
		writeReadError(w, err)
		return
	}
	if r.ContentLength > photoBodyLimit {
		httpx.WriteError(w, http.StatusRequestEntityTooLarge, "request_too_large", "The request is too large")
		return
	}
	in, err := parseReadBody(r)
	if err != nil {
		httpx.WriteAPIError(w, err)
		return
	}
	jv, err := a.assistant.StartRead(c, in, reviewSink{a})
	if err != nil {
		writeReadError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusAccepted, map[string]string{"id": jv.ID, "state": jv.State})
}

type readErrorJSON struct {
	Code              string                 `json:"code"`
	Message           string                 `json:"message"`
	RetryAfterSeconds int                    `json:"retryAfterSeconds,omitempty"`
	Errors            []recipefile.PathError `json:"errors,omitempty"`
	Model             string                 `json:"model,omitempty"`
}

type photoJSON struct {
	Index  int `json:"index"`
	Width  int `json:"width"`
	Height int `json:"height"`
}

type readReviewJSON struct {
	ID     string          `json:"id"`
	Plan   recipefile.Plan `json:"plan"`
	Photos []photoJSON     `json:"photos,omitempty"`
}

type readSourceJSON struct {
	Kind           string `json:"kind"`
	Title          string `json:"title,omitempty"`
	URL            string `json:"url,omitempty"`
	StructuredData bool   `json:"structuredData,omitempty"`
	PhotoCount     int    `json:"photoCount,omitempty"`
}

type readJSON struct {
	ID       string          `json:"id"`
	State    string          `json:"state"`
	Review   *readReviewJSON `json:"review,omitempty"`
	Source   *readSourceJSON `json:"source,omitempty"`
	Model    *modelJSON      `json:"model,omitempty"`
	Error    *readErrorJSON  `json:"error,omitempty"`
	Warnings []warningJSON   `json:"warnings,omitempty"`
}

type modelJSON struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type warningJSON struct {
	Path    string `json:"path"`
	Code    string `json:"code"`
	Message string `json:"message"`
}

func readBody(v service.JobView) readJSON {
	out := readJSON{ID: v.ID, State: v.State}
	if v.Review != nil {
		rv := &readReviewJSON{ID: v.Review.ID, Plan: v.Review.Plan}
		for _, p := range v.Review.Photos {
			rv.Photos = append(rv.Photos, photoJSON{Index: p.Index, Width: p.Width, Height: p.Height})
		}
		out.Review = rv
	}
	if v.Source != nil {
		out.Source = &readSourceJSON{Kind: string(v.Source.Kind), Title: v.Source.Title, URL: v.Source.URL,
			StructuredData: v.Source.StructuredData, PhotoCount: v.Source.PhotoCount}
	}
	if v.Model != nil {
		out.Model = &modelJSON{ID: v.Model.ID, Name: v.Model.Name}
	}
	if v.Error != nil {
		e := &readErrorJSON{Code: v.Error.Code, Message: service.Message(v.Error.Code), Model: v.Error.Model,
			RetryAfterSeconds: v.Error.RetryAfterSeconds, Errors: v.Error.Paths}
		out.Error = e
	}
	for _, w := range v.Warnings {
		out.Warnings = append(out.Warnings, warningJSON{Path: w.Path, Code: w.Code, Message: w.Message})
	}
	return out
}

func (a *api) getRead(w http.ResponseWriter, r *http.Request) {
	user, _ := auth.UserFrom(r.Context())
	jv, ok := a.assistant.Job(user.ID, r.PathValue("id"))
	if !ok {
		httpx.WriteError(w, http.StatusNotFound, "not_found", "Not found")
		return
	}
	httpx.WriteJSON(w, http.StatusOK, readBody(jv))
}

func (a *api) cancelRead(w http.ResponseWriter, r *http.Request) {
	user, _ := auth.UserFrom(r.Context())
	if !a.assistant.CancelJob(user.ID, r.PathValue("id")) {
		httpx.WriteError(w, http.StatusNotFound, "not_found", "Not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// photo serves candidate photo {index} of the User's open Import Review.
func (a *api) photo(w http.ResponseWriter, r *http.Request) {
	user, _ := auth.UserFrom(r.Context())
	idx, err := strconv.Atoi(r.PathValue("index"))
	if err != nil {
		httpx.WriteError(w, http.StatusNotFound, "not_found", "Not found")
		return
	}
	p, ok := a.sessions.Photo(user.ID, r.PathValue("id"), idx)
	if !ok {
		httpx.WriteError(w, http.StatusNotFound, "not_found", "Not found")
		return
	}
	h := w.Header()
	h.Set("Content-Type", "image/jpeg")
	h.Set("Cache-Control", "no-store")
	h.Set("X-Content-Type-Options", "nosniff")
	h.Set("Content-Length", fmt.Sprint(len(p.JPEG)))
	_, _ = w.Write(p.JPEG)
}
