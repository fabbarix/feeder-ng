package notify

import (
	"fmt"
	"sort"
	"time"

	"github.com/fabbarix/feeder-ng/internal/household"
)

// Deep links (Payload.URL): the screen that acts on each notification.
const (
	planURL  = "/plan"
	stockURL = "/stock"

	accessRequestsURL = "/settings/access-requests"
	// maxBody caps a push body: it carries Google-supplied text.
	maxBody = 200
)

// ConfirmAfter is how long after the slot time an unconfirmed Planned Meal is
// asked about (spec §8, Confirm Cooked).
const ConfirmAfter = 2 * time.Hour

// LeftoverHour and StockHour are the household-local times the Leftover Use-by
// and Stock go-off reminders are sent.
const (
	LeftoverHour = 10
	StockHour    = 10
)

// Compute turns facts into the notifications they imply (spec §12), in the
// household time zone loc. Order is by At, then Key.
func Compute(f Facts, loc *time.Location) []Candidate {
	var out []Candidate
	for _, m := range f.Meals {
		if m.State != MealPlanned {
			continue
		}
		slot := m.SlotAt.In(loc).Format("15:04")
		meal := fmt.Sprintf("%s/%d", m.Date, m.MealSlotID)
		if !m.FromLeftover {
			for _, s := range m.AdvanceSteps {
				at := m.SlotAt.Add(-s.Lead)
				out = append(out, Candidate{
					Key:   candidateKey(AdvanceStep, fmt.Sprintf("%s/%d", meal, s.ID), at),
					Type:  AdvanceStep,
					At:    at,
					Title: "Advance Step",
					Body:  fmt.Sprintf("%s now for %s", s.Description, slot),
					URL:   planURL,
				})
			}
			if m.TotalTime > 0 {
				at := m.SlotAt.Add(-m.TotalTime)
				out = append(out, Candidate{
					Key:   candidateKey(StartCooking, meal, at),
					Type:  StartCooking,
					At:    at,
					Title: "Start cooking",
					Body:  fmt.Sprintf("Start cooking %s now to eat at %s", m.RecipeName, slot),
					URL:   planURL,
				})
			}
		}
		at := m.SlotAt.Add(ConfirmAfter)
		out = append(out, Candidate{
			Key:   candidateKey(ConfirmCooked, meal, at),
			Type:  ConfirmCooked,
			At:    at,
			Title: "Confirm Cooked",
			Body:  fmt.Sprintf("Did you cook %s?", m.RecipeName),
			URL:   planURL,
		})
	}
	for _, l := range f.Leftovers {
		day, ok := dayAt(l.UseBy, LeftoverHour, loc)
		if !ok {
			continue
		}
		out = append(out, Candidate{
			Key:   candidateKey(LeftoverUseBy, fmt.Sprint(l.ID), day),
			Type:  LeftoverUseBy,
			At:    day,
			Title: "Leftover",
			Body:  fmt.Sprintf("Use up the %s (%s) today", l.RecipeName, portions(l.Portions)),
			URL:   planURL,
		})
	}
	for _, lot := range f.Lots {
		if lot.GoesOff == "" || lot.UsedByPlan {
			continue
		}
		goes, ok := dayAt(lot.GoesOff, StockHour, loc)
		if !ok {
			continue
		}
		at := goes.AddDate(0, 0, -1)
		out = append(out, Candidate{
			Key:   candidateKey(StockSpoil, fmt.Sprint(lot.ID), at),
			Type:  StockSpoil,
			At:    at,
			Title: "Stock about to spoil",
			Body:  fmt.Sprintf("%s goes off tomorrow and no Planned Meal uses it", lot.IngredientName),
			URL:   stockURL,
		})
	}
	for _, a := range f.AccessRequests {
		out = append(out, Candidate{
			Key:   candidateKey(AccessRequest, fmt.Sprint(a.ID), a.RequestedAt),
			Type:  AccessRequest,
			At:    a.RequestedAt,
			Title: "New sign-in request",
			Body:  capRunes(fmt.Sprintf("%s (%s) wants to join Feeder", a.Name, a.Email), maxBody),
			URL:   accessRequestsURL,
		})
	}
	sortCandidates(out)
	return out
}

// capRunes shortens s to at most n runes, ending in an ellipsis when it was cut.
func capRunes(s string, n int) string {
	if r := []rune(s); len(r) > n {
		return string(r[:n-1]) + "…"
	}
	return s
}

// DeferQuiet returns at when its household-local time is outside the quiet
// window, otherwise the end of the window that contains it (start inclusive, end
// exclusive, wrapping midnight). An empty window (start = end) is never quiet.
func DeferQuiet(at time.Time, q household.QuietHours, loc *time.Location) time.Time {
	start, okS := clockSeconds(q.Start)
	end, okE := clockSeconds(q.End)
	if !okS || !okE || start == end {
		return at
	}
	local := at.In(loc)
	now := local.Hour()*3600 + local.Minute()*60 + local.Second()
	var quiet bool
	if start < end {
		quiet = now >= start && now < end
	} else {
		quiet = now >= start || now < end
	}
	if !quiet {
		return at
	}
	day := local.Day()
	if start > end && now >= start {
		day++ // the evening half of a wrapping window ends the next morning
	}
	endH, endM := end/3600, (end%3600)/60
	return time.Date(local.Year(), local.Month(), day, endH, endM, 0, 0, loc)
}

// DueNow returns the candidates to send at now: their send time (deferred by
// quiet hours, except TimerFinished) has arrived and is less than Grace old.
// Sorted by SendAt, then Key.
func DueNow(cands []Candidate, now time.Time, q household.QuietHours, loc *time.Location) []Due {
	var out []Due
	for _, c := range cands {
		sendAt := c.At
		if c.Type != TimerFinished {
			sendAt = DeferQuiet(c.At, q, loc)
		}
		if sendAt.After(now) || now.Sub(sendAt) >= Grace {
			continue
		}
		out = append(out, Due{Candidate: c, SendAt: sendAt})
	}
	sort.SliceStable(out, func(i, j int) bool {
		if !out[i].SendAt.Equal(out[j].SendAt) {
			return out[i].SendAt.Before(out[j].SendAt)
		}
		return out[i].Key < out[j].Key
	})
	return out
}

// StepDue is one Advance Step of a Planned Meal on a day, for the Today screen.
type StepDue struct {
	MealDate    string
	MealSlotID  int64
	RecipeName  string
	Description string
	SlotAt      time.Time
	DueAt       time.Time // SlotAt minus the lead time
}

// AdvanceStepsOn lists the Advance Steps of the Planned Meals dated day
// (household date), soonest first. Cooked and skipped meals and Leftover-served
// meals have none to list.
func AdvanceStepsOn(f Facts, day string, loc *time.Location) []StepDue {
	var out []StepDue
	for _, m := range f.Meals {
		if m.Date != day || m.State != MealPlanned || m.FromLeftover {
			continue
		}
		for _, s := range m.AdvanceSteps {
			out = append(out, StepDue{
				MealDate: m.Date, MealSlotID: m.MealSlotID, RecipeName: m.RecipeName,
				Description: s.Description, SlotAt: m.SlotAt.In(loc), DueAt: m.SlotAt.Add(-s.Lead).In(loc),
			})
		}
	}
	sort.SliceStable(out, func(i, j int) bool {
		if !out[i].DueAt.Equal(out[j].DueAt) {
			return out[i].DueAt.Before(out[j].DueAt)
		}
		return out[i].Description < out[j].Description
	})
	return out
}

// candidateKey is "<type>:<identity>@<due instant in UTC>": a moved due time
// makes a new key, a repeated tick makes the same one.
func candidateKey(t Type, identity string, at time.Time) string {
	return string(t) + ":" + identity + "@" + at.UTC().Format(time.RFC3339)
}

func sortCandidates(cs []Candidate) {
	sort.SliceStable(cs, func(i, j int) bool {
		if !cs[i].At.Equal(cs[j].At) {
			return cs[i].At.Before(cs[j].At)
		}
		return cs[i].Key < cs[j].Key
	})
}

// dayAt is 'hour':00 on the household date ymd, in loc.
func dayAt(ymd string, hour int, loc *time.Location) (time.Time, bool) {
	d, err := time.ParseInLocation("2006-01-02", ymd, loc)
	if err != nil {
		return time.Time{}, false
	}
	return time.Date(d.Year(), d.Month(), d.Day(), hour, 0, 0, 0, loc), true
}

func portions(n float64) string {
	if n == 1 {
		return "1 portion"
	}
	return fmt.Sprintf("%g portions", n)
}

// clockSeconds parses "HH:MM" into seconds after midnight.
func clockSeconds(hhmm string) (int, bool) {
	t, err := time.Parse("15:04", hhmm)
	if err != nil {
		return 0, false
	}
	return t.Hour()*3600 + t.Minute()*60, true
}
