package bdd

import (
	"fmt"

	"github.com/cucumber/godog"
)

func init() { RegisterSteps("b9_receipt", b9ReceiptSteps) }

// b9ReceiptSteps are the few steps B9-50's scenarios need beyond the receipt-apply steps (steps_receipt_apply_test.go): an Add
// that names an existing Product by id, and archiving a Product. Product ids are in w.Vars["ra:product:<name>"], the Add choices
// in w.Vars["ra:adds"] (both are the receipt-apply steps').
func b9ReceiptSteps(sc *godog.ScenarioContext, w *World) {
	addProduct := func(n int, productID int64) {
		l, _ := w.Vars["ra:adds"].([]any)
		w.Vars["ra:adds"] = append(l, map[string]any{"id": fmt.Sprintf("add:%d", n), "productId": productID})
	}
	sc.Step(`^for the receipt-apply Add (\d+) I choose the existing Product "([^"]*)"$`, func(n int, name string) error {
		id, ok := w.Vars["ra:product:"+name].(int64)
		if !ok {
			return fmt.Errorf("no Product %q was set up by this scenario", name)
		}
		addProduct(n, id)
		return nil
	})
	sc.Step(`^for the receipt-apply Add (\d+) I choose an existing Product that does not exist$`, func(n int) error {
		addProduct(n, 999999)
		return nil
	})
	sc.Step(`^the receipt-apply Product "([^"]*)" is archived$`, func(name string) error {
		id, ok := w.Vars["ra:product:"+name].(int64)
		if !ok {
			return fmt.Errorf("no Product %q was set up by this scenario", name)
		}
		if r := w.Ensure().LoginAdmin(w.TB).Post(fmt.Sprintf("/api/products/%d/archive", id), nil); r.Status != 200 && r.Status != 204 {
			return fmt.Errorf("archive %s: %d %s", name, r.Status, r.Body)
		}
		return nil
	})
	sc.Step(`^the receipt-apply response error names the proposal "([^"]*)"$`, func(id string) error {
		if w.Last == nil {
			return fmt.Errorf("no response")
		}
		got, err := ssPath(w.Last.Body, "error.id")
		if err != nil || got != id {
			return fmt.Errorf("error.id = %v (%v), want %q; body: %s", got, err, id, w.Last.Body)
		}
		return nil
	})
}
