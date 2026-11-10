// Package cook holds the pure rules of Cook Mode and the kitchen board: timers
// whose remaining time is computed from a start time, scopes, the Cook Mode
// view of a Recipe, the next Advance Step and the zero-waste streak. No HTTP,
// SQL or clock: callers pass the time.
package cook

import (
	"errors"
	"strings"
	"time"
	"unicode/utf8"
)

// TimerState is where a timer is in its life. Cancelling deletes the timer.
type TimerState string

// The three states of a timer.
const (
	Running  TimerState = "running"
	Paused   TimerState = "paused"
	Finished TimerState = "finished"
)

// MaxTimerSeconds is the longest timer (24 h).
const MaxTimerSeconds = 86400

// Errors returned by timer operations.
var (
	ErrInvalidDuration = errors.New("timer duration must be between 1 second and 24 hours")
	ErrNotRunning      = errors.New("timer is not running")
	ErrNotPaused       = errors.New("timer is not paused")
)

// Timer is one countdown. Running: EndsAt is when it ends. Paused: RemainingMs
// is what is left and EndsAt is unused. Finished: EndsAt is when it ended.
type Timer struct {
	ID              int64
	Scope           Scope // "" for a free timer
	Step            *int  // 0-based index into the Recipe's Steps; nil for a free timer
	Label           string
	DurationSeconds int
	State           TimerState
	StartedAt       time.Time
	EndsAt          time.Time
	RemainingMs     int64
}

// StartTimer returns a running timer that ends durationSeconds after now.
func StartTimer(now time.Time, scope Scope, step *int, label string, durationSeconds int) (Timer, error) {
	if durationSeconds < 1 || durationSeconds > MaxTimerSeconds {
		return Timer{}, ErrInvalidDuration
	}
	return Timer{
		Scope:           scope,
		Step:            step,
		Label:           label,
		DurationSeconds: durationSeconds,
		State:           Running,
		StartedAt:       now,
		EndsAt:          now.Add(time.Duration(durationSeconds) * time.Second),
	}, nil
}

// Remaining is the time left at now (never negative): running counts down to
// EndsAt, paused is RemainingMs, finished is 0.
func (t Timer) Remaining(now time.Time) time.Duration {
	var left time.Duration
	switch t.State {
	case Running:
		left = t.EndsAt.Sub(now)
	case Paused:
		left = time.Duration(t.RemainingMs) * time.Millisecond
	}
	if left < 0 {
		return 0
	}
	return left
}

// RemainingSeconds is Remaining rounded up to whole seconds (what the tile shows).
func (t Timer) RemainingSeconds(now time.Time) int {
	left := t.Remaining(now)
	secs := int(left / time.Second)
	if left%time.Second > 0 {
		secs++
	}
	return secs
}

// Settle turns a running timer whose end has passed into a finished one. The
// bool reports whether it changed. Other timers are returned as they are.
func (t Timer) Settle(now time.Time) (Timer, bool) {
	if t.State != Running || now.Before(t.EndsAt) {
		return t, false
	}
	t.State = Finished
	return t, true
}

// Pause freezes a running timer (ErrNotRunning otherwise, including a running
// timer whose end has already passed).
func (t Timer) Pause(now time.Time) (Timer, error) {
	if t.State != Running || !now.Before(t.EndsAt) {
		return t, ErrNotRunning
	}
	t.RemainingMs = t.EndsAt.Sub(now).Milliseconds()
	t.State = Paused
	return t, nil
}

// Resume restarts a paused timer from its remaining time (ErrNotPaused otherwise).
func (t Timer) Resume(now time.Time) (Timer, error) {
	if t.State != Paused {
		return t, ErrNotPaused
	}
	t.EndsAt = now.Add(time.Duration(t.RemainingMs) * time.Millisecond)
	t.State = Running
	return t, nil
}

// TimerLabel is the default label of a Passive Step's timer: "Step 3" followed
// by ": " and the Step text cut to 30 runes with an ellipsis when longer.
func TimerLabel(number int, text string) string {
	label := "Step " + itoa(number)
	if text == "" {
		return label
	}
	const maxRunes = 30
	if utf8.RuneCountInString(text) > maxRunes {
		text = string([]rune(text)[:maxRunes]) + "…"
	}
	return label + ": " + text
}

func itoa(n int) string {
	var b strings.Builder
	if n < 0 {
		b.WriteByte('-')
		n = -n
	}
	var digits []byte
	for {
		digits = append([]byte{byte('0' + n%10)}, digits...)
		n /= 10
		if n == 0 {
			break
		}
	}
	b.Write(digits)
	return b.String()
}
