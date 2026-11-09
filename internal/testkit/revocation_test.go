package testkit_test

import (
	"bufio"
	"context"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/auth"
	"github.com/fabbarix/feeder-ng/internal/testkit"
)

// openStream opens GET /api/events with the session cookie of c.
func openStream(t *testing.T, env *testkit.Env, c *testkit.Client) chan string {
	t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	req, _ := http.NewRequestWithContext(ctx, "GET", env.URL()+"/api/events", nil)
	ck := c.Cookie(auth.CookieName)
	if ck == nil {
		t.Fatal("client has no session cookie")
	}
	req.AddCookie(ck)
	resp, err := http.DefaultClient.Do(req)
	if err != nil || resp.StatusCode != 200 {
		t.Fatalf("open stream: %v %v", resp, err)
	}
	t.Cleanup(func() { cancel(); resp.Body.Close() })
	lines := make(chan string, 64)
	go func() {
		sc := bufio.NewScanner(resp.Body)
		for sc.Scan() {
			lines <- sc.Text()
		}
		close(lines)
	}()
	if l := <-lines; l != ": connected" {
		t.Fatalf("first line = %q", l)
	}
	return lines
}

// drain reports whether the stream ended within d and whether an event arrived.
func drain(lines chan string, d time.Duration) (closed, sawEvent bool) {
	deadline := time.After(d)
	for {
		select {
		case l, ok := <-lines:
			if !ok {
				return true, sawEvent
			}
			if strings.HasPrefix(l, "event:") {
				sawEvent = true
			}
		case <-deadline:
			return false, sawEvent
		}
	}
}

func TestRemovingAUserClosesTheirOpenEventStreams(t *testing.T) {
	env := testkit.Start(t)
	cook := env.AddUser(t, "cook@example.test", "Cook", false)
	phone := openStream(t, env, env.LoginAs(t, cook.Email))
	tablet := openStream(t, env, env.LoginAs(t, cook.Email))
	bystander := openStream(t, env, env.LoginUser(t))

	if err := env.Auth.DeleteUser(t.Context(), cook.ID); err != nil {
		t.Fatal(err)
	}
	env.App.Deps.Events.Publish("plan", map[string]int{"week": 46}) // after removal
	for name, s := range map[string]chan string{"phone": phone, "tablet": tablet} {
		if closed, saw := drain(s, 2*time.Second); !closed || saw {
			t.Errorf("%s stream: closed=%v sawEvent=%v; want closed, no events", name, closed, saw)
		}
	}
	if closed, saw := drain(bystander, 200*time.Millisecond); closed || !saw {
		t.Errorf("other User's stream must stay open and live: closed=%v saw=%v", closed, saw)
	}
}

func TestLogoutClosesOnlyThatSessionsStream(t *testing.T) {
	env := testkit.Start(t)
	phone := env.LoginUser(t)
	tablet := env.LoginUser(t)
	phoneStream := openStream(t, env, phone)
	tabletStream := openStream(t, env, tablet)

	if r := phone.Post("/api/logout", nil); r.Status != 204 {
		t.Fatalf("logout = %d", r.Status)
	}
	env.App.Deps.Events.Publish("shopping", 1)
	if closed, saw := drain(phoneStream, 2*time.Second); !closed || saw {
		t.Errorf("logged-out stream: closed=%v saw=%v; want closed, no events", closed, saw)
	}
	if closed, saw := drain(tabletStream, 200*time.Millisecond); closed || !saw {
		t.Errorf("other session's stream must stay open: closed=%v saw=%v", closed, saw)
	}
}
