// Package notify decides which Web Push notifications are due (spec §12) and
// sends each one once. This package is pure domain logic: no net/http, no
// database/sql. Facts come in through FactSource, devices through
// Subscriptions, delivery through Sender, all of which are ports.
package notify

import (
	"errors"
	"time"

	"github.com/fabbarix/feeder-ng/internal/recipe/schedule"
)

// Type is one notification type a User can opt in to per device. The string
// values are the JSON and database identifiers.
type Type string

// The notification types of spec §12.
const (
	AdvanceStep   Type = "advanceStep"
	StartCooking  Type = "startCooking"
	ConfirmCooked Type = "confirmCooked"
	LeftoverUseBy Type = "leftoverUseBy"
	StockSpoil    Type = "stockSpoil"
	TimerFinished Type = "timerFinished"
	// AccessRequest: someone asked to sign in (spec §12; A1).
	AccessRequest Type = "accessRequest"
)

// AllTypes lists every type in display order.
func AllTypes() []Type {
	return []Type{AdvanceStep, StartCooking, ConfirmCooked, LeftoverUseBy, StockSpoil, TimerFinished, AccessRequest}
}

// ParseType returns the Type for s, or false when s is not one.
func ParseType(s string) (Type, bool) {
	for _, t := range AllTypes() {
		if string(t) == s {
			return t, true
		}
	}
	return "", false
}

// Grace is how late a notification may still be sent. A Feeder that was down
// for longer does not replay stale reminders.
const Grace = 6 * time.Hour

// Meal states, as Planning stores them.
const MealPlanned = "planned"

// Facts is everything the due computation needs, gathered by a FactSource.
type Facts struct {
	Meals     []MealFact
	Leftovers []LeftoverFact
	Lots      []LotFact
	// AccessRequests are the pending Access Requests (A1).
	AccessRequests []AccessRequestFact
}

// MealFact is one Planned Meal: one Course of a Meal Slot (ADR 0008). A FactSource lists the
// Planned Meals of a slot together, in the slot's Course order, which is the order Compute gives
// cook.Timeline.
type MealFact struct {
	Date         string // household date of the slot, YYYY-MM-DD
	MealSlotID   int64
	CourseID     int64 // the Course this Planned Meal fills
	RecipeName   string
	SlotAt       time.Time // the slot instant (exact)
	State        string    // MealPlanned, or cooked / skipped (no reminders)
	FromLeftover bool      // served from a Leftover: nothing to start or prepare
	// Steps are the Recipe's Steps (Advance Steps included, as schedule.Compute wants them). They feed
	// cook.Timeline for Start cooking. Empty for a Leftover-served meal.
	Steps []schedule.Step
	// ReheatSeconds is the length of the Reheat of a Leftover-served meal (FromLeftover); 0 = no Reheat
	// to place on the timeline.
	ReheatSeconds int
	AdvanceSteps  []AdvanceStepFact
}

// AdvanceStepFact is one Advance Step of the meal's Recipe.
type AdvanceStepFact struct {
	ID          int64
	Description string        // "Marinate the chicken"
	Lead        time.Duration // how long before the slot it must start
}

// LeftoverFact is an available Leftover.
type LeftoverFact struct {
	ID         int64
	RecipeName string
	Portions   float64
	UseBy      string // YYYY-MM-DD, household date
}

// LotFact is a Stock Lot with a go-off date.
type LotFact struct {
	ID             int64
	IngredientName string
	GoesOff        string // YYYY-MM-DD, "" when it never goes off
	UsedByPlan     bool   // some Planned Meal will use it before it goes off
}

// AccessRequestFact is one pending Access Request. Name and Email come from Google and are untrusted text.
type AccessRequestFact struct {
	ID          int64
	Name        string
	Email       string
	RequestedAt time.Time
}

// Candidate is one notification and the instant it falls due, before quiet
// hours. Key is stable across ticks and is the dedupe key.
type Candidate struct {
	Key   string
	Type  Type
	At    time.Time
	Title string
	Body  string
	URL   string
}

// Due is a Candidate with its send time after quiet-hours deferral.
type Due struct {
	Candidate
	SendAt time.Time
}

// Payload is the JSON the service worker receives.
type Payload struct {
	Type  Type   `json:"type"`
	Title string `json:"title"`
	Body  string `json:"body"`
	URL   string `json:"url"`
	Tag   string `json:"tag"`
}

// Target is one subscribed device to push to.
type Target struct {
	ID       int64
	UserID   int64
	Endpoint string
	P256dh   string
	Auth     string
}

// Device is a subscription as the settings screen shows it.
type Device struct {
	ID           int64
	UserID       int64
	Label        string
	EndpointHash string
	CreatedAt    time.Time
	Types        map[Type]bool // every Type present, false when off
}

// SubscriptionInput is what a browser registers.
type SubscriptionInput struct {
	Endpoint string
	P256dh   string
	Auth     string
	Label    string
	Types    map[Type]bool // nil = leave off (new) / replace with none (existing)
}

// TimerEvent is the end of a running timer (published by Cook Mode / the board).
type TimerEvent struct {
	TimerID    int64
	Label      string
	RecipeName string
	// EndedAt is the instant this run of the timer ended (cook_timers.ends_at).
	// It is part of the dedupe key because SQLite reuses the id of a deleted
	// timer, so the id alone would silence a later timer's push.
	EndedAt time.Time
}

// ErrGone is returned by a Sender when the push service says the subscription
// no longer exists (HTTP 404 or 410). The subscription is then deleted.
var ErrGone = errors.New("notify: subscription gone")
