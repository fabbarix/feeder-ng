package httpapi

import (
	"encoding/json"
	"time"

	"github.com/fabbarix/feeder-ng/internal/away"
)

// awayIn is a new Away: from (required), fromMealSlotId (null or absent = the whole first day), through (null or absent
// = no last day yet), throughMealSlotId (null or absent = the whole last day).
type awayIn struct {
	From              string  `json:"from"`
	FromMealSlotID    *int64  `json:"fromMealSlotId"`
	Through           *string `json:"through"`
	ThroughMealSlotID *int64  `json:"throughMealSlotId"`
}

func idOf(p *int64) int64 {
	if p == nil {
		return 0
	}
	return *p
}

// create is the Away of the Member the body asks for, applying from now.
func (in awayIn) create(memberID int64, now time.Time) (away.Away, error) {
	x := away.Away{MemberID: memberID, From: in.From, FromSlot: idOf(in.FromMealSlotID),
		ThroughSlot: idOf(in.ThroughMealSlotID), Since: now}
	if in.Through != nil {
		x.Through = *in.Through
	}
	return x, nil
}

// awayPatch is a change of an Away: only the fields sent change. A first or last day sent without its Meal Slot, and
// different from the one stored, is the whole day; through null is "No last day yet".
type awayPatch struct {
	From              json.RawMessage `json:"from"`
	FromMealSlotID    json.RawMessage `json:"fromMealSlotId"`
	Through           json.RawMessage `json:"through"`
	ThroughMealSlotID json.RawMessage `json:"throughMealSlotId"`
}

func isNull(raw json.RawMessage) bool { return string(raw) == "null" }

// date reads a date field: null is "" (allowed for through only); anything but a string is date_invalid.
func date(raw json.RawMessage, field string, nullable bool) (string, error) {
	if isNull(raw) {
		if nullable {
			return "", nil
		}
		return "", &away.Error{Field: field, Reason: "date_invalid"}
	}
	var s string
	if err := json.Unmarshal(raw, &s); err != nil {
		return "", &away.Error{Field: field, Reason: "date_invalid"}
	}
	return s, nil
}

// slotID reads a Meal Slot field: null is the whole day; anything but a number is slot_not_on_day.
func slotID(raw json.RawMessage, field string) (int64, error) {
	if isNull(raw) {
		return 0, nil
	}
	var id int64
	if err := json.Unmarshal(raw, &id); err != nil {
		return 0, &away.Error{Field: field, Reason: "slot_not_on_day"}
	}
	return id, nil
}

// apply is the stored Away with the patch. Since moves to now when the first day or its Meal Slot changes: the edited
// Away applies from now on.
func (p awayPatch) apply(before away.Away, now time.Time) (away.Away, error) {
	x := before
	var err error
	if p.From != nil {
		if x.From, err = date(p.From, "from", false); err != nil {
			return away.Away{}, err
		}
		if x.From != before.From {
			x.FromSlot = 0
		}
	}
	if p.FromMealSlotID != nil {
		if x.FromSlot, err = slotID(p.FromMealSlotID, "fromMealSlotId"); err != nil {
			return away.Away{}, err
		}
	}
	if p.Through != nil {
		if x.Through, err = date(p.Through, "through", true); err != nil {
			return away.Away{}, err
		}
		if x.Through != before.Through {
			x.ThroughSlot = 0
		}
	}
	if p.ThroughMealSlotID != nil {
		if x.ThroughSlot, err = slotID(p.ThroughMealSlotID, "throughMealSlotId"); err != nil {
			return away.Away{}, err
		}
	}
	if x.From != before.From || x.FromSlot != before.FromSlot {
		x.Since = now
	}
	return x, nil
}
