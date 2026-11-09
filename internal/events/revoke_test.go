package events_test

import (
	"bufio"
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/events"
)

// ownerServer serves the SSE handler with the owners named in the X-Owners header.
func ownerServer(b *events.Bus, opts ...events.HandlerOption) *httptest.Server {
	h := b.Handler(opts...)
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var keys []string
		for _, k := range strings.Split(r.Header.Get("X-Owners"), ",") {
			if k != "" {
				keys = append(keys, k)
			}
		}
		h.ServeHTTP(w, r.WithContext(events.WithOwners(r.Context(), keys...)))
	}))
}

type stream struct {
	lines chan string
	close func()
}

func open(t *testing.T, srv *httptest.Server, owners string) *stream {
	t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	req, _ := http.NewRequestWithContext(ctx, "GET", srv.URL, nil)
	req.Header.Set("X-Owners", owners)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	s := &stream{lines: make(chan string, 64), close: func() { cancel(); resp.Body.Close() }}
	t.Cleanup(s.close)
	go func() {
		sc := bufio.NewScanner(resp.Body)
		for sc.Scan() {
			s.lines <- sc.Text()
		}
		close(s.lines)
	}()
	if l := <-s.lines; l != ": connected" {
		t.Fatalf("first line = %q", l)
	}
	return s
}

// ended reports whether the server closed the stream within d, and whether any
// event line arrived before that.
func (s *stream) ended(d time.Duration) (closed, sawEvent bool) {
	deadline := time.After(d)
	for {
		select {
		case l, ok := <-s.lines:
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

func TestCloseOwnerEndsOnlyMatchingStreams(t *testing.T) {
	b := events.NewBus()
	srv := ownerServer(b)
	t.Cleanup(srv.Close) // after the stream cleanups below (LIFO): Close waits for open streams
	gone := open(t, srv, "user:1,session:10")
	otherSession := open(t, srv, "user:1,session:11")
	stranger := open(t, srv, "user:2,session:20")

	b.CloseOwner("session:10")
	if closed, _ := gone.ended(2 * time.Second); !closed {
		t.Fatal("stream owned by session:10 must be closed")
	}
	b.Publish("plan", 1)
	if closed, saw := otherSession.ended(100 * time.Millisecond); closed || !saw {
		t.Fatalf("other session must stay open and receive events (closed=%v saw=%v)", closed, saw)
	}

	b.CloseOwner("user:1")
	if closed, _ := otherSession.ended(2 * time.Second); !closed {
		t.Fatal("closing user:1 must close all of that user's streams")
	}
	b.Publish("plan", 2)
	if closed, saw := stranger.ended(100 * time.Millisecond); closed || !saw {
		t.Fatalf("user:2 must be unaffected (closed=%v saw=%v)", closed, saw)
	}
}

func TestClosedStreamGetsNoFurtherEvents(t *testing.T) {
	b := events.NewBus()
	srv := ownerServer(b)
	t.Cleanup(srv.Close) // after the stream cleanups below (LIFO): Close waits for open streams
	s := open(t, srv, "user:1")
	b.CloseOwner("user:1")
	b.Publish("plan", "secret") // published after revocation
	closed, saw := s.ended(2 * time.Second)
	if !closed || saw {
		t.Fatalf("closed=%v sawEvent=%v; want closed with no events", closed, saw)
	}
}

func TestCloseOwnerWithNoStreamsIsHarmless(t *testing.T) {
	events.NewBus().CloseOwner("user:99")
}

func TestRevalidateOnEveryPingEndsStreamWhenFalse(t *testing.T) {
	b := events.NewBus()
	var valid atomic.Bool
	valid.Store(true)
	srv := ownerServer(b,
		events.WithPingInterval(20*time.Millisecond),
		events.WithRevalidate(func(*http.Request) bool { return valid.Load() }),
	)
	t.Cleanup(srv.Close) // after the stream cleanups below (LIFO): Close waits for open streams
	s := open(t, srv, "")
	if closed, _ := s.ended(150 * time.Millisecond); closed {
		t.Fatal("stream must stay open while revalidation passes")
	}
	valid.Store(false)
	if closed, _ := s.ended(2 * time.Second); !closed {
		t.Fatal("stream must end at the next ping once revalidation fails")
	}
}
