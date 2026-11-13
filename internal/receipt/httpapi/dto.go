package httpapi

import (
	"github.com/fabbarix/feeder-ng/internal/receipt"
	"github.com/fabbarix/feeder-ng/internal/receipt/service"
)

// The JSON of the read routes. receipt's own types carry no JSON tags, so every field the API sends is named here.
// Arrays are never null: a done read sends [] for an empty list.

type readStatusJSON struct {
	Status string `json:"status"`
}

type readFailedJSON struct {
	Status string    `json:"status"`
	Error  errorJSON `json:"error"`
}

type errorJSON struct {
	Code              string `json:"code"`
	Message           string `json:"message"`
	RetryAfterSeconds int    `json:"retryAfterSeconds,omitempty"`
}

type readDoneJSON struct {
	Status      string         `json:"status"`
	Fingerprint string         `json:"fingerprint"`
	Rows        []rowJSON      `json:"rows"`
	Proposals   []proposalJSON `json:"proposals"`
	Notes       []noteJSON     `json:"notes"`
	Totals      totalsJSON     `json:"totals"`
	Warnings    []warningJSON  `json:"warnings"`
}

type rowJSON struct {
	Row        int     `json:"row"`
	ProductID  int64   `json:"productId"`
	Product    string  `json:"product"`
	Barcode    string  `json:"barcode"`
	BaseUnit   string  `json:"baseUnit"`
	PackSize   int     `json:"packSize"`
	Scans      int     `json:"scans"`
	Quantity   float64 `json:"quantity"`
	Weighed    bool    `json:"weighed"`
	PriceCents int     `json:"priceCents"`
	PerKgCents int     `json:"perKgCents"`
}

type proposalJSON struct {
	ID         string    `json:"id"`
	Kind       string    `json:"kind"`
	Row        int       `json:"row"`
	Line       int       `json:"line"`
	Text       string    `json:"text"`
	Checked    bool      `json:"checked"`
	NeedsInput bool      `json:"needsInput"`
	Before     valueJSON `json:"before"`
	After      valueJSON `json:"after"`
}

type valueJSON struct {
	PriceCents *int   `json:"priceCents,omitempty"`
	PerKg      bool   `json:"perKg,omitempty"`
	Grams      *int   `json:"grams,omitempty"`
	Count      *int   `json:"count,omitempty"`
	PackSize   *int   `json:"packSize,omitempty"`
	PackUnit   string `json:"packUnit,omitempty"`
	Name       string `json:"name,omitempty"`
	Date       string `json:"date,omitempty"`
	Shop       string `json:"shop,omitempty"`
	ShopID     int64  `json:"shopId,omitempty"`
}

type noteJSON struct {
	Code  string `json:"code"`
	Text  string `json:"text"`
	Cents *int   `json:"cents,omitempty"`
}

type totalsJSON struct {
	ScannedCents   int  `json:"scannedCents"`
	ProjectedCents int  `json:"projectedCents"`
	ReceiptCents   *int `json:"receiptCents,omitempty"`
	Lines          int  `json:"lines"`
}

type warningJSON struct {
	Code string `json:"code"`
	Line int    `json:"line"`
}

// readBody is the JSON of GET /api/scan/receipt/reads/{id} for a job in any state.
func readBody(v service.JobView) any {
	switch v.Status {
	case service.StatusDone:
		return doneBody(v)
	case service.StatusFailed:
		e := errorJSON{}
		if v.Error != nil {
			e = errorJSON{Code: v.Error.Code, Message: service.Message(v.Error.Code), RetryAfterSeconds: v.Error.RetryAfterSeconds}
		}
		return readFailedJSON{Status: string(v.Status), Error: e}
	}
	return readStatusJSON{Status: string(v.Status)}
}

func doneBody(v service.JobView) readDoneJSON {
	out := readDoneJSON{Status: string(v.Status), Fingerprint: v.Fingerprint, Rows: []rowJSON{}, Proposals: []proposalJSON{},
		Notes: []noteJSON{}, Warnings: []warningJSON{}}
	for _, r := range v.Rows {
		out.Rows = append(out.Rows, rowBody(r))
	}
	for _, p := range v.Result.Proposals {
		out.Proposals = append(out.Proposals, proposalBody(p))
	}
	for _, n := range v.Result.Notes {
		out.Notes = append(out.Notes, noteJSON{Code: string(n.Code), Text: n.Text, Cents: n.Cents})
	}
	t := v.Result.Totals
	out.Totals = totalsJSON{ScannedCents: t.ScannedCents, ProjectedCents: t.ProjectedCents, ReceiptCents: t.ReceiptCents, Lines: t.Lines}
	for _, w := range v.Warnings {
		out.Warnings = append(out.Warnings, warningJSON{Code: w.Code, Line: w.Line})
	}
	return out
}

func rowBody(r receipt.Row) rowJSON {
	return rowJSON{Row: r.Index, ProductID: r.ProductID, Product: r.Product, Barcode: r.Barcode, BaseUnit: r.BaseUnit,
		PackSize: r.PackSize, Scans: r.Scans, Quantity: r.Quantity, Weighed: r.Weighed, PriceCents: r.PriceCents,
		PerKgCents: r.PerKgCents}
}

func proposalBody(p receipt.Proposal) proposalJSON {
	return proposalJSON{ID: p.ID, Kind: string(p.Kind), Row: p.Row, Line: p.Line, Text: p.Text, Checked: p.Checked,
		NeedsInput: p.NeedsInput, Before: valueBody(p.Before), After: valueBody(p.After)}
}

func valueBody(v receipt.Value) valueJSON {
	return valueJSON{PriceCents: v.PriceCents, PerKg: v.PerKg, Grams: v.Grams, Count: v.Count, PackSize: v.PackSize,
		PackUnit: v.PackUnit, Name: v.Name, Date: v.Date, Shop: v.Shop, ShopID: v.ShopID}
}
