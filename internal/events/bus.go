// Package events is the in-process publish/subscribe bus and the SSE endpoint
// that streams it to the SPA.
package events

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"
)

const (
	bufferSize = 64
	pingEvery  = 25 * time.Second
)

// Event is one published message.
type Event struct {
	Topic string
	Data  json.RawMessage
}

type subscriber struct {
	topics  map[string]struct{} // nil means every topic
	owners  []string            // revocation keys this stream belongs to
	ch      chan Event
	revoked chan struct{} // closed by CloseOwner
}

// Bus fans published events out to subscribers. Publish never blocks.
type Bus struct {
	mu   sync.Mutex
	subs map[*subscriber]struct{}
}

// NewBus returns an empty bus.
func NewBus() *Bus { return &Bus{subs: map[*subscriber]struct{}{}} }

// Publish sends data on topic to every matching subscriber. Data that cannot
// be marshalled is dropped. A subscriber whose buffer is full misses the event.
func (b *Bus) Publish(topic string, data any) {
	raw, err := json.Marshal(data)
	if err != nil {
		return
	}
	ev := Event{Topic: topic, Data: raw}
	b.mu.Lock()
	defer b.mu.Unlock()
	for s := range b.subs {
		if s.topics != nil {
			if _, ok := s.topics[topic]; !ok {
				continue
			}
		}
		select {
		case s.ch <- ev:
		default:
		}
	}
}

// Subscribe returns a channel of events for the given topics (all topics when
// none are given) and a cancel func that closes the channel. Cancel is
// idempotent.
func (b *Bus) Subscribe(topics ...string) (<-chan Event, func()) {
	s := b.subscribe(nil, topics)
	return s.ch, b.cancelFunc(s)
}

func (b *Bus) subscribe(owners []string, topics []string) *subscriber {
	s := &subscriber{ch: make(chan Event, bufferSize), owners: owners, revoked: make(chan struct{})}
	if len(topics) > 0 {
		s.topics = make(map[string]struct{}, len(topics))
		for _, t := range topics {
			s.topics[t] = struct{}{}
		}
	}
	b.mu.Lock()
	b.subs[s] = struct{}{}
	b.mu.Unlock()
	return s
}

func (b *Bus) cancelFunc(s *subscriber) func() {
	var once sync.Once
	return func() {
		once.Do(func() {
			b.mu.Lock()
			defer b.mu.Unlock()
			delete(b.subs, s)
			close(s.ch)
		})
	}
}

// CloseOwner ends every stream registered under key (see WithOwners). Those
// streams receive no further events, and their handlers return. Idempotent.
func (b *Bus) CloseOwner(key string) {
	b.mu.Lock()
	defer b.mu.Unlock()
	for s := range b.subs {
		for _, o := range s.owners {
			if o == key {
				delete(b.subs, s)
				close(s.revoked)
				break
			}
		}
	}
}

type ownersKey struct{}

// WithOwners tags ctx with the revocation keys that streams opened under it
// belong to. Handler registers the stream under those keys.
func WithOwners(ctx context.Context, keys ...string) context.Context {
	return context.WithValue(ctx, ownersKey{}, keys)
}

func ownersFrom(ctx context.Context) []string {
	keys, _ := ctx.Value(ownersKey{}).([]string)
	return keys
}

// HandlerOption configures Handler.
type HandlerOption func(*handlerOptions)

type handlerOptions struct {
	pingEvery  time.Duration
	revalidate func(*http.Request) bool
}

// WithPingInterval sets how often a keep-alive ping is written (default 25 s).
func WithPingInterval(d time.Duration) HandlerOption {
	return func(o *handlerOptions) { o.pingEvery = d }
}

// WithRevalidate checks every stream at each ping. When fn returns false the
// stream ends. It is a second line of defence behind CloseOwner.
func WithRevalidate(fn func(*http.Request) bool) HandlerOption {
	return func(o *handlerOptions) { o.revalidate = fn }
}

// Handler streams events as Server-Sent Events. The optional ?topics=a,b query
// parameter filters the stream. The stream is registered under the owner keys
// found in the request context (see WithOwners).
func (b *Bus) Handler(opts ...HandlerOption) http.Handler {
	o := handlerOptions{pingEvery: pingEvery}
	for _, opt := range opts {
		opt(&o)
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		flusher, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, "streaming unsupported", http.StatusInternalServerError)
			return
		}
		var topics []string
		for _, t := range strings.Split(r.URL.Query().Get("topics"), ",") {
			if t = strings.TrimSpace(t); t != "" {
				topics = append(topics, t)
			}
		}
		s := b.subscribe(ownersFrom(r.Context()), topics)
		cancel := b.cancelFunc(s)
		defer cancel()

		h := w.Header()
		h.Set("Content-Type", "text/event-stream")
		h.Set("Cache-Control", "no-cache")
		h.Set("X-Accel-Buffering", "no")
		w.WriteHeader(http.StatusOK)
		fmt.Fprint(w, ": connected\n\n")
		flusher.Flush()

		ping := time.NewTicker(o.pingEvery)
		defer ping.Stop()
		for {
			select {
			case <-r.Context().Done():
				return
			case <-s.revoked:
				return
			case ev, open := <-s.ch:
				if !open {
					return
				}
				select {
				case <-s.revoked: // revoked while this event was queued
					return
				default:
				}
				fmt.Fprintf(w, "event: %s\ndata: %s\n\n", ev.Topic, ev.Data)
				flusher.Flush()
			case <-ping.C:
				if o.revalidate != nil && !o.revalidate(r) {
					return
				}
				fmt.Fprint(w, ": ping\n\n")
				flusher.Flush()
			}
		}
	})
}

// Close ends every open stream and makes later subscriptions end at once, so
// a server shutdown does not wait on SSE connections. Idempotent.
func (b *Bus) Close() {
	// stub: implemented by the Developer
}
