package httpapi_test

import (
	"context"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/notify"
	notifyhttp "github.com/fabbarix/feeder-ng/internal/notify/httpapi"
	notifystore "github.com/fabbarix/feeder-ng/internal/notify/store"
	"github.com/fabbarix/feeder-ng/internal/testkit"
)

// accessRequest is the notification type of A1 (spec §12 gains a row "Access Request").
const accessRequest notify.Type = "accessRequest"

type recorder struct {
	mu   sync.Mutex
	sent []notify.Payload
	to   []notify.Target
}

func (r *recorder) Send(_ context.Context, to notify.Target, p notify.Payload) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.sent, r.to = append(r.sent, p), append(r.to, to)
	return nil
}

func (r *recorder) count() int { r.mu.Lock(); defer r.mu.Unlock(); return len(r.sent) }

func subscribe(t *testing.T, g *rig, email, endpoint string, on bool) {
	t.Helper()
	u, err := g.env.Auth.UserByEmail(t.Context(), email)
	if err != nil {
		t.Fatal(err)
	}
	st := notifystore.New(g.env.DB, g.env.Clock)
	_, _, err = st.Upsert(t.Context(), u.ID, notify.SubscriptionInput{
		Endpoint: endpoint, P256dh: "p", Auth: "a", Label: "phone", Types: map[notify.Type]bool{accessRequest: on},
	})
	if err != nil {
		t.Fatalf("a device must be able to opt in to %q: %v", accessRequest, err)
	}
}

func TestAccessRequestIsANotificationType(t *testing.T) {
	if got, ok := notify.ParseType("accessRequest"); !ok || got != accessRequest {
		t.Fatalf("ParseType(accessRequest) = %q, %v", got, ok)
	}
	found := false
	for _, ty := range notify.AllTypes() {
		found = found || ty == accessRequest
	}
	if !found {
		t.Fatal("AllTypes must list accessRequest (display order: after timerFinished)")
	}
}

func TestANewRequestPushesToOptedInUsersOnly(t *testing.T) {
	g := start(t)
	subscribe(t, g, testkit.UserEmail, "https://push.example/user", true)
	subscribe(t, g, testkit.AdminEmail, "https://push.example/admin", false)
	rec := &recorder{}
	disp := notifyhttp.DispatcherFor(g.env.DB)
	disp.SetSender(rec)

	g.ask("zia@example.test", "Zia Rosa")
	if _, err := disp.Tick(t.Context()); err != nil {
		t.Fatal(err)
	}
	if rec.count() != 1 || rec.to[0].Endpoint != "https://push.example/user" {
		t.Fatalf("pushes = %+v to %+v, want one to the opted-in User's device", rec.sent, rec.to)
	}
	p := rec.sent[0]
	if p.Type != accessRequest || p.URL != "/settings/access-requests" || !strings.Contains(p.Body, "Zia Rosa") || !strings.Contains(p.Body, "zia@example.test") {
		t.Fatalf("payload = %+v", p)
	}
	// One push per request: not again on the next tick, nor for a repeat sign-in.
	g.ask("zia@example.test", "Zia Rosa")
	disp.Tick(t.Context())
	if rec.count() != 1 {
		t.Fatalf("pushes = %d, want still 1", rec.count())
	}
}

func TestARequestInQuietHoursIsPushedWhenTheyEnd(t *testing.T) {
	g := start(t)
	subscribe(t, g, testkit.UserEmail, "https://push.example/user", true)
	rec := &recorder{}
	disp := notifyhttp.DispatcherFor(g.env.DB)
	disp.SetSender(rec)

	g.env.Clock.Set(time.Date(2026, 11, 9, 23, 0, 0, 0, time.UTC)) // quiet hours are 22:00-07:00 by default
	g.ask("zia@example.test", "Zia")
	disp.Tick(t.Context())
	if rec.count() != 0 {
		t.Fatalf("pushed %d during quiet hours", rec.count())
	}
	g.env.Clock.Set(time.Date(2026, 11, 10, 7, 1, 0, 0, time.UTC))
	disp.Tick(t.Context())
	if rec.count() != 1 {
		t.Fatalf("pushes after quiet hours = %d, want 1", rec.count())
	}
}

func TestADeniedRequestIsNotPushedAfterTheFact(t *testing.T) {
	g := start(t)
	subscribe(t, g, testkit.UserEmail, "https://push.example/user", true)
	rec := &recorder{}
	disp := notifyhttp.DispatcherFor(g.env.DB)
	disp.SetSender(rec)
	g.env.Clock.Set(time.Date(2026, 11, 9, 23, 0, 0, 0, time.UTC))
	g.ask("zia@example.test", "Zia")
	user := g.env.LoginUser(t)
	user.Post("/api/access-requests/"+idString(g.idOf(user, "zia@example.test"))+"/deny", nil)
	g.env.Clock.Set(time.Date(2026, 11, 10, 7, 1, 0, 0, time.UTC))
	disp.Tick(t.Context())
	if rec.count() != 0 {
		t.Fatalf("a request answered during quiet hours must not be pushed later, pushes = %d", rec.count())
	}
}
