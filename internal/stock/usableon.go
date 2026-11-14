package stock

// UsableOn is the quantity per Ingredient that the Lots can give on date (beta.8): the Lots with Quantity > 0 and either no
// go-off date or a go-off date not before date. A Lot goes off the day after its go-off date, so one that goes off on date
// is still usable that day. It is the Shopping List's draw rule, shared by Cook Mode's cover check and the notification facts.
func UsableOn(lots []Lot, date Date) map[int64]float64 {
	out := map[int64]float64{}
	for _, l := range lots {
		if l.Quantity <= 0 {
			continue
		}
		if !l.GoesOff.IsNone() && l.GoesOff < date {
			continue
		}
		out[l.IngredientID] += l.Quantity
	}
	return out
}
