package planner

import (
	"math"
	"sort"
)

// stockFacts summarises the projected lots of one Ingredient on one day.
type stockFacts struct {
	all        float64 // every available lot
	atRisk     float64 // available lots going off within PerishWindowDays
	atRiskDay  int     // earliest go-off date among the at-risk lots
	planned    float64 // available pack remainders of planned purchases
	plannedDay int     // earliest purchase date among them
}

func (st *state) lotStats(ing IngredientID, day int) stockFacts {
	f := stockFacts{atRiskDay: noDay, plannedDay: noDay}
	window := day + st.cfg.PerishWindowDays
	for _, l := range st.lots {
		if l.ing != ing || l.qty <= eps || (l.goesOff != noDay && l.goesOff < day) {
			continue
		}
		f.all += l.qty
		if l.goesOff != noDay && l.goesOff <= window {
			f.atRisk += l.qty
			if l.goesOff < f.atRiskDay {
				f.atRiskDay = l.goesOff
			}
		}
		if l.planned {
			f.planned += l.qty
			if l.purchased < f.plannedDay {
				f.plannedDay = l.purchased
			}
		}
	}
	return f
}

// consume takes qty from the projected lots of ing usable on day, soonest to
// go off first, then oldest purchase, then lot id. It returns the shortfall.
func (st *state) consume(ing IngredientID, qty float64, day int) float64 {
	var avail []*projLot
	for _, l := range st.lots {
		if l.ing == ing && l.qty > eps && (l.goesOff == noDay || l.goesOff >= day) {
			avail = append(avail, l)
		}
	}
	sort.SliceStable(avail, func(a, b int) bool {
		x, y := avail[a], avail[b]
		if x.goesOff != y.goesOff {
			return x.goesOff < y.goesOff
		}
		if x.purchased != y.purchased {
			return x.purchased < y.purchased
		}
		return x.id < y.id
	})
	need := qty
	for _, l := range avail {
		if need <= eps {
			break
		}
		take := math.Min(l.qty, need)
		l.qty -= take
		need -= take
	}
	st.pruneLots()
	if need < eps {
		return 0
	}
	return need
}

func (st *state) pruneLots() {
	kept := st.lots[:0]
	for _, l := range st.lots {
		if l.qty > eps {
			kept = append(kept, l)
		}
	}
	st.lots = kept
}

// consumeNeeds deducts batches x quantity for each non-optional line and plans
// the purchases for any shortfall. It returns this meal's purchases by Ingredient.
func (st *state) consumeNeeds(r Recipe, batches float64, day int) []Purchase {
	var out []Purchase
	for _, n := range r.Needs {
		if n.Optional {
			continue
		}
		qty := n.Quantity * batches
		if qty <= eps {
			continue
		}
		short := st.consume(n.IngredientID, qty, day)
		if short <= eps {
			continue
		}
		p := st.buy(n.IngredientID, short, day)
		st.record(p)
		out = mergePurchase(out, p)
	}
	sort.SliceStable(out, func(a, b int) bool { return out[a].IngredientID < out[b].IngredientID })
	return out
}

// buy plans the purchase covering a shortfall. With a Product last bought, it
// rounds up to whole packs and keeps the remainder as a planned lot.
func (st *state) buy(ing IngredientID, short float64, day int) Purchase {
	pack, ok := st.in.Packs[ing]
	if !ok || pack.Size <= eps {
		return Purchase{IngredientID: ing, Shortfall: short, Quantity: short}
	}
	packs := int(math.Ceil(short/pack.Size - 1e-9))
	if packs < 1 {
		packs = 1
	}
	bought := float64(packs) * pack.Size
	goesOff := noDay
	if shelf, ok := st.in.ShelfLifeDays[ing]; ok {
		goesOff = day + shelf
	}
	st.lots = append(st.lots, &projLot{id: st.nextLot, ing: ing, qty: bought, purchased: day, goesOff: goesOff, planned: true})
	st.nextLot++
	st.consume(ing, short, day)
	return Purchase{
		IngredientID: ing,
		ProductID:    pack.ProductID,
		Shortfall:    short,
		Packs:        packs,
		PackSize:     pack.Size,
		Quantity:     bought,
	}
}

// record adds a purchase to the walk's totals, one entry per Ingredient.
func (st *state) record(p Purchase) {
	if agg, ok := st.purchases[p.IngredientID]; ok {
		addPurchase(agg, p)
		return
	}
	cp := p
	st.purchases[p.IngredientID] = &cp
}

func mergePurchase(list []Purchase, p Purchase) []Purchase {
	for k := range list {
		if list[k].IngredientID == p.IngredientID {
			addPurchase(&list[k], p)
			return list
		}
	}
	return append(list, p)
}

func addPurchase(agg *Purchase, p Purchase) {
	agg.Shortfall += p.Shortfall
	agg.Packs += p.Packs
	agg.Quantity += p.Quantity
	if p.Packs > 0 {
		agg.ProductID = p.ProductID
		agg.PackSize = p.PackSize
	}
}
