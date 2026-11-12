package httpapi

import (
	"errors"
	"net/http"

	"github.com/fabbarix/feeder-ng/internal/httpx"
	"github.com/fabbarix/feeder-ng/internal/tag"
)

// tagJSON is a Tag as GET /api/tags and every single-Tag answer show it.
type tagJSON struct {
	ID          int64  `json:"id"`
	Name        string `json:"name"`
	Key         string `json:"key"`
	Colour      string `json:"colour"`
	Recipes     int    `json:"recipes"`
	SlotRules   int    `json:"slotRules"`
	VarietyRule bool   `json:"varietyRule"`
}

func tagOut(l tag.Listing) tagJSON {
	return tagJSON{ID: l.ID, Name: l.Name, Key: l.Key, Colour: l.Colour, Recipes: l.Recipes,
		SlotRules: l.SlotRules, VarietyRule: l.VarietyRule}
}

func tagsOut(list []tag.Listing) []tagJSON {
	out := make([]tagJSON, 0, len(list))
	for _, l := range list {
		out = append(out, tagOut(l))
	}
	return out
}

// impactJSON is what a Merge or Delete of the Tag touches (GET /api/tags/{id}/impact).
type impactJSON struct {
	Recipes     int             `json:"recipes"`
	SlotRules   []impactRuleOut `json:"slotRules"`
	VarietyRule *varietyOut     `json:"varietyRule"`
	BothRecipes *int            `json:"bothRecipes,omitempty"`
}

// impactRuleOut is a Slot Rule that names the Tag, with where it applies.
type impactRuleOut struct {
	ID           int64  `json:"id"`
	MealSlotID   int64  `json:"mealSlotId"`
	MealSlotName string `json:"mealSlotName"`
	Weekday      int    `json:"weekday"`
	CourseID     int64  `json:"courseId"`
	CourseName   string `json:"courseName"`
	Tag          string `json:"tag"`
}

type varietyOut struct {
	Tag                string `json:"tag"`
	MaxPerWeek         int    `json:"maxPerWeek"`
	NotConsecutiveDays bool   `json:"notConsecutiveDays"`
}

func impactOut(im tag.Impact) impactJSON {
	out := impactJSON{Recipes: im.Recipes, SlotRules: make([]impactRuleOut, 0, len(im.SlotRules))}
	for _, r := range im.SlotRules {
		out.SlotRules = append(out.SlotRules, impactRuleOut{ID: r.ID, MealSlotID: r.MealSlotID,
			MealSlotName: r.MealSlotName, Weekday: r.Weekday, CourseID: r.CourseID, CourseName: r.CourseName, Tag: im.Key})
	}
	if v := im.VarietyRule; v != nil {
		out.VarietyRule = &varietyOut{Tag: im.Key, MaxPerWeek: v.MaxPerWeek, NotConsecutiveDays: v.NotConsecutiveDays}
	}
	return out
}

// refusal is the body of an error: {"error": {...}}. Field, reason and tag appear when set.
type refusal struct {
	Code    string  `json:"code"`
	Message string  `json:"message"`
	Field   string  `json:"field,omitempty"`
	Reason  string  `json:"reason,omitempty"`
	Tag     *tagRef `json:"tag,omitempty"`
}

// tagRef names the other Tag in a tag_name_taken refusal.
type tagRef struct {
	ID     int64  `json:"id"`
	Name   string `json:"name"`
	Colour string `json:"colour"`
}

func writeRefusal(w http.ResponseWriter, status int, rf refusal) {
	httpx.WriteJSON(w, status, map[string]refusal{"error": rf})
}

// fail maps a store or domain error to the API's answer (tg-api design note, Errors).
func (a *api) fail(w http.ResponseWriter, err error) {
	var taken *tag.NameTakenError
	switch {
	case errors.Is(err, tag.ErrNotFound):
		writeRefusal(w, http.StatusNotFound, refusal{Code: "not_found", Message: "Not found"})
	case errors.Is(err, tag.ErrNameInvalid):
		writeRefusal(w, http.StatusUnprocessableEntity, refusal{Code: "validation_failed", Field: "name",
			Reason: "tag_invalid", Message: "A Tag name needs 1 to 40 characters"})
	case errors.Is(err, tag.ErrColourUnknown):
		writeRefusal(w, http.StatusUnprocessableEntity, refusal{Code: "validation_failed", Field: "colour",
			Reason: "colour_unknown", Message: "Choose one of the ten Tag colours"})
	case errors.Is(err, tag.ErrMergeSelf):
		writeRefusal(w, http.StatusUnprocessableEntity, refusal{Code: "validation_failed", Field: "into",
			Message: "A Tag cannot be merged into itself"})
	case errors.Is(err, tag.ErrMergeTarget):
		writeRefusal(w, http.StatusUnprocessableEntity, refusal{Code: "validation_failed", Field: "into",
			Message: "Choose another Tag to merge into"})
	case errors.As(err, &taken):
		writeRefusal(w, http.StatusConflict, refusal{Code: "tag_name_taken",
			Message: "Another Tag already has that name",
			Tag:     &tagRef{ID: taken.Tag.ID, Name: taken.Tag.Name, Colour: taken.Tag.Colour}})
	default:
		httpx.WriteAPIError(w, err)
	}
}
