// Package httpapi exposes the receipt apply (RR3, docs/design/receipt-reading.md §7.2, §8): POST /api/scan/receipt/apply.
// The handler is thin: it checks the read and the session, builds the plan with receipt.BuildPlan, runs it on the scan
// service and answers. It registers itself in init() as module "receipt-apply".
package httpapi

import (
	"context"
	"database/sql"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"sync"

	"github.com/fabbarix/feeder-ng/internal/app"
	"github.com/fabbarix/feeder-ng/internal/auth"
	"github.com/fabbarix/feeder-ng/internal/httpx"
	"github.com/fabbarix/feeder-ng/internal/receipt"
	"github.com/fabbarix/feeder-ng/internal/scan"
	scanhttpapi "github.com/fabbarix/feeder-ng/internal/scan/httpapi"
	shoppinghttpapi "github.com/fabbarix/feeder-ng/internal/shopping/httpapi"
)

func init() { app.Register(app.Module{Name: "receipt-apply", Mount: mount}) }

// ApplyRead is a kept read as the apply needs it: its rows and context as they were proposed, and the proposals.
type ApplyRead struct {
	ID          string
	ShopID      int64
	Fingerprint string
	Rows        []receipt.Row
	Ctx         receipt.Context
	Proposals   []receipt.Proposal
}

// ReadLookup finds a read of the User (RR2's store). It answers ErrReadGone for an unknown, expired or another User's
// read, ErrReadNotDone while it runs or after it failed, and *UnavailableError when the assistant is off.
type ReadLookup interface {
	Lookup(ctx context.Context, userID int64, readID string) (ApplyRead, error)
}

// Errors of a lookup.
var (
	ErrReadGone    = errors.New("receipt read: gone")
	ErrReadNotDone = errors.New("receipt read: not done")
)

// UnavailableError says the assistant cannot read (its Reason is the Recipe Assistant's: "off", "no_key", ...).
type UnavailableError struct{ Reason string }

func (e *UnavailableError) Error() string {
	return "receipt read: assistant unavailable (" + e.Reason + ")"
}

var (
	lookupsMu sync.Mutex
	lookups   = map[*sql.DB]ReadLookup{}
)

// SetReadLookup sets the lookup of the reads of db (RR2's mount calls it; the tests call it with their database).
func SetReadLookup(db *sql.DB, l ReadLookup) {
	lookupsMu.Lock()
	defer lookupsMu.Unlock()
	lookups[db] = l
}

func lookupFor(db *sql.DB) ReadLookup {
	lookupsMu.Lock()
	defer lookupsMu.Unlock()
	return lookups[db]
}

type applier struct {
	db *sql.DB
	ap *scanhttpapi.ReceiptApplier
	hh *shoppinghttpapi.Household
}

func mount(r *app.Router, d app.Deps) {
	a := &applier{db: d.DB, ap: scanhttpapi.NewReceiptApplier(d), hh: shoppinghttpapi.NewHousehold(d)}
	r.User("POST /api/scan/receipt/apply", a.apply)
}

type applyBody struct {
	ReadID      string      `json:"readId"`
	Fingerprint string      `json:"fingerprint"`
	ClientUUIDs []string    `json:"clientUuids"`
	Accept      []acceptRef `json:"accept"`
	Adds        []addChoice `json:"adds"`
}

type acceptRef struct {
	ID string `json:"id"`
}

// addChoice is the User's choice for an accepted Add: an existing Ingredient (id), or a new one (name, baseUnit, kind).
type addChoice struct {
	ID         string `json:"id"`
	Ingredient struct {
		ID       int64  `json:"id"`
		Name     string `json:"name"`
		BaseUnit string `json:"baseUnit"`
		Kind     string `json:"kind"`
	} `json:"ingredient"`
	ProductName string `json:"productName"`
	PackSize    int    `json:"packSize"`
	Scope       string `json:"scope"`
}

func (c addChoice) choice() receipt.AddChoice {
	out := receipt.AddChoice{ProductName: strings.TrimSpace(c.ProductName), PackSize: c.PackSize}
	if name := strings.TrimSpace(c.Ingredient.Name); name != "" {
		out.Ingredient = receipt.IngredientChoice{New: &receipt.NewIngredient{Name: name, BaseUnit: c.Ingredient.BaseUnit, Kind: c.Ingredient.Kind}}
	} else {
		out.Ingredient = receipt.IngredientChoice{ID: c.Ingredient.ID}
	}
	return out
}

// apply answers 200 {applied, results}; 409 receipt_session_changed, receipt_read_not_done or assistant_unavailable;
// 410 receipt_read_gone; 422 unknown_proposal or add_incomplete with the proposal's id; 500 receipt_apply_failed.
func (a *applier) apply(w http.ResponseWriter, r *http.Request) {
	var body applyBody
	if err := httpx.DecodeJSON(r, &body); err != nil {
		httpx.WriteAPIError(w, err)
		return
	}
	ctx := r.Context()
	u, ok := auth.UserFrom(ctx)
	if !ok {
		httpx.WriteError(w, http.StatusUnauthorized, "unauthenticated", "Sign in to continue.")
		return
	}

	read, err := a.lookup(ctx, u.ID, body.ReadID)
	switch {
	case errors.Is(err, ErrReadGone):
		httpx.WriteError(w, http.StatusGone, "receipt_read_gone", "This read is no longer kept (10 minutes). Read the receipt again.")
		return
	case errors.Is(err, ErrReadNotDone):
		httpx.WriteError(w, http.StatusConflict, "receipt_read_not_done", "The receipt is still being read.")
		return
	case err != nil:
		var un *UnavailableError
		if errors.As(err, &un) {
			httpx.WriteError(w, http.StatusConflict, "assistant_unavailable", "The Recipe Assistant is unavailable: "+un.Reason+".")
			return
		}
		httpx.WriteAPIError(w, err)
		return
	}

	// The read's day and session: the same Scanned list, at the same Shop, on the same day, as when it was read.
	today, err := a.hh.Today(ctx)
	if err != nil {
		httpx.WriteAPIError(w, err)
		return
	}
	if read.Ctx.Today != string(today) {
		changed(w)
		return
	}
	events, err := a.ap.SessionEvents(ctx, read.ShopID, body.ClientUUIDs)
	if err != nil {
		httpx.WriteAPIError(w, err)
		return
	}
	fp := receipt.Fingerprint(events)
	if len(events) == 0 || fp != read.Fingerprint || (body.Fingerprint != "" && body.Fingerprint != fp) {
		changed(w)
		return
	}

	accept := make([]string, 0, len(body.Accept))
	for _, a := range body.Accept {
		accept = append(accept, a.ID)
	}
	adds := make(map[string]receipt.AddChoice, len(body.Adds))
	for _, c := range body.Adds {
		adds[c.ID] = c.choice()
	}
	plan, err := receipt.BuildPlan(receipt.PlanInput{ReadID: read.ID, Rows: read.Rows, Ctx: read.Ctx,
		Proposals: read.Proposals, Accept: accept, Adds: adds})
	var pe *receipt.PlanError
	if errors.As(err, &pe) {
		planRefused(w, pe)
		return
	}
	if err != nil {
		httpx.WriteAPIError(w, err)
		return
	}

	res, err := a.ap.Service().ApplyReceiptPlan(ctx, plan)
	if err != nil {
		slog.ErrorContext(ctx, "receipt apply failed", "err", err)
		httpx.WriteError(w, http.StatusInternalServerError, "receipt_apply_failed", "The receipt could not be applied. Check the Scanned list and try again.")
		return
	}
	results := res.Results
	if results == nil {
		results = []scan.Result{}
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"applied": len(body.Accept), "results": results})
}

// lookup asks the database's lookup; with none set, every read is gone.
func (a *applier) lookup(ctx context.Context, userID int64, readID string) (ApplyRead, error) {
	l := lookupFor(a.db)
	if l == nil {
		return ApplyRead{}, ErrReadGone
	}
	return l.Lookup(ctx, userID, readID)
}

func changed(w http.ResponseWriter) {
	httpx.WriteError(w, http.StatusConflict, "receipt_session_changed", "The Scanned list changed since the read. Read the receipt again.")
}

// planRefused is a 422 with the proposal's id: {"error":{"code","message","id"}}.
func planRefused(w http.ResponseWriter, pe *receipt.PlanError) {
	msg := "That line is no longer on the receipt. Read the receipt again."
	if pe.Code == receipt.PlanAddIncomplete {
		msg = "Choose the Ingredient and the Product name and pack size for this line first."
	}
	httpx.WriteJSON(w, http.StatusUnprocessableEntity, map[string]any{"error": map[string]string{
		"code": string(pe.Code), "message": msg, "id": pe.ID}})
}
