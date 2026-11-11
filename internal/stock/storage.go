package stock

// Storage Places (Pantry): where Stock Lots are kept. The kind decides which Shelf Life counts: a Lot in a Freezer
// uses the Ingredient's frozen Shelf Life when it has one.

// Kind is a Storage Place's kind.
type Kind string

const (
	KindPantry  Kind = "pantry"
	KindFridge  Kind = "fridge"
	KindFreezer Kind = "freezer"
	// KindNone is a Lot in no Storage Place (not sorted yet); it counts like a pantry or fridge.
	KindNone Kind = ""
)

// ValidKind reports whether k is pantry, fridge or freezer.
func ValidKind(k Kind) bool { return k == KindPantry || k == KindFridge || k == KindFreezer }

// ShelfLifeIn is the Shelf Life that counts in a place of kind k: the frozen one in a Freezer when the Ingredient
// has one, else the ordinary one (nil = does not spoil).
func ShelfLifeIn(k Kind, shelfLife, frozenShelfLife *int) *int {
	if k == KindFreezer && frozenShelfLife != nil {
		return frozenShelfLife
	}
	return shelfLife
}

// GoOffAfterMove is a Lot's go-off date after it moves from a place of kind `from` to one of kind `to` on `today`:
//   - into a Freezer (from anywhere else), with a frozen Shelf Life: today + the frozen Shelf Life;
//   - out of a Freezer (to anywhere else), with an ordinary Shelf Life: today + that Shelf Life (it starts again once
//     thawed);
//   - otherwise (same kind, pantry to fridge, or no Shelf Life that applies): unchanged.
func GoOffAfterMove(current Date, from, to Kind, today Date, shelfLife, frozenShelfLife *int) Date {
	switch {
	case to == KindFreezer && from != KindFreezer && frozenShelfLife != nil:
		return today.AddDays(*frozenShelfLife)
	case from == KindFreezer && to != KindFreezer && shelfLife != nil:
		return today.AddDays(*shelfLife)
	}
	return current
}
