package events_test

import (
	"bufio"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/events"
)

func recv(t *testing.T, ch <-chan events.Event) events.Event {
	t.Helper()
	select {
	case e, ok := <-ch:
		if !ok {
			t.Fatal("channel closed")
		}
		return e
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for event")
	}
	return events.Event{}
}

func expectNone(t *testing.T, ch <-chan events.Event) {
	t.Helper()
	select {
	case e := <-ch:
		t.Fatalf("unexpected event %+v", e)
	case <-time.After(50 * time.Millisecond):
	}
}

func TestPublishDeliversToTopicSubscribers(t *testing.T) {
	b := events.NewBus()
	plan, cancelPlan := b.Subscribe("plan")
	defer cancelPlan()
	all, cancelAll := b.Subscribe()
	defer cancelAll()

	b.Publish("plan", map[string]int{"week": 46})
	b.Publish("shopping", map[string]string{"x": "y"})

	e := recv(t, plan)
	if e.Topic != "plan" || string(e.Data) != `{"week":46}` {
		t.Fatalf("plan event = %+v", e)
	}
	expectNone(t, plan)

	if got := recv(t, all); got.Topic != "plan" {
		t.Fatalf("first all-topic event = %+v", got)
	}
	if got := recv(t, all); got.Topic != "shopping" {
		t.Fatalf("second all-topic event = %+v", got)
	}
}

func TestCancelStopsDeliveryAndClosesChannel(t *testing.T) {
	b := events.NewBus()
	ch, cancel := b.Subscribe("stock")
	cancel()
	cancel() // idempotent
	if _, ok := <-ch; ok {
		t.Fatal("channel must be closed after cancel")
	}
	b.Publish("stock", 1) // must not panic or block
}

func TestPublishNeverBlocksOnSlowSubscriber(t *testing.T) {
	b := events.NewBus()
	_, cancel := b.Subscribe("timers") // never read
	defer cancel()
	done := make(chan struct{})
	go func() {
		for i := 0; i < 500; i++ {
			b.Publish("timers", i)
		}
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("Publish blocked on a slow subscriber")
	}
}

func TestPublishWithUnmarshalableDataDoesNotPanic(t *testing.T) {
	b := events.NewBus()
	b.Publish("plan", make(chan int))
}

func TestSSEHandlerStreamsEvents(t *testing.T) {
	b := events.NewBus()
	srv := httptest.NewServer(b.Handler())
	defer srv.Close()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	req, _ := http.NewRequestWithContext(ctx, "GET", srv.URL+"?topics=plan", nil)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if ct := resp.Header.Get("Content-Type"); !strings.HasPrefix(ct, "text/event-stream") {
		t.Fatalf("Content-Type = %q", ct)
	}
	if resp.Header.Get("Cache-Control") != "no-cache" {
		t.Errorf("Cache-Control = %q, want no-cache", resp.Header.Get("Cache-Control"))
	}

	lines := make(chan string, 16)
	go func() {
		sc := bufio.NewScanner(resp.Body)
		for sc.Scan() {
			lines <- sc.Text()
		}
		close(lines)
	}()
	next := func() string {
		select {
		case l, ok := <-lines:
			if !ok {
				t.Fatal("stream ended")
			}
			return l
		case <-time.After(2 * time.Second):
			t.Fatal("timed out reading stream")
		}
		return ""
	}

	if l := next(); l != ": connected" {
		t.Fatalf("first line = %q, want ': connected'", l)
	}
	next() // blank separator

	// The handler has flushed ": connected", so the subscription is live.
	b.Publish("shopping", map[string]int{"ignored": 1})
	b.Publish("plan", map[string]int{"week": 46})

	if l := next(); l != "event: plan" {
		t.Fatalf("line = %q, want 'event: plan' (shopping must be filtered out)", l)
	}
	l := next()
	if !strings.HasPrefix(l, "data: ") {
		t.Fatalf("line = %q", l)
	}
	var got map[string]int
	if err := json.Unmarshal([]byte(strings.TrimPrefix(l, "data: ")), &got); err != nil || got["week"] != 46 {
		t.Fatalf("data = %q (%v)", l, err)
	}
}

func TestSSEHandlerUnsubscribesWhenClientLeaves(t *testing.T) {
	b := events.NewBus()
	srv := httptest.NewServer(b.Handler())
	defer srv.Close()
	ctx, cancel := context.WithCancel(context.Background())
	req, _ := http.NewRequestWithContext(ctx, "GET", srv.URL, nil)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	cancel()
	resp.Body.Close()
	time.Sleep(50 * time.Millisecond)
	done := make(chan struct{})
	go func() { b.Publish("plan", 1); close(done) }()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("Publish blocked after client left")
	}
}

func TestCloseEndsOpenStreams(t *testing.T) {
	b := events.NewBus()
	srv := httptest.NewServer(b.Handler())
	defer srv.Close()
	defer srv.CloseClientConnections() // runs first: a red run must not hang on the open stream
	resp, err := http.Get(srv.URL)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	br := bufio.NewReader(resp.Body)
	if _, err := br.ReadString('\n'); err != nil { // ": connected"
		t.Fatal(err)
	}
	b.Close()
	done := make(chan error, 1)
	go func() { _, err := io.Copy(io.Discard, resp.Body); done <- err }()
	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("stream should end cleanly, got %v", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("stream still open after Close")
	}
}

func TestCloseIsIdempotentAndLaterSubscriptionsEndAtOnce(t *testing.T) {
	b := events.NewBus()
	ch, cancel := b.Subscribe()
	b.Close()
	b.Close()
	select {
	case _, open := <-ch:
		if open {
			t.Fatal("channel should be closed after Close")
		}
	case <-time.After(time.Second):
		t.Fatal("channel not closed by Close")
	}
	cancel() // must not panic after Close
	late, cancelLate := b.Subscribe()
	defer cancelLate()
	select {
	case _, open := <-late:
		if open {
			t.Fatal("unexpected event")
		}
	case <-time.After(time.Second):
		t.Fatal("subscription after Close should be closed")
	}
	b.Publish("x", 1) // must not panic
}
