package bdd

// b8-rxweb: steps of bdd/features/receipt/receipt_background.feature. They add to the "receipt-read" state (rrState) three things a phone
// that leaves the screen needs: time passing without a poll, asking for the read again later, and the clock. The names start with
// "the phone", "I ask for the receipt read", "the receipt read is still running" or "<n> minutes pass" so no other set can clash.

import (
	"encoding/json"
	"fmt"
	"time"

	"github.com/cucumber/godog"
)

func init() { RegisterSteps("receipt-background", receiptBackgroundSteps) }

func receiptBackgroundSteps(sc *godog.ScenarioContext, w *World) {
	state := func() *rrState { return w.Vars["receipt-read"].(*rrState) }
	ask := func() {
		st := state()
		r := w.Env.LoginUser(w.TB).Get("/api/scan/receipt/reads/" + st.readID)
		w.Last, st.last = r, r
		st.view = nil
		_ = json.Unmarshal(r.Body, &st.view)
	}
	sc.Step(`^the phone does not ask for a moment$`, func() { time.Sleep(500 * time.Millisecond) })
	sc.Step(`^(\d+) minutes pass$`, func(n int) { w.Env.Clock.Advance(time.Duration(n) * time.Minute) })
	sc.Step(`^I ask for the receipt read once$`, ask)
	// asks until the read has an end (done or failed) or the server no longer has it (404)
	sc.Step(`^I ask for the receipt read$`, func() error {
		deadline := time.Now().Add(15 * time.Second)
		for time.Now().Before(deadline) {
			ask()
			if w.Last.Status == 404 {
				return nil
			}
			if s, _ := state().view["status"].(string); s == "done" || s == "failed" {
				return nil
			}
			time.Sleep(10 * time.Millisecond)
		}
		return fmt.Errorf("the read never finished; last response: %s", lastBody(w))
	})
	sc.Step(`^the receipt read is still running$`, func() error {
		if s := state().view["status"]; s != "running" {
			return fmt.Errorf("status = %v; last response: %s", s, lastBody(w))
		}
		return nil
	})
}
