package httpapi

import (
	"os"
	"strings"
	"testing"
)

// The module must build its Sender with push.NewSender (the SSRF-safe HTTP
// client), never a bare &push.Sender{} literal that could fall back to a plain client.
func TestModuleBuildsItsSenderWithTheSafeConstructor(t *testing.T) {
	src, err := os.ReadFile("httpapi.go")
	if err != nil {
		t.Fatal(err)
	}
	s := string(src)
	if !strings.Contains(s, "push.NewSender(") {
		t.Error("httpapi.go does not call push.NewSender")
	}
	if strings.Contains(s, "&push.Sender{") {
		t.Error("httpapi.go builds a push.Sender literal; use push.NewSender")
	}
}

// TB-14 (B9-12): the Timer finished push lands in the Cook Mode of the timer's scope, so the module must hand the
// finished timer's scope on to the dispatcher (cook.FinishedEvent already has it).
func TestModulePassesTheFinishedTimersScopeToTheDispatcher(t *testing.T) {
	src, err := os.ReadFile("httpapi.go")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(src), "Scope: ev.Scope") {
		t.Error("httpapi.go builds notify.TimerEvent without Scope: ev.Scope")
	}
}
