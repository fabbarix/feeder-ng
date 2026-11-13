package service_test

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/receipt"
	"github.com/fabbarix/feeder-ng/internal/receipt/receipttest"
	rsvc "github.com/fabbarix/feeder-ng/internal/receipt/service"
	"github.com/fabbarix/feeder-ng/internal/recipeassistant"
	"github.com/fabbarix/feeder-ng/internal/recipeassistant/claude"
	rasvc "github.com/fabbarix/feeder-ng/internal/recipeassistant/service"
)

type liveAssistant struct{ c rasvc.Claude }

func (a liveAssistant) Ready(context.Context) (rsvc.Ready, error) {
	return rsvc.Ready{Model: recipeassistant.DefaultModel, Claude: a.c, ImagesOK: true}, nil
}
func (liveAssistant) Check(recipeassistant.Caller) error { return nil }
func (liveAssistant) Acquire(recipeassistant.Caller) (func(), error) {
	return func() {}, nil
}

type livePhotos struct{}

func (livePhotos) Prepare(ctx context.Context, in []rasvc.PhotoInput) ([]rasvc.PreparedPhoto, error) {
	src := make([]recipeassistant.PhotoSource, len(in))
	for i, p := range in {
		src[i] = recipeassistant.PhotoSource{DataURL: p.DataURL}
	}
	prepared, err := recipeassistant.PreparePhotos(ctx, nil, src)
	if err != nil {
		return nil, err
	}
	out := make([]rasvc.PreparedPhoto, len(prepared))
	for i, p := range prepared {
		out[i] = rasvc.PreparedPhoto{JPEG: p.JPEG, Width: p.Width, Height: p.Height}
	}
	return out, nil
}

// TestLiveReceiptReadCompletes reads a synthetic receipt image (plain text drawn with Go's image package, no real
// purchase, nothing downloaded) through the whole read service with the real Claude adapter and the default model, and
// checks that the read completes with at least one proposal. Opt-in and billed (a few cents): it runs only with
// FEEDER_LIVE_SCHEMA_CHECK=1 and FEEDER_ANTHROPIC_KEY set, never in CI. The key goes only to the adapter, which never
// logs it; this test prints neither it nor the photo nor the answer.
func TestLiveReceiptReadCompletes(t *testing.T) {
	if os.Getenv("FEEDER_LIVE_SCHEMA_CHECK") != "1" {
		t.Skip("FEEDER_LIVE_SCHEMA_CHECK=1 is not set")
	}
	key := os.Getenv("FEEDER_ANTHROPIC_KEY")
	if key == "" {
		t.Skip("FEEDER_ANTHROPIC_KEY is not set")
	}
	img := receipttest.ReceiptPNGDataURL([]string{
		"ESSELUNGA",
		"Via Roma 1, Milano",
		"13/11/2026   10:42",
		"",
		"MUTTI PASSATA 700G          1,29",
		"BARILLA SPAGHETTI 500G      0,89",
		"LATTE INTERO 1L             1,50",
		"",
		"TOTALE EUR                  3,68",
	})
	events := []receipt.ScanEvent{
		{UUID: "l1", ProductID: 1, Product: "Mutti passata 700 g", Barcode: "8005110170003", BaseUnit: "g", PackSize: 700, Quantity: 700, PriceCents: -1, PerKgCents: -1, ShopID: 1, Date: today},
		{UUID: "l2", ProductID: 2, Product: "Barilla spaghetti 500 g", Barcode: "8076800195057", BaseUnit: "g", PackSize: 500, Quantity: 500, PriceCents: -1, PerKgCents: -1, ShopID: 1, Date: today},
	}
	zero := 0
	c := claude.New(claude.Options{BaseURL: recipeassistant.DefaultBaseURL, APIKey: recipeassistant.Secret(key), MaxRetries: &zero})
	ev := &eventsStub{all: events, ctx: sessionContext()}
	svc := rsvc.New(rsvc.Deps{Assistant: liveAssistant{c}, Events: ev, Contexts: ev, Photos: livePhotos{}, Overall: 110 * time.Second})
	v, err := svc.Start(userA, rsvc.ReadInput{ShopID: 1, ClientUUIDs: []string{"l1", "l2"}, Photos: []rasvc.PhotoInput{{DataURL: img}}})
	if err != nil {
		t.Fatalf("Start: %v", err)
	}
	deadline := time.Now().Add(115 * time.Second)
	for v.Status == rsvc.StatusRunning && time.Now().Before(deadline) {
		time.Sleep(500 * time.Millisecond)
		v, _ = svc.Job(userA.UserID, v.ID)
	}
	if v.Status != rsvc.StatusDone {
		code := ""
		if v.Error != nil {
			code = v.Error.Code
		}
		t.Fatalf("the live read did not complete: status %q, error code %q", v.Status, code)
	}
	if len(v.Result.Proposals) < 1 {
		t.Fatalf("a completed live read of the synthetic receipt must propose at least one change, got none")
	}
}
