package cook

// RoundToMinutes puts a timeline on whole minutes (spec §16, crs-c2 §5.1). The timeline's clock starts at the
// slot time less TotalSeconds; the API starts it at the slot time less whole minutes, ceil(TotalSeconds / 60), so
// every item moves later by the difference and the last one ends at the slot time. It returns the shifted items
// (the input is not modified) and the whole minutes. The API's Steps and Reheat lengths are whole minutes, so this
// only moves the items when a caller hands in a timeline with seconds.
func RoundToMinutes(r Result) (Result, int) {
	minutes := (r.TotalSeconds + 59) / 60
	offset := minutes*60 - r.TotalSeconds
	items := make([]Item, len(r.Items))
	for i, it := range r.Items {
		it.StartSeconds += offset
		it.EndSeconds += offset
		items[i] = it
	}
	return Result{Items: items, TotalSeconds: minutes * 60}, minutes
}
