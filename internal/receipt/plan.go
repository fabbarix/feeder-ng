package receipt

import (
	"fmt"
	"math"
)

// Phase orders the steps of a plan (design §8.1).
type Phase string

// Phases, in the order a plan runs them.
const (
	PhaseCorrection Phase = "correction"
	PhaseReplace    Phase = "replace"
	PhaseQuantity   Phase = "quantity"
	PhasePrice      Phase = "price"
	PhaseAdd        Phase = "add"
	PhaseRemove     Phase = "remove"
)

// OpKind is one operation of the scan service that a plan uses.
type OpKind string

// Operation kinds.
const (
	OpSetPrices     OpKind = "set_prices"
	OpNewScan       OpKind = "new_scan"
	OpUndo          OpKind = "undo"
	OpUpdateProduct OpKind = "update_product"
	OpCreateProduct OpKind = "create_product"
	OpDeleteProduct OpKind = "delete_product"
)

// PriceChange is one event's new Price (PerKgCents -1 for a per-pack Price).
type PriceChange struct {
	UUID       string
	PriceCents int
	PerKgCents int
}

// IngredientChoice names the Ingredient of an Add: an existing one by ID, or a new one.
type IngredientChoice struct {
	ID  int64
	New *NewIngredient
}

// NewIngredient is an Ingredient to create for an Add.
type NewIngredient struct {
	Name     string
	BaseUnit string
	Kind     string
}

// AddChoice is what the User picks for an accepted Add: the Ingredient and the Product's name and pack size.
type AddChoice struct {
	Ingredient  IngredientChoice
	ProductName string
	PackSize    int
}

// Op is one operation. Only the fields of its Kind are set.
type Op struct {
	Kind       OpKind
	UUID       string
	ProductID  int64
	Quantity   float64
	PriceCents int
	PerKgCents int
	ShopID     int64
	Date       string
	Ref        string
	Prices     []PriceChange
	Name       string
	PackSize   int
	BaseUnit   string
	Ingredient *IngredientChoice
}

// Step is one operation with the operation that undoes it.
type Step struct {
	Phase   Phase
	Op      Op
	Inverse Op
}

// Plan is the ordered steps of the accepted proposals.
type Plan struct {
	Steps []Step
}

// Compensate returns the inverses of the steps before failedAt, in reverse order: the steps that were applied when the
// step at failedAt failed.
func (p Plan) Compensate(failedAt int) []Op {
	if failedAt < 0 {
		failedAt = 0
	}
	if failedAt > len(p.Steps) {
		failedAt = len(p.Steps)
	}
	out := make([]Op, 0, failedAt)
	for i := failedAt - 1; i >= 0; i-- {
		out = append(out, p.Steps[i].Inverse)
	}
	return out
}

// PlanInput is what BuildPlan needs: the read's id, the rows and context as they were proposed, the proposals and the
// accepted ids, and the choices for accepted Adds.
type PlanInput struct {
	ReadID    string
	Rows      []Row
	Ctx       Context
	Proposals []Proposal
	Accept    []string
	Adds      map[string]AddChoice
}

// PlanCode says why a plan is refused.
type PlanCode string

// Plan refusals.
const (
	PlanUnknownProposal PlanCode = "unknown_proposal"
	PlanAddIncomplete   PlanCode = "add_incomplete"
)

// PlanError refuses a plan: an accepted id that is not a proposal, or an accepted Add without its choice.
type PlanError struct {
	Code PlanCode
	ID   string
}

func (e *PlanError) Error() string {
	return fmt.Sprintf("receipt plan: %s (%s)", e.Code, e.ID)
}

// liveScan is an event as the plan leaves it after the steps so far.
type liveScan struct {
	uuid      string
	productID int64
	qty       float64
	price     int
	perKg     int
	shopID    int64
	date      string
	priced    bool
}

// restoreOp re-applies the original event under a new uuid: the inverse of its Undo.
func (s liveScan) restoreOp(readID string) Op {
	return Op{Kind: OpNewScan, UUID: fmt.Sprintf("receipt:%s:undo:%s", readID, s.uuid), ProductID: s.productID,
		Quantity: s.qty, PriceCents: s.price, PerKgCents: s.perKg, ShopID: s.shopID, Date: s.date}
}

type planBuilder struct {
	readID string
	n      int
	steps  []Step
}

func (b *planBuilder) newUUID() string {
	u := fmt.Sprintf("receipt:%s:%d", b.readID, b.n)
	b.n++
	return u
}

func (b *planBuilder) add(s Step) { b.steps = append(b.steps, s) }

// BuildPlan turns the accepted proposals into ordered steps (design §8). The rows are reconciled, not patched: a row
// whose shop, date or pack size changes has each event undone and scanned again; a weight change does the same once;
// Prices and quantities change in place where they can. Steps run by phase: correction, replace, quantity, price, add,
// remove; each carries its inverse.
func BuildPlan(in PlanInput) (Plan, error) {
	byID := make(map[string]Proposal, len(in.Proposals))
	for _, p := range in.Proposals {
		byID[p.ID] = p
	}
	acc := make(map[string]bool, len(in.Accept))
	for _, id := range in.Accept {
		p, ok := byID[id]
		if !ok {
			return Plan{}, &PlanError{Code: PlanUnknownProposal, ID: id}
		}
		acc[id] = true
		if p.Kind == KindAdd && !completeChoice(in.Adds[id]) {
			return Plan{}, &PlanError{Code: PlanAddIncomplete, ID: id}
		}
	}
	accP := func(kind string, r int) (Proposal, bool) {
		id := pid(kind, r)
		return byID[id], acc[id]
	}
	reweighed := func(r int) bool {
		_, ok := accP("weight", r)
		return ok
	}

	ctx := in.Ctx
	shopID, date := ctx.SessionShop.ID, ctx.SessionDate
	shopChanged, dateChanged := acc["shop"], acc["date"]
	if shopChanged {
		shopID = byID["shop"].After.ShopID
	}
	if dateChanged {
		date = byID["date"].After.Date
	}

	rows := in.Rows
	live := make([][]liveScan, len(rows))
	removed := make([]bool, len(rows))
	newPack := make([]int, len(rows))
	for r, row := range rows {
		newPack[r] = row.PackSize
		removed[r] = acc[pid("missing", r)]
		for _, e := range row.Events {
			live[r] = append(live[r], liveScan{uuid: e.UUID, productID: row.ProductID, qty: e.Quantity,
				price: e.PriceCents, perKg: e.PerKgCents, shopID: e.ShopID, date: e.Date})
		}
	}

	b := &planBuilder{readID: in.ReadID}

	// Correction: the Product's name and pack size.
	for r, row := range rows {
		np, nameOK := accP("name", r)
		pp, packOK := accP("pack_size", r)
		if !nameOK && !packOK {
			continue
		}
		newName := row.Product
		if nameOK {
			newName = np.After.Name
		}
		if packOK {
			newPack[r] = deref(pp.After.PackSize)
		}
		b.add(Step{Phase: PhaseCorrection,
			Op:      Op{Kind: OpUpdateProduct, ProductID: row.ProductID, Name: newName, PackSize: newPack[r]},
			Inverse: Op{Kind: OpUpdateProduct, ProductID: row.ProductID, Name: row.Product, PackSize: row.PackSize}})
	}

	// Replace: an event whose shop, date or pack size changes is undone and scanned again with the target values. The
	// shop and date move every scan the User keeps, listed on the receipt or not: a row the User does not remove through
	// its missing proposal is one they say they bought on this trip, so at the receipt's Shop and on its date. A removed
	// row is undone below, and a row whose weight changes is scanned again at the target shop and date in the quantity
	// phase, so neither is replaced here.
	for r, row := range rows {
		if removed[r] || reweighed(r) {
			continue
		}
		pp, packOK := accP("pack_size", r)
		packChange := packOK && !row.Weighed
		if packChange {
			newPack[r] = deref(pp.After.PackSize)
		}
		prP, priceOK := accP("price", r)
		for i, e := range live[r] {
			if !(packChange || (shopChanged && e.shopID != shopID) || (dateChanged && e.date != date)) {
				continue
			}
			newShop, newDate := e.shopID, e.date
			if shopChanged {
				newShop = shopID
			}
			if dateChanged {
				newDate = date
			}
			qty := e.qty
			if packChange {
				qty = float64(newPack[r])
			}
			price, perKg := e.price, e.perKg
			if priceOK {
				price, perKg = priceFor(prP.After, qty)
			}
			u := b.newUUID()
			b.add(Step{Phase: PhaseReplace, Op: Op{Kind: OpUndo, UUID: e.uuid}, Inverse: e.restoreOp(in.ReadID)})
			b.add(Step{Phase: PhaseReplace,
				Op:      Op{Kind: OpNewScan, UUID: u, ProductID: row.ProductID, Quantity: qty, PriceCents: price, PerKgCents: perKg, ShopID: newShop, Date: newDate},
				Inverse: Op{Kind: OpUndo, UUID: u}})
			live[r][i] = liveScan{uuid: u, productID: row.ProductID, qty: qty, price: price, perKg: perKg,
				shopID: newShop, date: newDate, priced: priceOK}
		}
	}

	// Quantity: more or fewer scans, or another weight (a row read by weight is scanned again once, keeping its price
	// per kg).
	for r, row := range rows {
		if removed[r] {
			continue
		}
		if wp, ok := accP("weight", r); ok {
			grams := deref(wp.After.Grams)
			prP, priceOK := accP("price", r)
			total, perKg := -1, -1
			if pk, ok := rowPerKg(row); ok {
				perKg = pk
			}
			switch {
			case priceOK && prP.After.PerKg:
				perKg = deref(prP.After.PriceCents)
				total = roundDiv(perKg*grams, 1000)
			case wp.After.PriceCents != nil:
				total = *wp.After.PriceCents
			}
			for _, e := range live[r] {
				b.add(Step{Phase: PhaseQuantity, Op: Op{Kind: OpUndo, UUID: e.uuid}, Inverse: e.restoreOp(in.ReadID)})
			}
			u := b.newUUID()
			b.add(Step{Phase: PhaseQuantity,
				Op:      Op{Kind: OpNewScan, UUID: u, ProductID: row.ProductID, Quantity: float64(grams), PriceCents: total, PerKgCents: perKg, ShopID: shopID, Date: date},
				Inverse: Op{Kind: OpUndo, UUID: u}})
			// The Price is carried by the new scan, so the price step skips this row.
			live[r] = []liveScan{{uuid: u, productID: row.ProductID, qty: float64(grams), price: total, perKg: perKg, shopID: shopID, date: date, priced: true}}
			continue
		}
		qp, ok := accP("quantity", r)
		if !ok {
			continue
		}
		target := deref(qp.After.Count)
		for len(live[r]) < target {
			u := b.newUUID()
			qty := float64(newPack[r])
			b.add(Step{Phase: PhaseQuantity,
				Op:      Op{Kind: OpNewScan, UUID: u, ProductID: row.ProductID, Quantity: qty, PriceCents: row.PriceCents, PerKgCents: -1, ShopID: shopID, Date: date},
				Inverse: Op{Kind: OpUndo, UUID: u}})
			live[r] = append(live[r], liveScan{uuid: u, productID: row.ProductID, qty: qty, price: row.PriceCents, perKg: -1, shopID: shopID, date: date})
		}
		for len(live[r]) > target {
			last := live[r][len(live[r])-1]
			b.add(Step{Phase: PhaseQuantity, Op: Op{Kind: OpUndo, UUID: last.uuid}, Inverse: last.restoreOp(in.ReadID)})
			live[r] = live[r][:len(live[r])-1]
		}
	}

	// Price: one set of Prices per row, on the events the earlier phases did not already price.
	for r := range rows {
		if removed[r] {
			continue
		}
		prP, ok := accP("price", r)
		if !ok {
			continue
		}
		var changes, prev []PriceChange
		for i := range live[r] {
			e := &live[r][i]
			if e.priced {
				continue
			}
			price, perKg := priceFor(prP.After, e.qty)
			changes = append(changes, PriceChange{UUID: e.uuid, PriceCents: price, PerKgCents: perKg})
			prev = append(prev, PriceChange{UUID: e.uuid, PriceCents: e.price, PerKgCents: e.perKg})
			e.price, e.perKg, e.priced = price, perKg, true
		}
		if len(changes) > 0 {
			b.add(Step{Phase: PhasePrice, Op: Op{Kind: OpSetPrices, Prices: changes}, Inverse: Op{Kind: OpSetPrices, Prices: prev}})
		}
	}

	// Add: create the Product, then scan it: one scan for a weighed line, one per pack otherwise.
	for _, p := range in.Proposals {
		if p.Kind != KindAdd || !acc[p.ID] {
			continue
		}
		c := in.Adds[p.ID]
		ing := c.Ingredient
		b.add(Step{Phase: PhaseAdd,
			Op:      Op{Kind: OpCreateProduct, Ref: p.ID, Name: c.ProductName, PackSize: c.PackSize, BaseUnit: addBaseUnit(c, p.After), Ingredient: &ing},
			Inverse: Op{Kind: OpDeleteProduct, Ref: p.ID}})
		price := -1
		if p.After.PriceCents != nil {
			price = *p.After.PriceCents
		}
		if p.After.Count == nil && p.After.Grams != nil {
			u := b.newUUID()
			b.add(Step{Phase: PhaseAdd,
				Op:      Op{Kind: OpNewScan, UUID: u, Ref: p.ID, Quantity: float64(*p.After.Grams), PriceCents: price, PerKgCents: -1, ShopID: shopID, Date: date},
				Inverse: Op{Kind: OpUndo, UUID: u}})
			continue
		}
		count := deref(p.After.Count)
		if count == 0 {
			count = 1
		}
		perPack := -1
		if price >= 0 {
			perPack = roundDiv(price, count)
		}
		for k := 0; k < count; k++ {
			u := b.newUUID()
			b.add(Step{Phase: PhaseAdd,
				Op:      Op{Kind: OpNewScan, UUID: u, Ref: p.ID, Quantity: float64(c.PackSize), PriceCents: perPack, PerKgCents: -1, ShopID: shopID, Date: date},
				Inverse: Op{Kind: OpUndo, UUID: u}})
		}
	}

	// Remove: undo every event of a row that is not on the receipt.
	for r := range rows {
		if !removed[r] {
			continue
		}
		for _, e := range live[r] {
			b.add(Step{Phase: PhaseRemove, Op: Op{Kind: OpUndo, UUID: e.uuid}, Inverse: e.restoreOp(in.ReadID)})
		}
	}

	return Plan{Steps: b.steps}, nil
}

// completeChoice: an Add needs an Ingredient (an ID, or a new one with a name) and a Product name.
func completeChoice(c AddChoice) bool {
	if c.ProductName == "" {
		return false
	}
	if c.Ingredient.New != nil {
		return c.Ingredient.New.Name != ""
	}
	return c.Ingredient.ID != 0
}

// addBaseUnit is the Base Unit of an Add's Product: the new Ingredient's, else the line's unit.
func addBaseUnit(c AddChoice, after Value) string {
	if c.Ingredient.New != nil && c.Ingredient.New.BaseUnit != "" {
		return c.Ingredient.New.BaseUnit
	}
	if after.Grams != nil {
		return "g"
	}
	if after.PackUnit != "" {
		return after.PackUnit
	}
	return "piece"
}

// priceFor is the stored Price of an event of quantity qty for a Price proposal: per kg, the total is round(perKg × qty
// / 1000); per pack, it is the pack Price.
func priceFor(v Value, qty float64) (price, perKg int) {
	val := deref(v.PriceCents)
	if v.PerKg {
		return roundDiv(val*int(math.Round(qty)), 1000), val
	}
	return val, -1
}

func deref(p *int) int {
	if p == nil {
		return 0
	}
	return *p
}
