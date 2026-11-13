package bdd

import (
	"context"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/cucumber/godog"

	"github.com/fabbarix/feeder-ng/internal/receipt"
	rhttp "github.com/fabbarix/feeder-ng/internal/receipt/httpapi"
	scanhttpapi "github.com/fabbarix/feeder-ng/internal/scan/httpapi"
	"github.com/fabbarix/feeder-ng/internal/testkit"
)

// Step definitions for bdd/features/receipt/receipt_apply.feature (RR3). Every step says "receipt-apply", so none can
// collide with the other step sets (RR5 registers its own set, "receipt"). The reads are seeded through the apply's
// test seam, rhttp.SetReadLookup, with proposals built by RR1's pure Propose: the assistant is not involved.
// State lives in w.Vars under "ra:" keys: "ra:shop:<name>", "ra:product:<name>", "ra:pack:<name>", "ra:lookup",
// "ra:adds" (the Add choices, by proposal id).

func init() { RegisterSteps("receipt-apply", receiptApplySteps) }

// raLookup is the seeded reads, as RR2's store would answer.
type raLookup struct{ reads map[string]rhttp.ApplyRead }

func (l *raLookup) Lookup(_ context.Context, _ int64, id string) (rhttp.ApplyRead, error) {
	r, ok := l.reads[id]
	if !ok {
		return rhttp.ApplyRead{}, rhttp.ErrReadGone
	}
	return r, nil
}

func raQuoted(s string) []string {
	var out []string
	for _, part := range strings.Split(s, ",") {
		if p := strings.Trim(strings.TrimSpace(part), `"`); p != "" {
			out = append(out, p)
		}
	}
	return out
}

func receiptApplySteps(sc *godog.ScenarioContext, w *World) {
	admin := func() *testkit.Client { return w.Ensure().LoginAdmin(w.TB) }
	me := func() *testkit.Client { w.Ensure(); return w.Client }
	num := func(kind, name string) (int64, error) {
		n, ok := w.Vars["ra:"+kind+":"+name].(int64)
		if !ok {
			return 0, fmt.Errorf("no %s %q was set up by this scenario", kind, name)
		}
		return n, nil
	}
	created := func(r *testkit.Response, what string) (int64, error) {
		if r.Status != 201 {
			return 0, fmt.Errorf("%s: status %d: %s", what, r.Status, r.Body)
		}
		var out struct{ ID int64 }
		if err := r.JSON(&out); err != nil {
			return 0, err
		}
		return out.ID, nil
	}
	lookup := func() *raLookup {
		if l, ok := w.Vars["ra:lookup"].(*raLookup); ok {
			return l
		}
		l := &raLookup{reads: map[string]rhttp.ApplyRead{}}
		w.Vars["ra:lookup"] = l
		rhttp.SetReadLookup(w.Ensure().DB, l)
		return l
	}
	adds := func() []any {
		l, _ := w.Vars["ra:adds"].([]any)
		return l
	}

	sc.Step(`^the receipt-apply household has the Shops "([^"]*)" and "([^"]*)"$`, func(a, b string) error {
		for _, name := range []string{a, b} {
			n, err := created(admin().Post("/api/shops", map[string]any{"name": name}), "create the Shop "+name)
			if err != nil {
				return err
			}
			w.Vars["ra:shop:"+name] = n
		}
		return nil
	})
	sc.Step(`^the receipt-apply catalogue has the Product "([^"]*)" in (g|ml|piece) with pack size (\d+)$`, func(name, base string, size int) error {
		ing, err := created(me().Post("/api/ingredients", map[string]any{"name": name + " (ingredient)", "baseUnit": base}), "create the Ingredient of "+name)
		if err != nil {
			return err
		}
		n, err := created(me().Post("/api/products", map[string]any{"name": name, "ingredientId": ing, "packSize": size}), "create the Product "+name)
		if err == nil {
			w.Vars["ra:product:"+name] = n
			w.Vars["ra:pack:"+name] = int64(size)
		}
		return err
	})
	sc.Step(`^I scan "([^"]*)" at "([^"]*)" at (\d+) cents as receipt-apply scan "([^"]*)"$`, func(prod, shop string, cents int, uuid string) error {
		sid, err := num("shop", shop)
		if err != nil {
			return err
		}
		pid, err := num("product", prod)
		if err != nil {
			return err
		}
		size, _ := num("pack", prod)
		op := map[string]any{"clientUuid": uuid, "scannedAt": w.Ensure().Clock.Now().Format(time.RFC3339), "kind": "shop_scan",
			"shopId": sid, "productId": pid, "quantity": size, "priceCents": cents}
		if r := me().Post("/api/scan", op); r.Status != 200 {
			return fmt.Errorf("scan %s: %d %s", uuid, r.Status, r.Body)
		}
		return nil
	})
	sc.Step(`^I change the receipt-apply Price of the scans ((?:"[^"]*"(?:, )?)+) to (\d+) cents$`, func(list string, cents int) error {
		if r := me().Patch("/api/scan/prices", map[string]any{"clientUuids": raQuoted(list), "priceCents": cents}); r.Status != 200 {
			return fmt.Errorf("edit Prices: %d %s", r.Status, r.Body)
		}
		return nil
	})
	sc.Step(`^the receipt-apply day passes$`, func() { w.Ensure().Clock.Advance(26 * time.Hour) })

	// A read: the rows are the session's scans, the proposals are RR1's on the lines of the table.
	sc.Step(`^a receipt-apply read "([^"]*)" of the scans ((?:"[^"]*"(?:, )?)+) at "([^"]*)" with the lines$`, func(id, list, shop string, table *godog.Table) error {
		sid, err := num("shop", shop)
		if err != nil {
			return err
		}
		ap := scanhttpapi.NewReceiptApplier(w.Ensure().App.Deps)
		events, err := ap.SessionEvents(context.Background(), sid, raQuoted(list))
		if err != nil {
			return err
		}
		rows := receipt.GroupRows(events)
		var lines []receipt.Line
		head := table.Rows[0].Cells
		for _, rw := range table.Rows[1:] {
			cell := map[string]string{}
			for i, c := range rw.Cells {
				cell[head[i].Value] = c.Value
			}
			atoi := func(k string) int { n, _ := strconv.Atoi(cell[k]); return n }
			l := receipt.Line{Row: atoi("row"), Text: strings.ToUpper(cell["name"]), Count: atoi("count"), Name: cell["name"],
				PackSize: atoi("packSize"), PackUnit: cell["packUnit"]}
			if cell["price"] != "" {
				p := atoi("price")
				l.PriceCents = &p
			}
			lines = append(lines, l)
		}
		ctx := receipt.Context{Today: w.Env.Clock.Now().Format("2006-01-02"), SessionShop: receipt.Shop{ID: sid, Name: shop},
			SessionDate: w.Env.Clock.Now().Format("2006-01-02"), Currency: "EUR", MinorDigits: 2}
		for name, v := range w.Vars {
			if strings.HasPrefix(name, "ra:shop:") {
				ctx.Shops = append(ctx.Shops, receipt.Shop{ID: v.(int64), Name: strings.TrimPrefix(name, "ra:shop:")})
			}
		}
		res := receipt.Propose(rows, receipt.Answer{Lines: lines}, ctx)
		lookup().reads[id] = rhttp.ApplyRead{ID: id, ShopID: sid, Fingerprint: receipt.Fingerprint(events), Rows: rows, Ctx: ctx, Proposals: res.Proposals}
		return nil
	})

	// The choices of an accepted Add; its id is "add:<index of its line>".
	addChoice := func(n int, ingredient map[string]any, product string, pack int) {
		id := fmt.Sprintf("add:%d", n)
		w.Vars["ra:adds"] = append(adds(), map[string]any{"id": id, "ingredient": ingredient, "productName": product, "packSize": pack, "scope": "global"})
	}
	sc.Step(`^for the receipt-apply Add (\d+) I choose the new (food|supply) Ingredient "([^"]*)" in (g|ml|piece) and the Product "([^"]*)" of pack size (\d+)$`,
		func(n int, kind, name, base, product string, pack int) {
			addChoice(n, map[string]any{"name": name, "baseUnit": base, "kind": kind}, product, pack)
		})
	sc.Step(`^for the receipt-apply Add (\d+) I choose an Ingredient that does not exist and the Product "([^"]*)" of pack size (\d+)$`,
		func(n int, product string, pack int) { addChoice(n, map[string]any{"id": 999999}, product, pack) })

	sc.Step(`^I apply the receipt-apply read "([^"]*)" for the scans ((?:"[^"]*"(?:, )?)*) accepting ((?:"[^"]*"(?:, )?)+)$`, func(id, uuids, ids string) error {
		var accept []map[string]string
		for _, a := range raQuoted(ids) {
			accept = append(accept, map[string]string{"id": a})
		}
		lookup()
		clientUuids := raQuoted(uuids)
		if clientUuids == nil {
			clientUuids = []string{}
		}
		body := map[string]any{"readId": id, "clientUuids": clientUuids, "accept": accept, "adds": append([]any{}, adds()...)}
		w.Last = me().Post("/api/scan/receipt/apply", body)
		return nil
	})

	sc.Step(`^the receipt-apply response status is (\d+)$`, func(want int) error {
		if w.Last == nil || w.Last.Status != want {
			return fmt.Errorf("status = %v, want %d; body: %v", w.Last, want, w.Last)
		}
		return nil
	})
	sc.Step(`^the receipt-apply response status is (\d+) with the error "([^"]*)"$`, func(want int, code string) error {
		if w.Last == nil || w.Last.Status != want || w.Last.ErrorCode() != code {
			return fmt.Errorf("response = %v, want %d %s", w.Last, want, code)
		}
		return nil
	})
	sc.Step(`^the receipt-apply response applied (\d+) proposals? and returned (\d+) results?$`, func(applied, results int) error {
		doc, err := ssPath(w.Last.Body, "")
		if err != nil {
			return err
		}
		m, _ := doc.(map[string]any)
		rs, _ := m["results"].([]any)
		if ssNum(m["applied"]) != float64(applied) || len(rs) != results {
			return fmt.Errorf("response = %s, want applied %d with %d results", w.Last.Body, applied, results)
		}
		return nil
	})
	sc.Step(`^the receipt-apply Shopping List shows (\d+) cents spent$`, func(want int) error {
		r := me().Get("/api/shopping/list")
		if r.Status != 200 {
			return fmt.Errorf("Shopping List: %d %s", r.Status, r.Body)
		}
		got, err := ssPath(r.Body, "summary.spentCents")
		if err != nil {
			return err
		}
		if ssNum(got) != float64(want) {
			return fmt.Errorf("summary.spentCents = %v, want %d", got, want)
		}
		return nil
	})
	sc.Step(`^the latest receipt-apply Price of "([^"]*)" at "([^"]*)" is (\d+) cents$`, func(prod, shop string, cents int) error {
		pid, err := num("product", prod)
		if err != nil {
			return err
		}
		sid, err := num("shop", shop)
		if err != nil {
			return err
		}
		r := me().Get(fmt.Sprintf("/api/products/%d/prices/latest?shop=%d", pid, sid))
		got, err := ssPath(r.Body, "priceCents")
		if err != nil || ssNum(got) != float64(cents) {
			return fmt.Errorf("latest Price = %s, want %d", r.Body, cents)
		}
		return nil
	})
	sc.Step(`^the receipt-apply catalogue has (\d+) Products? named "([^"]*)"$`, func(want int, name string) error {
		r := me().Get("/api/products")
		var list []struct{ Name string }
		if err := r.JSON(&list); err != nil {
			return err
		}
		n := 0
		for _, p := range list {
			if p.Name == name {
				n++
			}
		}
		if n != want {
			return fmt.Errorf("%d Products named %q, want %d; %s", n, name, want, r.Body)
		}
		return nil
	})
	sc.Step(`^the receipt-apply Ingredient "([^"]*)" is a (food|supply)$`, func(name, kind string) error {
		var list []struct{ Name, Kind string }
		if err := me().Get("/api/ingredients").JSON(&list); err != nil {
			return err
		}
		for _, i := range list {
			if i.Name == name {
				if i.Kind != kind {
					return fmt.Errorf("Ingredient %q is a %s, want %s", name, i.Kind, kind)
				}
				return nil
			}
		}
		return fmt.Errorf("no Ingredient named %q", name)
	})
	sc.Step(`^the receipt-apply Stock has (\d+) Lots$`, func(want int) error {
		var l struct {
			Lots []struct{} `json:"lots"`
		}
		if err := me().Get("/api/stock/lots").JSON(&l); err != nil {
			return err
		}
		if len(l.Lots) != want {
			return fmt.Errorf("%d Lots, want %d", len(l.Lots), want)
		}
		return nil
	})
}
